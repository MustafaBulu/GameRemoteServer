const WebSocket = require("ws");

const url = process.env.WS_URL || "ws://localhost:37841";
const code = process.env.PAIR_CODE || "123456";
const token = process.env.PAIR_TOKEN || "ABCD1234";

const ws = new WebSocket(url);

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
    if (msg.type === "input") {
      console.log("INPUT:", msg.command, msg.params || {});
    }
  } catch {
    // ignore
  }
});

ws.on("close", () => {
  console.log("PC relay disconnected.");
});

ws.on("error", (err) => {
  console.error("PC relay error:", err.message);
});

