const WebSocket = require("ws");

const server = require("../server");

const URL = "ws://localhost:37841";
const code = "123456";
const token = "ABCD1234";

let gotRelay = false;
let timeout;

function done(ok, message) {
  clearTimeout(timeout);
  if (ok) {
    console.log("E2E_OK:", message);
    process.exit(0);
  } else {
    console.error("E2E_FAIL:", message);
    process.exit(1);
  }
}

const pc = new WebSocket(URL);
const android = new WebSocket(URL);
let androidOpened = false;
let pcRegistered = false;

pc.on("open", () => {
  pc.send(JSON.stringify({ type: "register", role: "pc", code, token }));
});

pc.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "registered" && msg.role === "pc") {
    pcRegistered = true;
    if (androidOpened) {
      android.send(JSON.stringify({ type: "register", role: "android", code, token }));
    }
  }
  if (msg.type === "input" && msg.command === "move" && msg.params?.direction === "up") {
    gotRelay = true;
    done(true, "Android input relayed to PC.");
  }
});

android.on("open", () => {
  androidOpened = true;
  if (pcRegistered) {
    android.send(JSON.stringify({ type: "register", role: "android", code, token }));
  }
});

android.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "registered" && msg.role === "android") {
    android.send(
      JSON.stringify({
        type: "input",
        code,
        token,
        target: "pc",
        command: "move",
        params: { direction: "up" }
      })
    );
  }
});

pc.on("error", (e) => done(false, `PC socket error: ${e.message}`));
android.on("error", (e) => done(false, `Android socket error: ${e.message}`));

timeout = setTimeout(() => {
  if (!gotRelay) done(false, "Timeout waiting for relayed input.");
}, 5000);
