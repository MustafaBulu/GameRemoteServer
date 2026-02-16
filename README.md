# GameRemoteServer (WebRTC Edition)

This project is upgraded to a WebRTC-based architecture to target high frame rate screen streaming (up to 60 FPS depending on device/network/GPU).

## What changed

- Replaced frame-by-frame base64 relay as main path with WebRTC video streaming.
- Node server now works as:
  - signaling server (`/ws`)
  - static file server for web clients
- Low-latency video: PC shares display with `getDisplayMedia`.
- Input commands are sent from viewer to PC over WebRTC data channel.

## Run

```bash
npm install
npm start
```

For game input (click/arrow) on Windows PC, run local input agent in another terminal:

```bash
npm run pc:agent
```

Server URLs:

- PC broadcaster page: `http://localhost:37841/pc.html`
- Android viewer page: `http://localhost:37841/android.html`
- Android app built-in viewer: open app and tap `Open WebRTC Viewer`

Legacy websocket relay server is still available:

```bash
npm run start:legacy
```

## Pairing

Use the same values on both pages:

- `code`: 6-digit number (example `123456`)
- `token`: shared secret (example `ABCD1234`)

## Planned Features

- Random code generation (used for device pairing)

## 60 FPS notes

WebRTC can reach 60 FPS, but actual FPS depends on:

- hardware encoder availability
- network quality
- browser/device limits
- selected screen resolution

For better FPS:

- use Chrome/Edge on PC
- keep both devices on strong local Wi-Fi
- stream a single monitor/window when possible

## Files

- `webrtc-server.js`: signaling + static web server
- `web-client/pc.html`: PC broadcaster
- `web-client/android.html`: Android viewer
- `scripts/pc-input-agent.js`: local Windows input bridge (mouse/keyboard)
- `server.js`: old relay server (legacy path)
