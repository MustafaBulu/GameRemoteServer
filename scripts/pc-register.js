const WebSocket = require("ws");
const screenshot = require("screenshot-desktop");

const url = process.env.WS_URL || "ws://localhost:37841";
const code = process.env.PAIR_CODE || "123456";
const token = process.env.PAIR_TOKEN || "ABCD1234";
const frameMs = Number(process.env.FRAME_MS || 600);
const frameFormat = process.env.FRAME_FORMAT || "jpg";

const ws = new WebSocket(url);
let frameTimer = null;
let streaming = false;

function send(payload) {
  ws.send(JSON.stringify(payload));
}

ws.on("open", () => {
  console.log("PC relay connected:", url);
  console.log("Use on Android -> code:", code, "token:", token);
  send({ type: "register", role: "pc", code, token });
});

ws.on("message", (data) => {
  const text = data.toString();
  console.log("SERVER:", text);
  try {
    const msg = JSON.parse(text);
    if (msg.type === "registered" && msg.role === "pc" && !streaming) {
      startStreaming();
    }
    if (msg.type === "input") {
      console.log("INPUT:", msg.command, msg.params || {});
    }
  } catch {
    // ignore
  }
});

ws.on("close", () => {
  stopStreaming();
  console.log("PC relay disconnected.");
});

ws.on("error", (err) => {
  stopStreaming();
  console.error("PC relay error:", err.message);
});

function startStreaming() {
  streaming = true;
  frameTimer = setInterval(async () => {
    try {
      if (ws.readyState !== WebSocket.OPEN) return;
      const img = await screenshot({ format: frameFormat });
      const frame = img.toString("base64");
      send({
        type: "frame",
        code,
        token,
        target: "android",
        format: frameFormat,
        frame
      });
    } catch (e) {
      console.error("FRAME_ERROR:", e.message);
    }
  }, frameMs);
}

function stopStreaming() {
  streaming = false;
  if (frameTimer) {
    clearInterval(frameTimer);
    frameTimer = null;
  }
}
