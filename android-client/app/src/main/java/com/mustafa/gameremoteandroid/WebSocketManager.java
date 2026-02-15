package com.mustafa.gameremoteandroid;

import androidx.annotation.Nullable;

import org.json.JSONException;
import org.json.JSONObject;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

public class WebSocketManager {

    public interface Listener {
        void onOpen();
        void onMessage(String text);
        void onClosed(String reason);
        void onFailure(String error);
    }

    private final OkHttpClient client = new OkHttpClient();
    private final Listener listener;
    private WebSocket webSocket;

    public WebSocketManager(Listener listener) {
        this.listener = listener;
    }

    public void connect(String serverUrl) {
        Request request = new Request.Builder().url(serverUrl).build();
        webSocket = client.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onOpen(WebSocket webSocket, Response response) {
                listener.onOpen();
            }

            @Override
            public void onMessage(WebSocket webSocket, String text) {
                listener.onMessage(text);
            }

            @Override
            public void onClosed(WebSocket webSocket, int code, String reason) {
                listener.onClosed("code=" + code + " reason=" + reason);
            }

            @Override
            public void onFailure(WebSocket webSocket, Throwable t, @Nullable Response response) {
                listener.onFailure(t.getMessage() == null ? "Unknown error" : t.getMessage());
            }
        });
    }

    public void registerAndroid(String code) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("type", "register");
            payload.put("role", "android");
            payload.put("code", code);
            send(payload);
        } catch (JSONException ignored) {
        }
    }

    public void sendInput(String code, String direction) {
        try {
            JSONObject params = new JSONObject();
            params.put("direction", direction);

            JSONObject payload = new JSONObject();
            payload.put("type", "input");
            payload.put("code", code);
            payload.put("target", "pc");
            payload.put("command", "move");
            payload.put("params", params);
            send(payload);
        } catch (JSONException ignored) {
        }
    }

    public void disconnect() {
        if (webSocket != null) {
            webSocket.close(1000, "Client disconnect");
            webSocket = null;
        }
    }

    private void send(JSONObject payload) {
        if (webSocket != null) {
            webSocket.send(payload.toString());
        }
    }
}
