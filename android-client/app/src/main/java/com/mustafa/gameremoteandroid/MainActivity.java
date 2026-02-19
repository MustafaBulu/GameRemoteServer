package com.mustafa.gameremoteandroid;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.widget.TextView;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

import com.google.android.material.button.MaterialButton;
import com.journeyapps.barcodescanner.ScanContract;
import com.journeyapps.barcodescanner.ScanOptions;

public class MainActivity extends AppCompatActivity {

    private TextView statusText;
    private TextView hintText;

    private final ActivityResultLauncher<ScanOptions> qrScanLauncher =
        registerForActivityResult(new ScanContract(), result -> {
            String raw = result != null ? result.getContents() : null;
            if (raw == null || raw.trim().isEmpty()) {
                statusText.setText("Status: QR scan canceled.");
                return;
            }
            ConnectionParams params = parseConnectionUri(Uri.parse(raw.trim()));
            if (params == null) {
                statusText.setText("Status: Invalid QR content.");
                hintText.setText("Use QR from PC page.");
                return;
            }
            statusText.setText("Status: QR received.");
            hintText.setText("Connecting...");
            openWebRtcViewer(params.wsUrl, params.code, params.token);
        });

    private final ActivityResultLauncher<String> cameraPermissionLauncher =
        registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
            if (Boolean.TRUE.equals(granted)) {
                launchQrScanner();
            } else {
                statusText.setText("Status: Camera permission denied.");
            }
        });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        statusText = findViewById(R.id.tvStatus);
        hintText = findViewById(R.id.tvHint);
        MaterialButton scanQrButton = findViewById(R.id.btnScanQr);

        statusText.setText("Status: Waiting for QR/deep link...");
        hintText.setText("Open via QR or direct link from PC page.");
        scanQrButton.setOnClickListener(v -> startQrFlow());
        applyDeepLinkIntent(getIntent(), true);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        applyDeepLinkIntent(intent, true);
    }

    private void openWebRtcViewer(String wsUrl, String code, String token) {
        if (wsUrl.isEmpty() || !code.matches("^\\d{6}$") || token.length() < 4) {
            statusText.setText("Status: Invalid link parameters.");
            return;
        }

        Intent intent = new Intent(this, WebRtcViewerActivity.class);
        intent.putExtra("ws_url", wsUrl);
        intent.putExtra("pair_code", code);
        intent.putExtra("pair_token", token);
        startActivity(intent);
        statusText.setText("Status: Opening native WebRTC viewer...");
    }

    private void startQrFlow() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            launchQrScanner();
            return;
        }
        cameraPermissionLauncher.launch(Manifest.permission.CAMERA);
    }

    private void launchQrScanner() {
        ScanOptions options = new ScanOptions();
        options.setDesiredBarcodeFormats(ScanOptions.QR_CODE);
        options.setPrompt("Scan pairing QR");
        options.setBeepEnabled(false);
        options.setOrientationLocked(false);
        qrScanLauncher.launch(options);
    }

    private void applyDeepLinkIntent(Intent intent, boolean autoOpen) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data == null) return;
        ConnectionParams params = parseConnectionUri(data);
        if (params == null) {
            statusText.setText("Status: Invalid deep link parameters.");
            return;
        }

        statusText.setText("Status: Deep link received.");
        hintText.setText("Connecting...");

        if (autoOpen) {
            openWebRtcViewer(params.wsUrl, params.code, params.token);
        }
    }

    private ConnectionParams parseConnectionUri(Uri data) {
        if (data == null) return null;
        String code = trimOrEmpty(data.getQueryParameter("code"));
        String token = trimOrEmpty(data.getQueryParameter("token"));
        if (!code.matches("^\\d{6}$") || token.length() < 4) return null;

        String scheme = trimOrEmpty(data.getScheme()).toLowerCase();
        String ws = trimOrEmpty(data.getQueryParameter("ws"));

        if ("gameremote".equals(scheme) && "connect".equalsIgnoreCase(trimOrEmpty(data.getHost()))) {
            if (ws.isEmpty()) return null;
            return new ConnectionParams(ws, code, token);
        }

        if ("http".equals(scheme) || "https".equals(scheme)) {
            String host = trimOrEmpty(data.getHost());
            if (host.isEmpty()) return null;
            String wsScheme = "https".equals(scheme) ? "wss" : "ws";
            int port = data.getPort();
            String wsUrl = port > 0 ? wsScheme + "://" + host + ":" + port + "/ws" : wsScheme + "://" + host + "/ws";
            return new ConnectionParams(wsUrl, code, token);
        }

        return null;
    }

    private String trimOrEmpty(String s) {
        return s == null ? "" : s.trim();
    }

    private static final class ConnectionParams {
        final String wsUrl;
        final String code;
        final String token;

        ConnectionParams(String wsUrl, String code, String token) {
            this.wsUrl = wsUrl;
            this.code = code;
            this.token = token;
        }
    }
}
