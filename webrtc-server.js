const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const os = require("os");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT || 37841);
const WEB_ROOT = path.join(__dirname, "web-client");
const SESSION_TTL_MS = 10 * 60 * 1000;
const PAIR_WAIT_TIMEOUT_MS = Number(process.env.PAIR_WAIT_TIMEOUT_MS || 3 * 60 * 1000);
const CLEANUP_INTERVAL_MS = 30 * 1000;
const MAX_SIGNAL_SIZE = 256 * 1024;
const DEFAULT_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");

// code -> { pc: WebSocket|null, android: WebSocket|null, token: string, lastActivity: number, waitingSince: number|null, pairedOnce: boolean }
const sessions = new Map();
// ws -> { code: string, role: "pc"|"android" }
const clientMeta = new Map();
let activePair = generatePair();
const ICE_SERVERS = buildIceServers();

function generatePair() {
  return {
    code: String(crypto.randomInt(0, 1000000)).padStart(6, "0"),
    createdAt: Date.now()
  };
}

function rotateActivePair(reason) {
  activePair = generatePair();
  log("Pair rotated", `reason=${reason} code=${maskCode(activePair.code)}`);
}

function sanitizeIceServer(item) {
  if (!item || typeof item !== "object") return null;
  const rawUrls = item.urls;
  const urls = Array.isArray(rawUrls) ? rawUrls.filter((u) => typeof u === "string" && u.trim()) : (typeof rawUrls === "string" && rawUrls.trim() ? rawUrls.trim() : null);
  if (!urls || (Array.isArray(urls) && !urls.length)) return null;
  const out = { urls };
  if (typeof item.username === "string" && item.username.trim()) out.username = item.username.trim();
  if (typeof item.credential === "string" && item.credential.trim()) out.credential = item.credential.trim();
  return out;
}

function buildIceServers() {
  const fromJson = process.env.ICE_SERVERS_JSON;
  if (fromJson) {
    try {
      const parsed = JSON.parse(fromJson);
      if (Array.isArray(parsed)) {
        const clean = parsed.map(sanitizeIceServer).filter(Boolean);
        if (clean.length) return clean;
      }
    } catch (e) {
      log("Invalid ICE_SERVERS_JSON, fallback to env defaults", e.message);
    }
  }

  const out = [];
  const stunUrls = String(process.env.STUN_URLS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (stunUrls.length) out.push({ urls: stunUrls });
  const turnUrl = String(process.env.TURN_URL || "").trim();
  const turnUsername = String(process.env.TURN_USERNAME || "").trim();
  const turnCredential = String(process.env.TURN_PASSWORD || "").trim();
  if (turnUrl && turnUsername && turnCredential) {
    out.push({ urls: turnUrl, username: turnUsername, credential: turnCredential });
  }
  return out.length ? out : DEFAULT_ICE_SERVERS;
}

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
    sessions.set(code, { pc: null, android: null, token: "", lastActivity: Date.now(), waitingSince: null, pairedOnce: false });
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
  const code = normalizeCode(msg.code);
  const providedToken = normalizeToken(msg.token);
  if (!role) return safeSend(ws, { type: "error", message: "Invalid role." });
  if (!code) return safeSend(ws, { type: "error", message: "Invalid code." });
  if (!providedToken) {
    return safeSend(ws, { type: "error", message: "Invalid token." });
  }

  const existing = sessions.get(code);
  const isExistingSessionMatch = Boolean(existing && existing.token && existing.token === providedToken);
  const canClaimActivePair = !existing && role === "pc" && code === activePair.code;
  if (!isExistingSessionMatch && !canClaimActivePair) {
    return safeSend(ws, { type: "error", message: "Invalid code/token." });
  }

  const prev = clientMeta.get(ws);
  if (prev) cleanupClient(ws);

  const s = getOrCreateSession(code);
  if (s.token && s.token !== providedToken) {
    return safeSend(ws, { type: "error", message: "Invalid token." });
  }
  if (!s.token) {
    s.token = providedToken;
    rotateActivePair("pc_claimed");
  }

  const current = s[role];
  if (current && current !== ws && current.readyState === WebSocket.OPEN) {
    // Allow seamless reconnect by replacing stale peer of same role.
    safeSend(current, { type: "kicked", reason: "replaced_by_new_connection" });
    try { current.close(4001, "Replaced by new connection"); } catch {}
  }

  s[role] = ws;
  if (role === "pc" && !s.android) {
    s.waitingSince = Date.now();
  }
  if (role === "android") {
    s.waitingSince = null;
  }
  s.lastActivity = Date.now();
  clientMeta.set(ws, { role, code });

  const paired = Boolean(s.pc && s.android);
  safeSend(ws, { type: "registered", role, code, token: role === "pc" ? s.token : undefined, paired });

  const otherRole = role === "pc" ? "android" : "pc";
  safeSend(s[otherRole], { type: "peer_connected", role, code });
  if (paired && !s.pairedOnce) {
    s.pairedOnce = true;
    rotateActivePair("paired_once");
  }
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

function getPrivateIpv4List() {
  const nics = os.networkInterfaces();
  const out = [];
  for (const values of Object.values(nics)) {
    for (const addr of values || []) {
      if (!addr || addr.family !== "IPv4" || addr.internal) continue;
      const ip = addr.address || "";
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(ip)) {
        out.push(ip);
      }
    }
  }
  const unique = Array.from(new Set(out));
  const rank = (ip) => {
    if (/^192\.168\./.test(ip)) return 0;
    if (/^10\./.test(ip)) return 1;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) {
      if (/^172\.(17|18|19)\./.test(ip)) return 4; // common Docker bridge ranges
      return 2;
    }
    return 9;
  };
  return unique.sort((a, b) => rank(a) - rank(b));
}

const httpServer = http.createServer((req, res) => {
  const reqPath = new URL(req.url, "http://localhost").pathname;
  if (reqPath === "/api/pair") {
    const ips = getPrivateIpv4List();
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0"
    });
    return res.end(JSON.stringify({
      code: activePair.code,
      waitTimeoutMs: PAIR_WAIT_TIMEOUT_MS,
      serverIps: ips,
      preferredIp: ips[0] || "",
      publicBaseUrl: PUBLIC_BASE_URL,
      iceServers: ICE_SERVERS
    }));
  }

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
      continue;
    }
    if (s.pc && !s.android && s.waitingSince && now - s.waitingSince > PAIR_WAIT_TIMEOUT_MS) {
      safeSend(s.pc, { type: "pair_expired", reason: "timeout" });
      try { s.pc.close(4008, "Pair expired"); } catch {}
      if (s.android) {
        try { s.android.close(4008, "Pair expired"); } catch {}
      }
      sessions.delete(code);
      rotateActivePair("waiting_timeout");
      log("Pair wait timeout", `code=${maskCode(code)}`);
    }
  }
}, CLEANUP_INTERVAL_MS);

httpServer.listen(PORT, () => {
  log(`WebRTC signaling server: http://localhost:${PORT}`);
  log(`PC page: http://localhost:${PORT}/pc.html`);
  log(`Android page: http://localhost:${PORT}/android.html`);
  log("Pairing generated (one-time per server start)");
  log("Pair code ready at /api/pair (token is generated in PC page)");
});
