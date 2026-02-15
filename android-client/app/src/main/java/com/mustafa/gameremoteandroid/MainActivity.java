package com.mustafa.gameremoteandroid;

import android.os.Bundle;
import android.text.method.ScrollingMovementMethod;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity implements WebSocketManager.Listener {

    private EditText serverUrlInput;
    private EditText codeInput;
    private EditText tokenInput;
    private TextView statusText;
    private TextView logText;

    private WebSocketManager webSocketManager;
    private boolean connected = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        serverUrlInput = findViewById(R.id.etServerUrl);
        codeInput = findViewById(R.id.etCode);
        tokenInput = findViewById(R.id.etToken);
        statusText = findViewById(R.id.tvStatus);
        logText = findViewById(R.id.tvLog);
        logText.setMovementMethod(new ScrollingMovementMethod());

        Button connectButton = findViewById(R.id.btnConnect);
        Button disconnectButton = findViewById(R.id.btnDisconnect);
        Button upButton = findViewById(R.id.btnUp);
        Button downButton = findViewById(R.id.btnDown);
        Button leftButton = findViewById(R.id.btnLeft);
        Button rightButton = findViewById(R.id.btnRight);

        webSocketManager = new WebSocketManager(this);

        connectButton.setOnClickListener(v -> connectAndRegister());
        disconnectButton.setOnClickListener(v -> {
            webSocketManager.disconnect();
            connected = false;
            setStatus("Disconnected");
        });

        upButton.setOnClickListener(v -> sendDirection("up"));
        downButton.setOnClickListener(v -> sendDirection("down"));
        leftButton.setOnClickListener(v -> sendDirection("left"));
        rightButton.setOnClickListener(v -> sendDirection("right"));
    }

    private void connectAndRegister() {
        String url = serverUrlInput.getText().toString().trim();
        String code = codeInput.getText().toString().trim();
        String token = tokenInput.getText().toString().trim();

        if (url.isEmpty() || code.length() != 6 || token.length() < 4) {
            appendLog("Enter valid ws:// URL, 6-digit code and token.");
            return;
        }

        setStatus("Connecting...");
        webSocketManager.connect(url);
    }

    private void sendDirection(String direction) {
        if (!connected) {
            appendLog("Not connected.");
            return;
        }
        String code = codeInput.getText().toString().trim();
        String token = tokenInput.getText().toString().trim();
        webSocketManager.sendInput(code, token, direction);
        appendLog("Sent input: " + direction);
    }

    @Override
    public void onOpen() {
        runOnUiThread(() -> {
            connected = true;
            setStatus("Connected");
            String code = codeInput.getText().toString().trim();
            String token = tokenInput.getText().toString().trim();
            webSocketManager.registerAndroid(code, token);
            appendLog("Connected and register sent.");
        });
    }

    @Override
    public void onMessage(String text) {
        runOnUiThread(() -> appendLog("Server: " + text));
    }

    @Override
    public void onClosed(String reason) {
        runOnUiThread(() -> {
            connected = false;
            setStatus("Closed");
            appendLog("Closed: " + reason);
        });
    }

    @Override
    public void onFailure(String error) {
        runOnUiThread(() -> {
            connected = false;
            setStatus("Error");
            appendLog("Error: " + error);
        });
    }

    private void setStatus(String value) {
        statusText.setText("Status: " + value);
    }

    private void appendLog(String line) {
        logText.append(line + "\n");
    }

    @Override
    protected void onDestroy() {
        webSocketManager.disconnect();
        super.onDestroy();
    }
}
