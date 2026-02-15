# GameRemoteServer

A simple Node.js WebSocket server that pairs PC and Android clients and relays input packets from Android to PC.

## Features

- WebSocket server (`ws://localhost:37841`)
- Session management with a 6-digit pairing code
- Pairing `pc` and `android` roles under the same code
- Token-based pairing validation between devices
- Android -> PC input relay
- JSON-based packet protocol
- Console logs for connections, packets, and errors

## Requirements

- Node.js 18+ (recommended)
- npm

## Installation

```bash
npm install
```

## Run

```bash
npm start
```

Default port: `37841`  
To run on a different port:

```bash
PORT=5000 npm start
```

PowerShell:

```powershell
$env:PORT=5000; npm start
```

## Packet Protocol

All messages are JSON.

### 1. Register

Each client must register first.

```json
{
  "type": "register",
  "role": "pc",
  "code": "123456",
  "token": "ABCD1234"
}
```

- `role`: `pc` or `android`
- `code`: 6-digit numeric code (if omitted, the server generates one)
- `token`: shared session token (required for Android; recommended for PC)

### 2. Input (Android -> PC)

Example packet sent by Android:

```json
{
  "type": "input",
  "code": "123456",
  "token": "ABCD1234",
  "target": "pc",
  "command": "move",
  "params": {
    "direction": "up"
  }
}
```

The server forwards this packet to the paired PC client.

## Server Responses (Examples)

- `hello`: initial message on connection
- `registered`: registration successful
- `peer_connected`: paired device connected
- `peer_disconnected`: paired device disconnected
- `input_ack`: input packet delivered
- `error`: invalid packet / role / code / target

## Quick Test Flow

1. PC client connects and sends `register` with `role: "pc"`.
2. Android client connects with the same `code` and `token` and `role: "android"`.
3. Android sends an `input` packet.
4. PC client receives the forwarded `input` packet.

## Security Notes

- Do not run this setup on shared/public PCs.
- Keep pairing code and token private.
- The server masks sensitive fields in logs and expires inactive sessions.

## Clients

- Android client: `android-client/`
- Java PC client: `pc-client/`
