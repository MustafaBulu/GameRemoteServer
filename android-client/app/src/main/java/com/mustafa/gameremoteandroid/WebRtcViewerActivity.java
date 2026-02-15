package com.mustafa.gameremoteandroid;

import android.annotation.SuppressLint;
import android.content.pm.ActivityInfo;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.appcompat.app.AppCompatActivity;

public class WebRtcViewerActivity extends AppCompatActivity {

    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        setContentView(R.layout.activity_webrtc_viewer);

        webView = findViewById(R.id.webView);
        String wsUrl = safe(getIntent().getStringExtra("ws_url"));
        String code = safe(getIntent().getStringExtra("pair_code"));
        String token = safe(getIntent().getStringExtra("pair_token"));

        if (wsUrl.isEmpty() || !code.matches("^\\d{6}$") || token.length() < 4) {
            finish();
            return;
        }

        String viewerUrl = toHttp(wsUrl) + "/android.html?code=" + code + "&token=" + token + "&v=" + System.currentTimeMillis();

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);

        webView.clearCache(true);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.loadUrl(viewerUrl);
    }

    private static String safe(String v) {
        return v == null ? "" : v.trim();
    }

    private String toHttp(String wsUrl) {
        if (wsUrl.startsWith("ws://")) {
            return "http://" + wsUrl.substring(5);
        }
        if (wsUrl.startsWith("wss://")) {
            return "https://" + wsUrl.substring(6);
        }
        return wsUrl;
    }
}
