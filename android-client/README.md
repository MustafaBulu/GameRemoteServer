# Android Client (Java)

This folder contains a simple Android client for `GameRemoteServer`.

## What it does

- Connects to the WebSocket server
- Registers as `android` with a 6-digit pairing code
- Sends `input` packets (`up`, `down`, `left`, `right`)
- Shows server responses in a log view

## Open in Android Studio

1. Open Android Studio.
2. Choose **Open** and select the `android-client` folder.
3. Let Gradle sync.
4. Run the `app` module.

## Server URL notes

- Android emulator -> use `ws://10.0.2.2:37841`
- Real phone on same Wi-Fi -> use your PC LAN IP, e.g. `ws://192.168.1.50:37841`

## Expected flow

1. Start Node.js server from repo root:
   - `npm install`
   - `npm start`
2. In Android app, enter server URL and pairing code (example: `123456`).
3. Tap **Connect**.
4. Press direction buttons to send input packets.
