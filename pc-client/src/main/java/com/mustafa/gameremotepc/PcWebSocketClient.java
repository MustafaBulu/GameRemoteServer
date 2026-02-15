package com.mustafa.gameremotepc;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import org.json.JSONObject;

public class PcWebSocketClient {

    public interface Listener {
        void onOpen();
        void onMessage(String text);
        void onClosed(String reason);
        void onFailure(String error);
    }

    private final OkHttpClient httpClient = new OkHttpClient();
    private final Listener listener;
    private WebSocket socket;

    public PcWebSocketClient(Listener listener) {
        this.listener = listener;
    }

    public void connect(String serverUrl) {
        Request request = new Request.Builder().url(serverUrl).build();
        socket = httpClient.newWebSocket(request, new WebSocketListener() {
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
            public void onFailure(WebSocket webSocket, Throwable t, Response response) {
                String message = t.getMessage() == null ? "Unknown error" : t.getMessage();
                listener.onFailure(message);
            }
        });
    }

    public void registerPc(String code, String token) {
        JSONObject payload = new JSONObject();
        payload.put("type", "register");
        payload.put("role", "pc");
        payload.put("code", code);
        payload.put("token", token);
        send(payload);
    }

    public void disconnect() {
        if (socket != null) {
            socket.close(1000, "Client disconnect");
            socket = null;
        }
    }

    private void send(JSONObject payload) {
        if (socket != null) {
            socket.send(payload.toString());
        }
    }
}
