const http = require("http");
const path = require("path");
const fs = require("fs");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT || 37841);
const WEB_ROOT = path.join(__dirname, "web-client");
const SESSION_TTL_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 30 * 1000;
const MAX_SIGNAL_SIZE = 256 * 1024;

// code -> { pc: WebSocket|null, android: WebSocket|null, token: string, lastActivity: number }
const sessions = new Map();
// ws -> { code: string, role: "pc"|"android" }
const clientMeta = new Map();

function log(msg, extra = "") {
  console.log(`[${new Date().toISOString()}] ${msg}`, extra);
}

function normalizeRole(role) {
  if (typeof role !== "string") return null;
  const r = role.toLowerCase();
  return r === "pc" || r === "android" ? r : null;
}

function normalizeCode(code) {
  if (typeof code !== "string") return null;
  const c = code.trim();
  return /^\d{6}$/.test(c) ? c : null;
}

function normalizeToken(token) {
  if (typeof token !== "string") return null;
  const t = token.trim();
  return /^[A-Za-z0-9_-]{4,64}$/.test(t) ? t : null;
}

function maskCode(code) {
  if (!code || code.length < 4) return "******";
  return `${code.slice(0, 2)}**${code.slice(-2)}`;
}

function safeSend(ws, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function getOrCreateSession(code) {
  if (!sessions.has(code)) {
    sessions.set(code, { pc: null, android: null, token: "", lastActivity: Date.now() });
  }
  return sessions.get(code);
}

function cleanupClient(ws) {
  const meta = clientMeta.get(ws);
  if (!meta) return;
  const { code, role } = meta;
  const s = sessions.get(code);
  if (s && s[role] === ws) {
    s[role] = null;
    s.lastActivity = Date.now();
    const otherRole = role === "pc" ? "android" : "pc";
    safeSend(s[otherRole], { type: "peer_disconnected", role, code });
    if (!s.pc && !s.android) {
      sessions.delete(code);
      log("Session removed", `code=${maskCode(code)}`);
    }
  }
  clientMeta.delete(ws);
}

function handleRegister(ws, msg) {
  const role = normalizeRole(msg.role);
  let code = normalizeCode(msg.code);
  const providedToken = normalizeToken(msg.token);
  if (!role) return safeSend(ws, { type: "error", message: "Invalid role." });
  if (!code) return safeSend(ws, { type: "error", message: "Invalid code." });

  const prev = clientMeta.get(ws);
  if (prev) cleanupClient(ws);

  const s = getOrCreateSession(code);
  const token = s.token || providedToken;
  if (!token) return safeSend(ws, { type: "error", message: "Missing token." });

  if (role === "android" && (!providedToken || providedToken !== s.token)) {
    return safeSend(ws, { type: "error", message: "Invalid token." });
  }

  if (role === "pc" && s.token && (!providedToken || providedToken !== s.token)) {
    return safeSend(ws, { type: "error", message: "Invalid token." });
  }

  const current = s[role];
  if (current && current !== ws && current.readyState === WebSocket.OPEN) {
    return safeSend(ws, { type: "error", message: `${role} already connected.` });
  }

  s[role] = ws;
  s.token = token;
  s.lastActivity = Date.now();
  clientMeta.set(ws, { role, code });

  const paired = Boolean(s.pc && s.android);
  safeSend(ws, { type: "registered", role, code, token: role === "pc" ? token : undefined, paired });

  const otherRole = role === "pc" ? "android" : "pc";
  safeSend(s[otherRole], { type: "peer_connected", role, code });
  log("Registered", `role=${role} code=${maskCode(code)} paired=${paired}`);
}

function handleSignal(ws, msg) {
  const meta = clientMeta.get(ws);
  if (!meta) return safeSend(ws, { type: "error", message: "Not registered." });
  const { code, role } = meta;
  const s = sessions.get(code);
  if (!s) return safeSend(ws, { type: "error", message: "Session not found." });

  const token = normalizeToken(msg.token);
  if (!token || token !== s.token) return safeSend(ws, { type: "error", message: "Invalid token." });

  const target = normalizeRole(msg.target);
  if (!target || target === role) return safeSend(ws, { type: "error", message: "Invalid target." });
  if (!msg.data || typeof msg.data !== "object") return safeSend(ws, { type: "error", message: "Invalid signal payload." });

  const raw = JSON.stringify(msg.data);
  if (raw.length > MAX_SIGNAL_SIZE) return safeSend(ws, { type: "error", message: "Signal too large." });

  safeSend(s[target], {
    type: "signal",
    code,
    from: role,
    data: msg.data
  });
  s.lastActivity = Date.now();
}

function handleMessage(ws, text) {
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return safeSend(ws, { type: "error", message: "Invalid JSON." });
  }

  if (!msg || typeof msg.type !== "string") return safeSend(ws, { type: "error", message: "Missing type." });
  if (msg.type === "register") return handleRegister(ws, msg);
  if (msg.type === "signal") return handleSignal(ws, msg);
  safeSend(ws, { type: "error", message: `Unsupported type: ${msg.type}` });
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  return "text/plain; charset=utf-8";
}

const httpServer = http.createServer((req, res) => {
  const reqPath = new URL(req.url, "http://localhost").pathname;
  const url = reqPath === "/" ? "/android.html" : reqPath;
  const safePath = path.normalize(url).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(WEB_ROOT, safePath);
  if (!filePath.startsWith(WEB_ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0"
    });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server: httpServer, path: "/ws" });
wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress || "unknown";
  log("WS client connected", `ip=${ip.replace(/\d+$/, "x")}`);
  safeSend(ws, { type: "hello", message: "Use register + signal messages." });

  ws.on("message", (data) => handleMessage(ws, data.toString()));
  ws.on("close", () => cleanupClient(ws));
  ws.on("error", (e) => log("WS error", e.message));
});

setInterval(() => {
  const now = Date.now();
  for (const [code, s] of sessions.entries()) {
    if (!s.pc && !s.android && now - s.lastActivity > SESSION_TTL_MS) {
      sessions.delete(code);
      log("Session expired", `code=${maskCode(code)}`);
    }
  }
}, CLEANUP_INTERVAL_MS);

httpServer.listen(PORT, () => {
  log(`WebRTC signaling server: http://localhost:${PORT}`);
  log(`PC page: http://localhost:${PORT}/pc.html`);
  log(`Android page: http://localhost:${PORT}/android.html`);
});
