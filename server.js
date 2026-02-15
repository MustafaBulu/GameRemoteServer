const WebSocket = require("ws");

const PORT = process.env.PORT || 37841;
const wss = new WebSocket.Server({ port: PORT });

// code -> { pc: WebSocket | null, android: WebSocket | null }
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

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getOrCreateSession(code) {
  if (!sessions.has(code)) {
    sessions.set(code, { pc: null, android: null });
  }
  return sessions.get(code);
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
    log(`Disconnected ${role}`, `code=${code}`);

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
      log("Session removed", `code=${code}`);
    }
  }

  clientMeta.delete(ws);
}

function handleRegister(ws, msg) {
  const role = normalizeRole(msg.role);
  let code = normalizeCode(msg.code);

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
  clientMeta.set(ws, { role, code });

  const paired = Boolean(session.pc && session.android);
  safeSend(ws, {
    type: "registered",
    role,
    code,
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

  log("Registered client", `role=${role} code=${code} paired=${paired}`);
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

  const session = sessions.get(code);
  if (!session || !session.pc || session.pc.readyState !== WebSocket.OPEN) {
    safeSend(ws, { type: "error", message: "PC is not connected.", code });
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
  log("Input forwarded", JSON.stringify(forwardPacket));
}

function handleMessage(ws, rawData) {
  const text = rawData.toString();
  log("Incoming packet", text);

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

  if (msg.type === "register") {
    handleRegister(ws, msg);
    return;
  }

  if (msg.type === "input") {
    handleInput(ws, msg);
    return;
  }

  safeSend(ws, { type: "error", message: `Unsupported type: ${msg.type}` });
}

wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress || "unknown";
  log("Client connected", `ip=${ip}`);

  safeSend(ws, {
    type: "hello",
    message: "Send { type:'register', role:'pc|android', code:'123456' }"
  });

  ws.on("message", (data) => handleMessage(ws, data));
  ws.on("close", () => cleanupClient(ws));
  ws.on("error", (err) => log("WebSocket error", err.message));
});

wss.on("listening", () => {
  log(`WebSocket server running on ws://localhost:${PORT}`);
});
