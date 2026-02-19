package com.mustafa.gameremoteandroid;

import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.URLUtil;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class WebRtcViewerActivity extends AppCompatActivity {
    private static final String SHOT_CHANNEL_ID = "shot_downloads";
    private static final String SHOT_CHANNEL_NAME = "Screenshots";
    private static final String TAG = "WebRtcViewerActivity";
    private final ActivityResultLauncher<String> notificationPermissionLauncher =
        registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
            if (!Boolean.TRUE.equals(granted)) {
                Toast.makeText(this, "Notification permission denied", Toast.LENGTH_SHORT).show();
            }
        });
    private final ActivityResultLauncher<String> storagePermissionLauncher =
        registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
            if (!Boolean.TRUE.equals(granted)) {
                Toast.makeText(this, "Storage permission denied", Toast.LENGTH_SHORT).show();
            }
        });

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        setContentView(R.layout.activity_webrtc_viewer);
        enableImmersiveMode();
        ensureNotificationChannel();
        ensureNotificationPermission();
        ensureLegacyStoragePermission();

        WebView webView = findViewById(R.id.webView);
        String wsUrl = safe(getIntent().getStringExtra("ws_url"));
        String code = safe(getIntent().getStringExtra("pair_code"));
        String token = safe(getIntent().getStringExtra("pair_token"));

        if (wsUrl.isEmpty() || !code.matches("^\\d{6}$") || token.length() < 4) {
            finish();
            return;
        }

        String viewerUrl = buildViewerUrl(wsUrl, code, token);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);

        webView.clearCache(true);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            try {
                String fileName = URLUtil.guessFileName(url, contentDisposition, mimetype);
                DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                req.setMimeType(mimetype);
                req.addRequestHeader("User-Agent", userAgent);
                req.setTitle(fileName);
                req.setDescription("Saving screenshot...");
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
                DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                if (dm != null) {
                    dm.enqueue(req);
                }
            } catch (Exception ex) {
                Log.w(TAG, "DownloadManager request failed", ex);
                Toast.makeText(WebRtcViewerActivity.this, "Screenshot download request failed", Toast.LENGTH_SHORT).show();
            }
        });
        webView.loadUrl(viewerUrl);
    }

    private final class AndroidBridge {
        @JavascriptInterface
        public void saveImage(String dataUrl, String fileName) {
            if (dataUrl == null || dataUrl.trim().isEmpty()) return;
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && !hasLegacyStoragePermission()) {
                runOnUiThread(() -> {
                    storagePermissionLauncher.launch(android.Manifest.permission.WRITE_EXTERNAL_STORAGE);
                    Toast.makeText(WebRtcViewerActivity.this, "Storage permission required for screenshot", Toast.LENGTH_SHORT).show();
                });
                return;
            }
            final String name = (fileName == null || fileName.trim().isEmpty())
                ? "remote-full-" + System.currentTimeMillis() + ".png"
                : fileName.trim();
            new Thread(() -> {
                String payload = dataUrl.trim();
                int comma = payload.indexOf(',');
                if (comma >= 0) payload = payload.substring(comma + 1);
                byte[] bytes;
                try {
                    bytes = Base64.decode(payload, Base64.DEFAULT);
                } catch (Exception ex) {
                    Log.w(TAG, "Screenshot decode failed", ex);
                    runOnUiThread(() -> Toast.makeText(WebRtcViewerActivity.this, "Screenshot decode failed", Toast.LENGTH_SHORT).show());
                    return;
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    saveToMediaStore(bytes, name);
                } else {
                    saveToLegacyDownloads(bytes, name);
                }
            }).start();
        }

        private void saveToMediaStore(byte[] bytes, String name) {
            OutputStream os = null;
            Uri uri = null;
            try {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, name);
                values.put(MediaStore.Downloads.MIME_TYPE, "image/png");
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                values.put(MediaStore.Downloads.IS_PENDING, 1);

                uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IllegalStateException("insert failed");
                os = getContentResolver().openOutputStream(uri);
                if (os == null) throw new IllegalStateException("openOutputStream failed");
                os.write(bytes);
                os.flush();

                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                getContentResolver().update(uri, values, null, null);

                final Uri finalUri = uri;
                runOnUiThread(() -> {
                    Toast.makeText(WebRtcViewerActivity.this, "Saved to Downloads: " + name, Toast.LENGTH_SHORT).show();
                    showSavedNotification(finalUri, name);
                });
            } catch (Exception ex) {
                Log.w(TAG, "Saving screenshot to MediaStore failed", ex);
                if (uri != null) {
                    try {
                        getContentResolver().delete(uri, null, null);
                    } catch (Exception cleanupEx) {
                        Log.w(TAG, "MediaStore cleanup failed", cleanupEx);
                    }
                }
                runOnUiThread(() -> Toast.makeText(WebRtcViewerActivity.this, "Screenshot save failed", Toast.LENGTH_SHORT).show());
            } finally {
                if (os != null) {
                    try {
                        os.close();
                    } catch (Exception closeEx) {
                        Log.w(TAG, "Output stream close failed", closeEx);
                    }
                }
            }
        }

        private void saveToLegacyDownloads(byte[] bytes, String name) {
            File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            File out = new File(dir, name);
            try (FileOutputStream fos = new FileOutputStream(out)) {
                fos.write(bytes);
                fos.flush();
                final Uri uri = Uri.fromFile(out);
                runOnUiThread(() -> {
                    Toast.makeText(WebRtcViewerActivity.this, "Saved: " + out.getAbsolutePath(), Toast.LENGTH_SHORT).show();
                    showSavedNotification(uri, name);
                });
            } catch (Exception ex) {
                Log.w(TAG, "Saving screenshot to legacy Downloads failed", ex);
                runOnUiThread(() -> Toast.makeText(WebRtcViewerActivity.this, "Screenshot save failed", Toast.LENGTH_SHORT).show());
            }
        }

        private void showSavedNotification(Uri uri, String name) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                    && ContextCompat.checkSelfPermission(WebRtcViewerActivity.this, android.Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                    return;
                }
                Intent openIntent = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "image/png")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    flags |= PendingIntent.FLAG_IMMUTABLE;
                }
                PendingIntent pi = PendingIntent.getActivity(
                    WebRtcViewerActivity.this,
                    (int) (System.currentTimeMillis() & 0x7FFFFFFF),
                    openIntent,
                    flags
                );

                NotificationCompat.Builder b = new NotificationCompat.Builder(WebRtcViewerActivity.this, SHOT_CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.stat_sys_download_done)
                    .setContentTitle("Screenshot saved")
                    .setContentText(name)
                    .setAutoCancel(true)
                    .setContentIntent(pi)
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT);

                NotificationManagerCompat.from(WebRtcViewerActivity.this)
                    .notify((int) (System.currentTimeMillis() & 0x7FFFFFFF), b.build());
            } catch (Exception ex) {
                Log.w(TAG, "Notification for saved screenshot failed", ex);
                Toast.makeText(WebRtcViewerActivity.this, "Saved, but notification failed", Toast.LENGTH_SHORT).show();
            }
        }
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel existing = nm.getNotificationChannel(SHOT_CHANNEL_ID);
        if (existing != null) return;
        NotificationChannel ch = new NotificationChannel(
            SHOT_CHANNEL_ID,
            SHOT_CHANNEL_NAME,
            NotificationManager.IMPORTANCE_DEFAULT
        );
        ch.setDescription("Screenshot saved notifications");
        nm.createNotificationChannel(ch);
    }

    private void ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED) {
            return;
        }
        notificationPermissionLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS);
    }

    private boolean hasLegacyStoragePermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) return true;
        return ContextCompat.checkSelfPermission(this, android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
            == PackageManager.PERMISSION_GRANTED;
    }

    private void ensureLegacyStoragePermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) return;
        if (hasLegacyStoragePermission()) return;
        storagePermissionLauncher.launch(android.Manifest.permission.WRITE_EXTERNAL_STORAGE);
    }

    @Override
    protected void onResume() {
        super.onResume();
        enableImmersiveMode();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enableImmersiveMode();
        }
    }

    private void enableImmersiveMode() {
        if (getSupportActionBar() != null) {
            getSupportActionBar().hide();
        }
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (controller == null) return;
        controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }

    private static String safe(String v) {
        return v == null ? "" : v.trim();
    }

    private String buildViewerUrl(String wsUrl, String code, String token) {
        String base = wsUrl;
        if (base.startsWith("ws://")) {
            base = "http://" + base.substring(5);
        } else if (base.startsWith("wss://")) {
            base = "https://" + base.substring(6);
        }

        if (base.endsWith("/ws")) {
            base = base.substring(0, base.length() - 3);
        }
        if (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return base + "/android.html?code=" + code + "&token=" + token + "&native=0&v=" + System.currentTimeMillis();
    }
}
