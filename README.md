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

### One Command Run (Docker + Host Agent)

`pc-input-agent` controls Windows mouse/keyboard, so it should run on host (not in container).
You can still start/stop everything with one command:

```bash
npm run up:all
```

Stop all:

```bash
npm run down:all
```

Optional tunnel service (for quick public testing):

```bash
docker compose -f docker-compose.yml --profile quick_tunnel up -d
```

### Stable Public Access (Named Tunnel + Optional TURN)

1. Create `.env.named` from template:

```bash
cp .env.named.example .env.named
```

2. Fill:

- `TUNNEL_TOKEN`
- `PUBLIC_BASE_URL`
- (recommended) TURN settings: `TURN_URL`, `TURN_USERNAME`, `TURN_PASSWORD`, `TURN_EXTERNAL_IP`, `TURN_REALM`

3. Run:

```bash
# PowerShell
Get-Content .env.named | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
  $k,$v = $_ -split '=',2
  [Environment]::SetEnvironmentVariable($k,$v,'Process')
}
npm run up:named
```

4. Stop:

```bash
npm run down:named
```

## Run on a Server (Same Wi-Fi Not Required)

You can run this project on a public VPS/cloud server:

- Use `deploy/docker-compose.prod.yml` with:
  - `app` (Node signaling/static server)
  - `nginx` (reverse proxy)
  - `coturn` (TURN server for NAT traversal)
- Open port `80` (+ TURN ports `3478`, `5349`, `49160-49200/udp`)
- Keep the input agent running on the Windows PC where the game is running

### Production Quick Start (Docker)

1. Copy env template:

```bash
cd deploy
cp .env.prod.example .env.prod
```

2. Edit `.env.prod`:

- `DOMAIN`
- `PUBLIC_BASE_URL` (mobile/cellular users must open this public URL)
- `TURN_EXTERNAL_IP`
- `TURN_REALM`
- `TURN_USERNAME`
- `TURN_PASSWORD`

3. Start stack:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

4. Open:

- PC broadcaster: `https://<DOMAIN>/pc.html`
- Android viewer: `https://<DOMAIN>/android.html`

Notes:

- `webrtc-server.js` reads ICE config from env and exposes it via `/api/pair` (`iceServers`).
- Browser clients use runtime `iceServers` from server response.
- For advanced ICE setup you can provide `ICE_SERVERS_JSON` as an env var (JSON array).
- `deploy/nginx.conf` handles WebSocket upgrade for `/ws`.

## Pairing

Pairing credentials are generated server-side and shown on `pc.html`:

- `code`: 6-digit pairing code
- `token`: shared secret

Use the same `code + token` on both PC and Android clients.

Security behavior:

- Token/code rotate after first successful pairing
- Pair expires if Android does not connect within timeout (`PAIR_WAIT_TIMEOUT_MS`)

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
- `deploy/docker-compose.prod.yml`: production stack
- `deploy/nginx.conf`: reverse proxy config
- `deploy/.env.prod.example`: production env template
- `server.js`: legacy relay server

## Legacy Mode

To run the legacy websocket relay mode:

```bash
npm run start:legacy
```
