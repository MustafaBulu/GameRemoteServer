const WebSocket = require("ws");
const { execFile } = require("child_process");

const AGENT_PORT = Number(process.env.AGENT_PORT || 40123);
const HOST = "127.0.0.1";

function ps(command, cb) {
  execFile(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { windowsHide: true, timeout: 4000 },
    (err, stdout, stderr) => cb(err, stdout, stderr)
  );
}

function clickAt(xNorm, yNorm) {
  const x = Number.isFinite(xNorm) ? Math.max(0, Math.min(1, xNorm)) : 0.5;
  const y = Number.isFinite(yNorm) ? Math.max(0, Math.min(1, yNorm)) : 0.5;
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@
$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$x=[int]($b.X + $b.Width*${x})
$y=[int]($b.Y + $b.Height*${y})
[Win32]::SetCursorPos($x,$y) | Out-Null
[Win32]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero)
[Win32]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero)
`;
  ps(script, () => {});
}

function sendArrow(direction) {
  const map = {
    up: "{UP}",
    down: "{DOWN}",
    left: "{LEFT}",
    right: "{RIGHT}"
  };
  const key = map[direction];
  if (!key) return;
  const script = `
$ws = New-Object -ComObject WScript.Shell
$ws.SendKeys("${key}")
`;
  ps(script, () => {});
}

const wss = new WebSocket.Server({ host: HOST, port: AGENT_PORT });

wss.on("connection", (ws) => {
  console.log("PC input agent: browser connected.");
  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg?.type !== "input") return;
    if (msg.command === "tap") {
      const x = Number(msg?.params?.x);
      const y = Number(msg?.params?.y);
      clickAt(x, y);
      return;
    }
    if (msg.command === "move") {
      sendArrow(msg?.params?.direction);
    }
  });
});

wss.on("listening", () => {
  console.log(`PC input agent listening on ws://${HOST}:${AGENT_PORT}`);
  console.log("Keep this process running while playing.");
});
