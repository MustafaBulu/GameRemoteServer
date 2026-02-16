# GameRemoteServer (WebRTC Edition)

A WebRTC-based project for low-latency PC screen streaming to Android with remote control support.

## Table of Contents

- Features
- How It Works
- Quick Start (Local)
- Run on a Server (Same Wi-Fi Not Required)
- Pairing
- Performance Notes
- Troubleshooting
- Project Structure
- Legacy Mode

## Features

- WebRTC screen streaming (low latency, high FPS target)
- Android-side click, scroll, and text input
- WebSocket signaling (`/ws`)
- Local Windows input agent (`npm run pc:agent`)
- Quick screenshot button on Android viewer (left side camera button)

## How It Works

- `WebSocket`: used only for signaling and control messages
- `WebRTC`: used for video/audio media transport
- On PC, `getDisplayMedia(..., audio: true)` is used to capture system audio

Note: Enable `Share audio / System audio` in the browser screen-share dialog for audio capture.

## Quick Start (Local)

```bash
npm install
npm start
```

Run the input agent on the Windows PC in a separate terminal:

```bash
npm run pc:agent
```

Default pages:

- PC broadcaster: `http://localhost:37841/pc.html`
- Android viewer: `http://localhost:37841/android.html`

## Run on a Server (Same Wi-Fi Not Required)

You can run this project on a public VPS/cloud server:

- Host `webrtc-server.js` on a public server
- Open `pc.html` and `android.html` via domain or public IP
- Devices do not need to be on the same Wi-Fi network; internet access is enough

Recommendations:

- Use `HTTPS/WSS` in production
- Open port `37841` in firewall/security group
- Keep the input agent running on the Windows PC where the game is running

## Pairing

When the server starts, it generates pairing credentials once and prints them in the terminal:

- `code`: 6-digit pairing code
- `token`: shared secret

Use the same `code + token` on both PC and Android clients.

## Performance Notes

Actual FPS depends on:

- Hardware encoder availability
- Network quality/latency
- Browser and device limits
- Shared screen resolution

For better results:

- Use Chrome/Edge on PC
- Share a single window/monitor when possible
- Reduce unnecessary background load

## Troubleshooting

- No audio:
  - Check if `Share audio / System audio` is enabled in screen share
  - Use a browser/share mode that supports audio capture
- Connection issues:
  - Verify `code/token` values are identical on both sides
  - Verify server reachability and open port (`37841`)
- Input not working:
  - Make sure `npm run pc:agent` is running on the PC

## Project Structure

- `webrtc-server.js`: signaling + static web server
- `web-client/pc.html`: PC broadcaster page
- `web-client/android.html`: Android viewer page
- `scripts/pc-input-agent.js`: Windows input bridge
- `server.js`: legacy relay server

## Legacy Mode

To run the legacy websocket relay mode:

```bash
npm run start:legacy
```
