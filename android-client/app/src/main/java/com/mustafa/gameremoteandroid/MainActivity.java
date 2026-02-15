package com.mustafa.gameremoteandroid;

import android.content.Intent;
import android.os.Bundle;
import android.widget.EditText;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.button.MaterialButton;

public class MainActivity extends AppCompatActivity {

    private static final String PREFS = "game_remote_prefs";
    private static final String KEY_WS_URL = "ws_url";
    private static final String KEY_CODE = "pair_code";
    private static final String KEY_TOKEN = "pair_token";

    private static final String DEFAULT_WS_URL = "ws://10.0.2.2:37841";
    private static final String DEFAULT_CODE = "123456";
    private static final String DEFAULT_TOKEN = "ABCD1234";

    private EditText serverUrlInput;
    private EditText codeInput;
    private EditText tokenInput;
    private TextView statusText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        serverUrlInput = findViewById(R.id.etServerUrl);
        codeInput = findViewById(R.id.etCode);
        tokenInput = findViewById(R.id.etToken);
        statusText = findViewById(R.id.tvStatus);

        MaterialButton openViewerButton = findViewById(R.id.btnOpenWebRtc);
        MaterialButton emulatorPresetButton = findViewById(R.id.btnPresetEmulator);

        preloadDefaults();
        openViewerButton.setOnClickListener(v -> openWebRtcViewer());
        emulatorPresetButton.setOnClickListener(v -> serverUrlInput.setText("ws://10.0.2.2:37841"));
    }

    private void openWebRtcViewer() {
        String wsUrl = serverUrlInput.getText().toString().trim();
        String code = codeInput.getText().toString().trim();
        String token = tokenInput.getText().toString().trim();

        if (wsUrl.isEmpty() || !code.matches("^\\d{6}$") || token.length() < 4) {
            statusText.setText("Status: Enter valid ws:// URL, 6-digit code, token.");
            return;
        }

        getSharedPreferences(PREFS, MODE_PRIVATE)
            .edit()
            .putString(KEY_WS_URL, wsUrl)
            .putString(KEY_CODE, code)
            .putString(KEY_TOKEN, token)
            .apply();

        Intent intent = new Intent(this, WebRtcViewerActivity.class);
        intent.putExtra("ws_url", wsUrl);
        intent.putExtra("pair_code", code);
        intent.putExtra("pair_token", token);
        startActivity(intent);
        statusText.setText("Status: Opening native WebRTC viewer...");
    }

    private void preloadDefaults() {
        String ws = getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_WS_URL, DEFAULT_WS_URL);
        String code = getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_CODE, DEFAULT_CODE);
        String token = getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_TOKEN, DEFAULT_TOKEN);

        serverUrlInput.setText(ws);
        codeInput.setText(code);
        tokenInput.setText(token);
    }
}
