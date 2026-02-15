package com.mustafa.gameremotepc;

import org.json.JSONObject;

import javax.swing.JButton;
import javax.swing.JCheckBox;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTextArea;
import javax.swing.JTextField;
import javax.swing.SwingUtilities;
import java.awt.BorderLayout;
import java.awt.GridLayout;
import java.util.ArrayDeque;
import java.util.Set;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class PcClientFrame extends JFrame implements PcWebSocketClient.Listener {
    private static final Set<String> ALLOWED_COMMANDS = Set.of("move");
    private static final Set<String> ALLOWED_DIRECTIONS = Set.of("up", "down", "left", "right");
    private static final int MAX_INPUTS_PER_SECOND = 12;

    private final JTextField urlField = new JTextField("ws://localhost:37841");
    private final JTextField codeField = new JTextField("123456");
    private final JTextField tokenField = new JTextField(generateToken());
    private final JLabel statusLabel = new JLabel("Status: Disconnected");
    private final JCheckBox enableControlCheckbox = new JCheckBox("Enable local input control");
    private final JTextArea logArea = new JTextArea();
    private final ArrayDeque<Long> inputTimestamps = new ArrayDeque<>();

    private final PcWebSocketClient webSocketClient;
    private final InputExecutor inputExecutor = new InputExecutor();
    private boolean connected;

    public PcClientFrame() {
        super("Game Remote PC Client");
        this.webSocketClient = new PcWebSocketClient(this);
        initUi();
    }

    private void initUi() {
        setSize(650, 480);
        setLocationRelativeTo(null);
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);

        JPanel form = new JPanel(new GridLayout(0, 1, 8, 8));
        form.add(new JLabel("Server URL"));
        form.add(urlField);
        form.add(new JLabel("Pairing Code (6 digits)"));
        form.add(codeField);
        form.add(new JLabel("Session Token (share only with your phone)"));
        form.add(tokenField);
        form.add(statusLabel);
        form.add(enableControlCheckbox);

        JPanel actions = new JPanel();
        JButton connectButton = new JButton("Connect");
        JButton disconnectButton = new JButton("Disconnect");
        JButton newTokenButton = new JButton("Generate Token");
        actions.add(connectButton);
        actions.add(disconnectButton);
        actions.add(newTokenButton);

        connectButton.addActionListener(e -> connect());
        disconnectButton.addActionListener(e -> disconnect());
        newTokenButton.addActionListener(e -> tokenField.setText(generateToken()));

        logArea.setEditable(false);
        JScrollPane logPane = new JScrollPane(logArea);

        JPanel top = new JPanel(new BorderLayout());
        top.add(form, BorderLayout.CENTER);
        top.add(actions, BorderLayout.SOUTH);

        add(top, BorderLayout.NORTH);
        add(logPane, BorderLayout.CENTER);
    }

    private void connect() {
        String url = urlField.getText().trim();
        String code = codeField.getText().trim();
        String token = tokenField.getText().trim();
        if (url.isEmpty() || !code.matches("^\\d{6}$") || token.length() < 4) {
            appendLog("Provide valid URL, 6-digit code and token (>=4 chars).");
            return;
        }
        statusLabel.setText("Status: Connecting...");
        webSocketClient.connect(url);
    }

    private void disconnect() {
        webSocketClient.disconnect();
        connected = false;
        statusLabel.setText("Status: Disconnected");
    }

    @Override
    public void onOpen() {
        SwingUtilities.invokeLater(() -> {
            connected = true;
            statusLabel.setText("Status: Connected");
            webSocketClient.registerPc(codeField.getText().trim(), tokenField.getText().trim());
            appendLog("Connected. Register packet sent.");
        });
    }

    @Override
    public void onMessage(String text) {
        SwingUtilities.invokeLater(() -> {
            appendLog("Server: " + text);
            handleServerMessage(text);
        });
    }

    private void handleServerMessage(String text) {
        try {
            JSONObject json = new JSONObject(text);
            String type = json.optString("type");
            if ("registered".equals(type) && json.has("token")) {
                tokenField.setText(json.optString("token", tokenField.getText().trim()));
            }
            if ("input".equals(type)) {
                String command = json.optString("command");
                if (!ALLOWED_COMMANDS.contains(command)) {
                    appendLog("Blocked input: command not allowed (" + command + ").");
                    return;
                }
                JSONObject params = json.optJSONObject("params");
                String direction = params == null ? "" : params.optString("direction");
                if (!ALLOWED_DIRECTIONS.contains(direction)) {
                    appendLog("Blocked input: direction not allowed (" + direction + ").");
                    return;
                }
                if (enableControlCheckbox.isSelected()) {
                    if (!canExecuteInputNow()) {
                        appendLog("Blocked input: rate limit exceeded.");
                        return;
                    }
                    inputExecutor.executeMove(direction);
                    appendLog("Executed input: " + direction);
                } else {
                    appendLog("Input received but control is disabled.");
                }
            }
        } catch (Exception ignored) {
            appendLog("Could not parse incoming packet.");
        }
    }

    @Override
    public void onClosed(String reason) {
        SwingUtilities.invokeLater(() -> {
            connected = false;
            statusLabel.setText("Status: Closed");
            appendLog("Closed: " + reason);
        });
    }

    @Override
    public void onFailure(String error) {
        SwingUtilities.invokeLater(() -> {
            connected = false;
            statusLabel.setText("Status: Error");
            appendLog("Error: " + error);
        });
    }

    private void appendLog(String line) {
        String ts = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss"));
        logArea.append("[" + ts + "] " + line + "\n");
    }

    private boolean canExecuteInputNow() {
        long now = System.currentTimeMillis();
        long minTimestamp = now - 1000;
        while (!inputTimestamps.isEmpty() && inputTimestamps.peekFirst() < minTimestamp) {
            inputTimestamps.removeFirst();
        }
        if (inputTimestamps.size() >= MAX_INPUTS_PER_SECOND) {
            return false;
        }
        inputTimestamps.addLast(now);
        return true;
    }

    private static String generateToken() {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        StringBuilder out = new StringBuilder(8);
        for (int i = 0; i < 8; i++) {
            out.append(chars.charAt((int) (Math.random() * chars.length())));
        }
        return out.toString();
    }
}
