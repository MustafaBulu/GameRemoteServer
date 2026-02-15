const WebSocket = require("ws");

const PORT = process.env.PORT || 37841;
const wss = new WebSocket.Server({ port: PORT });
const SESSION_TTL_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 30 * 1000;
const MAX_PACKET_SIZE = 10 * 1024 * 1024;

// code -> { pc: WebSocket | null, android: WebSocket | null, token: string, lastActivity: number }
const sessions = new Map();
// WebSocket -> { role: "pc" | "android", code: string }
const clientMeta = new Map();

function log(message, extra = "") {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${message}`, extra);
}

function normalizeRole(role) {
  if (typeof role !== "string") return null;
  const value = role.toLowerCase();
  return value === "pc" || value === "android" ? value : null;
}

function normalizeCode(code) {
  if (typeof code !== "string") return null;
  const trimmed = code.trim();
  return /^\d{6}$/.test(trimmed) ? trimmed : null;
}

function normalizeToken(token) {
  if (typeof token !== "string") return null;
  const trimmed = token.trim();
  return /^[A-Za-z0-9_-]{4,32}$/.test(trimmed) ? trimmed : null;
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function maskCode(code) {
  if (!code || code.length < 4) return "******";
  return `${code.slice(0, 2)}**${code.slice(-2)}`;
}

function sanitizePacketForLog(msg) {
  if (!msg || typeof msg !== "object") return {};
  return {
    type: msg.type || "unknown",
    role: msg.role || undefined,
    target: msg.target || undefined,
    command: msg.command || undefined,
    frameBytes: typeof msg.frame === "string" ? msg.frame.length : undefined,
    code: normalizeCode(msg.code) ? maskCode(msg.code) : undefined
  };
}

function getOrCreateSession(code) {
  if (!sessions.has(code)) {
    sessions.set(code, { pc: null, android: null, token: "", lastActivity: Date.now() });
  }
  return sessions.get(code);
}

function markSessionActivity(code) {
  const session = sessions.get(code);
  if (session) {
    session.lastActivity = Date.now();
  }
}

function safeSend(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function cleanupClient(ws) {
  const meta = clientMeta.get(ws);
  if (!meta) return;

  const { code, role } = meta;
  const session = sessions.get(code);
  if (session && session[role] === ws) {
    session[role] = null;
    session.lastActivity = Date.now();
    log(`Disconnected ${role}`, `code=${maskCode(code)}`);

    const otherRole = role === "pc" ? "android" : "pc";
    if (session[otherRole]) {
      safeSend(session[otherRole], {
        type: "peer_disconnected",
        code,
        role
      });
    }

    if (!session.pc && !session.android) {
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

  if (!role) {
    safeSend(ws, { type: "error", message: "Invalid role. Use 'pc' or 'android'." });
    return;
  }

  if (!code) {
    code = generateCode();
  }

  const prevMeta = clientMeta.get(ws);
  if (prevMeta) {
    cleanupClient(ws);
  }

  const session = getOrCreateSession(code);
  const token = session.token || providedToken || generateToken();

  if (role === "android" && !session.token) {
    safeSend(ws, {
      type: "error",
      message: "PC must register first and share token."
    });
    return;
  }

  if (role === "pc" && session.token && (!providedToken || providedToken !== session.token)) {
    safeSend(ws, {
      type: "error",
      message: "Invalid or missing token."
    });
    return;
  }

  if (role === "android" && (!providedToken || providedToken !== token)) {
    safeSend(ws, {
      type: "error",
      message: "Invalid or missing token."
    });
    return;
  }

  const current = session[role];
  if (current && current !== ws && current.readyState === WebSocket.OPEN) {
    safeSend(ws, {
      type: "error",
      message: `${role} already connected for this code.`,
      code
    });
    return;
  }

  session[role] = ws;
  session.token = token;
  session.lastActivity = Date.now();
  clientMeta.set(ws, { role, code });

  const paired = Boolean(session.pc && session.android);
  safeSend(ws, {
    type: "registered",
    role,
    code,
    token: role === "pc" ? token : undefined,
    paired
  });

  const otherRole = role === "pc" ? "android" : "pc";
  if (session[otherRole]) {
    safeSend(session[otherRole], {
      type: "peer_connected",
      code,
      role
    });
  }

  log("Registered client", `role=${role} code=${maskCode(code)} paired=${paired}`);
}

function handleInput(ws, msg) {
  const meta = clientMeta.get(ws);
  if (!meta) {
    safeSend(ws, { type: "error", message: "Not registered. Send register packet first." });
    return;
  }

  const code = normalizeCode(msg.code) || meta.code;
  if (!code || code !== meta.code) {
    safeSend(ws, { type: "error", message: "Invalid or mismatched code." });
    return;
  }

  if (meta.role !== "android") {
    safeSend(ws, { type: "error", message: "Only android clients can send input packets." });
    return;
  }

  const target = normalizeRole(msg.target);
  if (target !== "pc") {
    safeSend(ws, { type: "error", message: "Only target='pc' is supported." });
    return;
  }

  const token = normalizeToken(msg.token);
  const session = sessions.get(code);
  if (!session || !session.pc || session.pc.readyState !== WebSocket.OPEN) {
    safeSend(ws, { type: "error", message: "PC is not connected.", code });
    return;
  }

  if (!token || token !== session.token) {
    safeSend(ws, { type: "error", message: "Invalid token." });
    return;
  }

  const forwardPacket = {
    type: "input",
    code,
    from: "android",
    target: "pc",
    command: msg.command || null,
    params: msg.params || {}
  };

  safeSend(session.pc, forwardPacket);
  safeSend(ws, { type: "input_ack", code, delivered: true });
  markSessionActivity(code);
  log("Input forwarded", JSON.stringify({
    type: forwardPacket.type,
    code: maskCode(code),
    command: forwardPacket.command,
    target: forwardPacket.target
  }));
}

function handleFrame(ws, msg) {
  const meta = clientMeta.get(ws);
  if (!meta) {
    safeSend(ws, { type: "error", message: "Not registered. Send register packet first." });
    return;
  }

  const code = normalizeCode(msg.code) || meta.code;
  if (!code || code !== meta.code) {
    safeSend(ws, { type: "error", message: "Invalid or mismatched code." });
    return;
  }

  if (meta.role !== "pc") {
    safeSend(ws, { type: "error", message: "Only pc clients can send frame packets." });
    return;
  }

  const token = normalizeToken(msg.token);
  const target = normalizeRole(msg.target);
  const frame = typeof msg.frame === "string" ? msg.frame : "";
  if (target !== "android") {
    safeSend(ws, { type: "error", message: "Only target='android' is supported for frames." });
    return;
  }
  if (!frame) {
    safeSend(ws, { type: "error", message: "Missing frame payload." });
    return;
  }

  const session = sessions.get(code);
  if (!session || !session.android || session.android.readyState !== WebSocket.OPEN) {
    safeSend(ws, { type: "error", message: "Android is not connected.", code });
    return;
  }
  if (!token || token !== session.token) {
    safeSend(ws, { type: "error", message: "Invalid token." });
    return;
  }

  safeSend(session.android, {
    type: "frame",
    code,
    from: "pc",
    target: "android",
    format: msg.format || "png",
    frame
  });
  markSessionActivity(code);
}

function handleMessage(ws, rawData) {
  const text = rawData.toString();
  if (text.length > MAX_PACKET_SIZE) {
    safeSend(ws, { type: "error", message: "Packet too large." });
    return;
  }

  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    safeSend(ws, { type: "error", message: "Invalid JSON." });
    return;
  }

  if (!msg || typeof msg !== "object" || typeof msg.type !== "string") {
    safeSend(ws, { type: "error", message: "Packet must include string 'type'." });
    return;
  }
  log("Incoming packet", JSON.stringify(sanitizePacketForLog(msg)));

  if (msg.type === "register") {
    handleRegister(ws, msg);
    return;
  }

  if (msg.type === "input") {
    handleInput(ws, msg);
    return;
  }

  if (msg.type === "frame") {
    handleFrame(ws, msg);
    return;
  }

  safeSend(ws, { type: "error", message: `Unsupported type: ${msg.type}` });
}

wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress || "unknown";
  log("Client connected", `ip=${ip.replace(/\d+$/, "x")}`);

  safeSend(ws, {
    type: "hello",
    message: "Send { type:'register', role:'pc|android', code:'123456', token:'ABCD1234' }"
  });

  ws.on("message", (data) => handleMessage(ws, data));
  ws.on("close", () => cleanupClient(ws));
  ws.on("error", (err) => log("WebSocket error", err.message));
});

wss.on("listening", () => {
  log(`WebSocket server running on ws://localhost:${PORT}`);
});

setInterval(() => {
  const now = Date.now();
  for (const [code, session] of sessions.entries()) {
    if (!session.pc && !session.android && now - session.lastActivity > SESSION_TTL_MS) {
      sessions.delete(code);
      log("Session expired", `code=${maskCode(code)}`);
    }
  }
}, CLEANUP_INTERVAL_MS);
