const WebSocket = require("ws");
const { spawn } = require("child_process");

const AGENT_PORT = Number(process.env.AGENT_PORT || 40123);
const HOST = "127.0.0.1";

// Single persistent PowerShell worker to avoid per-click process spawn latency.
const workerScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, int dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@

$ws = New-Object -ComObject WScript.Shell
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds

function Get-Vk([string]$k) {
  switch ($k) {
    'up' { return 0x26 }
    'down' { return 0x28 }
    'left' { return 0x25 }
    'right' { return 0x27 }
    'enter' { return 0x0D }
    'backspace' { return 0x08 }
    'esc' { return 0x1B }
    'tab' { return 0x09 }
    'home' { return 0x24 }
    'end' { return 0x23 }
    'f1' { return 0x70 }
    'f2' { return 0x71 }
    'f3' { return 0x72 }
    'f4' { return 0x73 }
    'f5' { return 0x74 }
    'f6' { return 0x75 }
    'f7' { return 0x76 }
    'f8' { return 0x77 }
    'f9' { return 0x78 }
    'f10' { return 0x79 }
    'f11' { return 0x7A }
    'f12' { return 0x7B }
    'ctrl' { return 0x11 }
    'shift' { return 0x10 }
    'alt' { return 0x12 }
    'space' { return 0x20 }
    default { return -1 }
  }
}

function Get-VkExtended([string]$k) {
  $vk = Get-Vk($k)
  if ($vk -ge 0) { return $vk }
  if ([string]::IsNullOrWhiteSpace($k)) { return -1 }
  if ($k.Length -eq 1) {
    $ch = [char]$k.ToUpperInvariant()
    $code = [int][char]$ch
    if (($code -ge 0x41 -and $code -le 0x5A) -or ($code -ge 0x30 -and $code -le 0x39)) {
      return $code
    }
  }
  return -1
}

while (($line = [Console]::In.ReadLine()) -ne $null) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $parts = $line.Split(' ')
  if ($parts[0] -eq 'T' -and $parts.Length -ge 4) {
    $xNorm = [double]$parts[1]
    $yNorm = [double]$parts[2]
    $btn = $parts[3]
    if ($xNorm -lt 0) { $xNorm = 0 } elseif ($xNorm -gt 1) { $xNorm = 1 }
    if ($yNorm -lt 0) { $yNorm = 0 } elseif ($yNorm -gt 1) { $yNorm = 1 }
    $x = [int]($bounds.X + $bounds.Width * $xNorm)
    $y = [int]($bounds.Y + $bounds.Height * $yNorm)
    [Win32]::SetCursorPos($x, $y) | Out-Null
    if ($btn -eq 'right') {
      [Win32]::mouse_event(0x0008, 0, 0, 0, [UIntPtr]::Zero)
      [Win32]::mouse_event(0x0010, 0, 0, 0, [UIntPtr]::Zero)
    } else {
      [Win32]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
      [Win32]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
    }
  } elseif ($parts[0] -eq 'K' -and $parts.Length -ge 2) {
    $k = $parts[1]
    $vk = Get-VkExtended($k)
    if ($vk -ge 0) {
      [Win32]::keybd_event([byte]$vk, 0, 0, [UIntPtr]::Zero)
      [Win32]::keybd_event([byte]$vk, 0, 0x0002, [UIntPtr]::Zero)
    } elseif ($k -eq 'power') {
      Start-Process rundll32.exe -ArgumentList 'user32.dll,LockWorkStation'
    } elseif ($k -eq 'fn') {
      # Fn is hardware-level and generally cannot be synthesized from user mode.
    }
  } elseif ($parts[0] -eq 'D' -and $parts.Length -ge 2) {
    $k = $parts[1]
    $vk = Get-VkExtended($k)
    if ($vk -ge 0) {
      [Win32]::keybd_event([byte]$vk, 0, 0, [UIntPtr]::Zero)
    }
  } elseif ($parts[0] -eq 'U' -and $parts.Length -ge 2) {
    $k = $parts[1]
    $vk = Get-VkExtended($k)
    if ($vk -ge 0) {
      [Win32]::keybd_event([byte]$vk, 0, 0x0002, [UIntPtr]::Zero)
    }
  } elseif ($parts[0] -eq 'P' -and $parts.Length -ge 2) {
    $b64 = $parts[1]
    $txt = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64))
    Set-Clipboard -Value $txt
    $ws.SendKeys('^v')
  } elseif ($parts[0] -eq 'S' -and $parts.Length -ge 2) {
    $amount = [int]$parts[1]
    if ($amount -gt 6) { $amount = 6 }
    elseif ($amount -lt -6) { $amount = -6 }
    if ($amount -ne 0) {
      [Win32]::mouse_event(0x0800, 0, 0, 120 * $amount, [UIntPtr]::Zero)
    }
  }
}
`;

const ps = spawn(
  "powershell.exe",
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", workerScript],
  { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] }
);

ps.stderr.on("data", (d) => {
  const msg = d.toString().trim();
  if (msg) console.error("PS_WORKER_ERR:", msg);
});

ps.on("exit", (code) => {
  console.error("PowerShell worker exited:", code);
});

function sendTap(xNorm, yNorm) {
  if (!ps.stdin.writable) return;
  const x = Number.isFinite(xNorm) ? Math.max(0, Math.min(1, xNorm)) : 0.5;
  const y = Number.isFinite(yNorm) ? Math.max(0, Math.min(1, yNorm)) : 0.5;
  const now = Date.now();
  if (now - lastTapTs < 14 && Math.abs(x - lastTapX) < 0.003 && Math.abs(y - lastTapY) < 0.003) {
    return;
  }
  lastTapTs = now;
  lastTapX = x;
  lastTapY = y;
  const button = pendingTapButton || "left";
  pendingTapButton = "left";
  ps.stdin.write(`T ${x} ${y} ${button}\n`);
}

function sendKey(key) {
  if (!ps.stdin.writable) return;
  const k = typeof key === "string" ? key.trim().toLowerCase() : "";
  if (!k) return;
  ps.stdin.write(`K ${k}\n`);
}

function sendKeyState(key, action) {
  if (!ps.stdin.writable) return;
  const k = typeof key === "string" ? key.trim().toLowerCase() : "";
  const a = typeof action === "string" ? action.trim().toLowerCase() : "";
  if (!k) return;
  if (a === "down") {
    ps.stdin.write(`D ${k}\n`);
    return;
  }
  if (a === "up") {
    ps.stdin.write(`U ${k}\n`);
  }
}

function sendText(text) {
  if (!ps.stdin.writable) return;
  const value = typeof text === "string" ? text : "";
  if (!value.trim()) return;
  const b64 = Buffer.from(value, "utf8").toString("base64");
  ps.stdin.write(`P ${b64}\n`);
}

function sendScroll(delta) {
  if (!ps.stdin.writable) return;
  const d = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  if (d === 0) return;
  ps.stdin.write(`S ${d}\n`);
}

const wss = new WebSocket.Server({ host: HOST, port: AGENT_PORT });
let lastTapTs = 0;
let lastTapX = 0.5;
let lastTapY = 0.5;
let pendingTapButton = "left";

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
      pendingTapButton = msg?.params?.button === "right" ? "right" : "left";
      sendTap(Number(msg?.params?.x), Number(msg?.params?.y));
      return;
    }
    if (msg.command === "move") {
      sendKey(msg?.params?.direction);
      return;
    }
    if (msg.command === "key") {
      sendKey(msg?.params?.key);
      return;
    }
    if (msg.command === "key_state") {
      sendKeyState(msg?.params?.key, msg?.params?.action);
      return;
    }
    if (msg.command === "text") {
      sendText(msg?.params?.text);
      return;
    }
    if (msg.command === "scroll") {
      sendScroll(Number(msg?.params?.delta));
    }
  });
});

wss.on("listening", () => {
  console.log(`PC input agent listening on ws://${HOST}:${AGENT_PORT}`);
  console.log("Keep this process running while playing.");
});

process.on("exit", () => {
  try { ps.stdin.end(); } catch {}
  try { ps.kill(); } catch {}
});
