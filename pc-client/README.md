# PC Client (Java Swing)

Desktop client for `GameRemoteServer` that connects as `pc`, receives input packets, and can execute arrow key actions locally.

## Security defaults

- Local input execution is **disabled by default**
- A session token is required for pairing
- Incoming commands are restricted by allowlist (`move` + `up/down/left/right`)
- Input execution is rate-limited (max 12 inputs/second)
- Use only on your personal machine, not on shared/public PCs

## Requirements

- Java 17+
- Maven 3.9+

## Run

```bash
cd pc-client
mvn -q exec:java
```

## How to use

1. Start Node server from repo root:
   - `npm install`
   - `npm start`
2. Open PC client.
3. Enter:
   - Server URL (`ws://localhost:37841`)
   - 6-digit pairing code
   - token (or click `Generate Token`)
4. Click `Connect`.
5. Enter the same code and token on Android client.
6. Enable `Enable local input control` only when you want to allow key actions.
