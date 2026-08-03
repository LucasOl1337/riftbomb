import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function readProjectVersion() {
  try {
    const raw = readFileSync(path.join(__dirname, "../package.json"), "utf8");
    const version = JSON.parse(raw).version;
    return typeof version === "string" && version.trim() ? version.trim() : "0.0.0";
  } catch {
    return "0.0.0";
  }
}
const PACKAGE_VERSION = readProjectVersion();

const PORT = Number(process.env.PORT || 8788);
const HOST = process.env.HOST || "127.0.0.1";
const WS_PATH = process.env.WS_PATH || "/ws";
const ROOM_TTL_MS = 30 * 60_000;
const RECONNECT_GRACE_MS = 20_000;
const RESUME_PROTOCOL_VERSION = 1;
const RESUME_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const SESSION_REPLACED_CLOSE_CODE = 4001;
const SESSION_EXPIRED_CLOSE_CODE = 4002;
const MAX_ROOMS = Number(process.env.MAX_ROOMS || 256);
const MAX_REVOKED_RESUME_TOKENS = Math.max(256, Math.min(16_384, MAX_ROOMS * 16));
const REVOKED_RESUME_SWEEP_LIMIT = 64;
const runtimePerformance = globalThis.performance;
let cryptoRuntimePromise = null;
let webSocketRuntimePromise = null;
// SERVER_BOOT_LAZY_V1: support modules are not needed to bind the HTTP port.
let serverRuntimePromise = null;
let authoritativeRuntime = null;
let authoritativeRooms = null;
let quickMatchQueue = null;
let jsonTransport = null;
let allowMessage = null;
let getHealthResponse = null;
let readEventLoopUtilization = null;
let webSockets = null;
const WEBSOCKET_OPEN = 1;
const WEBSOCKET_CLOSED = 3;
const PROXY_SECRET = process.env.GAME_SERVER_PROXY_SECRET || "";
const ROOM_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const rooms = new Map();
const quickMatchResumeIndex = createQuickMatchResumeIndex();
const revokedResumeTokens = createBoundedRevokedResumeTokens({
  capacity: MAX_REVOKED_RESUME_TOKENS,
  sweepLimit: REVOKED_RESUME_SWEEP_LIMIT
});

function send(socket, message) {
  return jsonTransport.send(socket, message);
}

function broadcast(room, message) {
  return jsonTransport.broadcast(
    [room.players[0]?.socket, room.players[1]?.socket],
    message
  );
}

function loadServerRuntime() {
  return serverRuntimePromise ??= Promise.all([
    import("./authoritative-rooms.mjs"),
    import("./json-transport.mjs"),
    import("./message-rate-limit.mjs"),
    import("./health-response.mjs"),
    import("./quick-match-queue.mjs")
  ]).then(([authoritative, transport, limiter, health, queue]) => {
    authoritativeRuntime = authoritative;
    jsonTransport = transport.createJsonTransport({ openState: WEBSOCKET_OPEN });
    allowMessage = limiter.createMessageRateLimiter();
    quickMatchQueue = queue.createQuickMatchQueue({ sameResumeToken });
    authoritativeRooms = new authoritative.AuthoritativeRooms({ rooms, broadcast });
    readEventLoopUtilization = health.createEventLoopUtilizationSampler(
      () => runtimePerformance.eventLoopUtilization()
    );
    getHealthResponse = health.createHealthResponseCache(() => ({
      ok: true,
      service: "riftbomb-authoritative",
      version: PACKAGE_VERSION,
      rooms: rooms.size,
      quickMatchWaiting: quickMatchQueue.size(),
      authority: "server",
      region: "sa-saopaulo-1",
      performance: {
        ...authoritativeRooms.performanceSnapshot(),
        webSocketClients: webSockets?.clients.size || 0,
        eventLoopUtilization: readEventLoopUtilization()
      }
    }), { ttlMs: health.DEFAULT_HEALTH_RESPONSE_TTL_MS });
    return { allowMessage, authoritativeRuntime, authoritativeRooms };
  });
}

function validPreset(value) {
  return authoritativeRuntime.validPreset(value);
}

function isChampion(value) {
  return authoritativeRuntime.isChampion(value);
}

function invalidateProtocolCache(room, kind = "all") {
  return authoritativeRuntime.invalidateProtocolCache(room, kind);
}

function loadCryptoRuntime() {
  return cryptoRuntimePromise ??= import("node:crypto");
}

function loadWebSocketRuntime() {
  return webSocketRuntimePromise ??= import("ws");
}

function isAuthorizedProxy(request) {
  return !PROXY_SECRET || request.headers["x-riftbomb-proxy"] === PROXY_SECRET;
}

export function createBoundedRevokedResumeTokens({ capacity, sweepLimit }) {
  if (!Number.isInteger(capacity) || capacity <= 0 ||
      !Number.isInteger(sweepLimit) || sweepLimit <= 0) {
    throw new TypeError("invalid revoked resume token bounds");
  }
  const entries = new Map();
  const keyFor = (digest) => Buffer.isBuffer(digest) ? digest.toString("hex") : "";
  return Object.freeze({
    revoke(digest, expiresAt) {
      const key = keyFor(digest);
      if (!key || !Number.isFinite(expiresAt)) return false;
      if (entries.has(key)) entries.delete(key);
      while (entries.size >= capacity) {
        entries.delete(entries.keys().next().value);
      }
      entries.set(key, expiresAt);
      return true;
    },
    isRevoked(digest, now) {
      const key = keyFor(digest);
      if (!key) return false;
      const expiresAt = entries.get(key) || 0;
      if (expiresAt <= now) {
        if (expiresAt) entries.delete(key);
        return false;
      }
      return true;
    },
    sweep(now) {
      let inspected = 0;
      let deleted = 0;
      for (const [key, expiresAt] of entries) {
        if (inspected >= sweepLimit) break;
        inspected += 1;
        if (expiresAt <= now) {
          entries.delete(key);
          deleted += 1;
        }
      }
      return { inspected, deleted };
    },
    snapshot() {
      return { size: entries.size, capacity, sweepLimit };
    },
    clear() {
      entries.clear();
    }
  });
}

function digestResumeToken(value, cryptoRuntime) {
  if (typeof value !== "string" || !RESUME_TOKEN_PATTERN.test(value)) return null;
  return cryptoRuntime.createHash("sha256").update(value, "utf8").digest();
}

function readResumeClaim(message, cryptoRuntime) {
  if (message?.resumeProtocol === undefined) {
    return { valid: true, version: 0, digest: null };
  }
  if (message.resumeProtocol !== RESUME_PROTOCOL_VERSION) {
    return { valid: false, version: 0, digest: null };
  }
  const digest = digestResumeToken(message.resumeToken, cryptoRuntime);
  if (!digest) return { valid: false, version: RESUME_PROTOCOL_VERSION, digest: null };
  if (revokedResumeTokens.isRevoked(digest, Date.now())) {
    return {
      valid: false,
      version: RESUME_PROTOCOL_VERSION,
      digest,
      error: "resume_expired"
    };
  }
  return { valid: true, version: RESUME_PROTOCOL_VERSION, digest };
}

function sameResumeToken(expected, presented, cryptoRuntime) {
  return Buffer.isBuffer(expected) && Buffer.isBuffer(presented) &&
    expected.length === presented.length && cryptoRuntime.timingSafeEqual(expected, presented);
}

export function createQuickMatchResumeIndex() {
  const seatsByDigest = new Map();
  const keyFor = (digest) => Buffer.isBuffer(digest) ? digest.toString("hex") : "";

  function add(room, index, digest) {
    const key = keyFor(digest);
    if (!key || !room?.players?.[index]) return false;
    let seats = seatsByDigest.get(key);
    if (!seats) {
      seats = [];
      seatsByDigest.set(key, seats);
    }
    if (seats.some((seat) => seat.room === room && seat.index === index)) return false;
    seats.push({ room, index });
    return true;
  }

  function remove(room, index, digest) {
    const key = keyFor(digest);
    if (!key) return false;
    const seats = seatsByDigest.get(key);
    if (!seats) return false;
    const remaining = seats.filter((seat) => seat.room !== room || seat.index !== index);
    if (remaining.length === seats.length) return false;
    if (remaining.length === 0) seatsByDigest.delete(key);
    else seatsByDigest.set(key, remaining);
    return true;
  }

  function find(presented, cryptoRuntime) {
    const seats = seatsByDigest.get(keyFor(presented));
    if (!seats) return null;
    for (const seat of seats) {
      const player = seat.room.players[seat.index];
      if (player?.quickMatch !== true ||
          player.resumeProtocol !== RESUME_PROTOCOL_VERSION ||
          !sameResumeToken(player.resumeTokenDigest, presented, cryptoRuntime)) continue;
      return { room: seat.room, index: seat.index, role: seat.index === 0 ? "host" : "guest" };
    }
    return null;
  }

  return Object.freeze({
    add,
    remove,
    find,
    size: () => [...seatsByDigest.values()].reduce((total, seats) => total + seats.length, 0)
  });
}

function findQuickMatchResumeSeat(presented, cryptoRuntime) {
  if (!Buffer.isBuffer(presented)) return null;
  const resumedSeat = quickMatchResumeIndex.find(presented, cryptoRuntime);
  if (!resumedSeat) return null;
  if (rooms.get(resumedSeat.room.code) !== resumedSeat.room) {
    quickMatchResumeIndex.remove(
      resumedSeat.room,
      resumedSeat.index,
      presented
    );
    return null;
  }
  const player = resumedSeat.room.players[resumedSeat.index];
  if (resumeDeadlineExpired(player, Date.now())) {
    expireDisconnectedSeat(resumedSeat.room, resumedSeat.index, Date.now());
    return { expired: true };
  }
  return resumedSeat;
}

function removeFromQuickMatchQueue(socket) {
  quickMatchQueue.removeBySocket(socket);
  socket.quickMatchQueued = false;
}

function nextRoomCode(cryptoRuntime) {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    let code = "";
    for (let index = 0; index < 6; index += 1) {
      code += ROOM_ALPHABET[cryptoRuntime.randomInt(ROOM_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return "";
}

function joinQuickMatch(socket, message, resumeClaim, cryptoRuntime) {
  // Once queued, repeated frames from this socket are a no-op. A fresh socket
  // with the same bearer is still allowed to replace it below after reload.
  if (socket.quickMatchQueued) return;
  if (resumeClaim.version === RESUME_PROTOCOL_VERSION) {
    const resumedSeat = findQuickMatchResumeSeat(resumeClaim.digest, cryptoRuntime);
    if (resumedSeat?.expired) {
      return send(socket, { type: "error", error: "resume_expired" });
    }
    if (resumedSeat) {
      attachPlayerToRoom(socket, {
        ready: true,
        inputProtocol: message.inputProtocol,
        actionProtocol: message.actionProtocol
      }, resumedSeat.room, resumedSeat.role, { quickMatch: true, resumeClaim, cryptoRuntime });
      return;
    }
    const replacement = quickMatchQueue.replaceByResume(resumeClaim.digest, {
      socket,
      preset: validPreset(message.preset),
      inputProtocol: message.inputProtocol === 1 ? 1 : 0,
      actionProtocol: message.actionProtocol === 1 ? 1 : 0,
      resumeClaim
    }, cryptoRuntime);
    if (replacement) {
      const queued = replacement.entry;
      if (queued.socket === socket) return;
      queued.socket.quickMatchQueued = false;
      queued.socket.riftbombSuperseded = true;
      socket.quickMatchQueued = true;
      if (queued.socket.readyState === WEBSOCKET_OPEN) {
        queued.socket.close(SESSION_REPLACED_CLOSE_CODE, "session_replaced");
      }
      send(socket, { type: "quick-queued", position: replacement.position });
      return;
    }
  }
  if (rooms.size >= MAX_ROOMS) return send(socket, { type: "error", error: "server_full" });

  while (quickMatchQueue.size()) {
    const waiting = quickMatchQueue.shift();
    waiting.socket.quickMatchQueued = false;
    if (waiting.socket.readyState !== WEBSOCKET_OPEN || waiting.socket.riftbomb) continue;

    const code = nextRoomCode(cryptoRuntime);
    if (!code) return send(socket, { type: "error", error: "server_full" });
    const firstPreset = validPreset(waiting.preset);
    const secondPreset = validPreset(message.preset);
    const room = authoritativeRooms.create(code, {
      hostChampion: firstPreset.hostChampion,
      guestChampion: secondPreset.hostChampion,
      arena: firstPreset.arena,
      matchTarget: 3
    });
    attachPlayerToRoom(waiting.socket, {
      ready: true,
      inputProtocol: waiting.inputProtocol,
      actionProtocol: waiting.actionProtocol
    }, room, "host", {
      quickMatch: true,
      resumeClaim: waiting.resumeClaim,
      cryptoRuntime
    });
    attachPlayerToRoom(socket, {
      ready: true,
      inputProtocol: message.inputProtocol,
      actionProtocol: message.actionProtocol
    }, room, "guest", { quickMatch: true, resumeClaim, cryptoRuntime });
    return;
  }

  socket.quickMatchQueued = true;
  quickMatchQueue.push({
    socket,
    preset: validPreset(message.preset),
    inputProtocol: message.inputProtocol === 1 ? 1 : 0,
    actionProtocol: message.actionProtocol === 1 ? 1 : 0,
    resumeClaim
  });
  send(socket, { type: "quick-queued", position: quickMatchQueue.size() });
}

function attachPlayer(socket, message, cryptoRuntime) {
  const resumeClaim = readResumeClaim(message, cryptoRuntime);
  if (!resumeClaim.valid) {
    return send(socket, { type: "error", error: resumeClaim.error || "invalid_resume" });
  }
  if (message.resumeOnly === true && resumeClaim.version !== RESUME_PROTOCOL_VERSION) {
    return send(socket, { type: "error", error: "invalid_resume" });
  }
  if (message.type === "quick-match") {
    return joinQuickMatch(socket, message, resumeClaim, cryptoRuntime);
  }
  if (message.type === "cancel-quick-match") {
    removeFromQuickMatchQueue(socket);
    return send(socket, { type: "quick-cancelled" });
  }
  const code = typeof message.room === "string" ? message.room.toUpperCase() : "";
  const role = message.role === "host" ? "host" : message.role === "guest" ? "guest" : "";
  if (!ROOM_PATTERN.test(code) || !role) return send(socket, { type: "error", error: "invalid_hello" });

  let room = rooms.get(code);
  if (!room && rooms.size >= MAX_ROOMS) {
    return send(socket, { type: "error", error: "server_full" });
  }
  if (role === "host" && !room && message.resumeOnly === true) {
    return send(socket, { type: "error", error: "room_not_found" });
  }
  if (role === "host" && !room) room = authoritativeRooms.create(code, message.preset);
  if (!room) return send(socket, { type: "error", error: "room_not_found" });
  attachPlayerToRoom(socket, message, room, role, {
    resumeClaim,
    cryptoRuntime,
    resumeOnly: message.resumeOnly === true
  });
}

function attachPlayerToRoom(socket, message, room, role, {
  quickMatch = false,
  resumeClaim,
  cryptoRuntime,
  resumeOnly = false
} = {}) {
  const index = role === "host" ? 0 : 1;
  let current = room.players[index];
  const expiredDigest = expireDisconnectedSeat(room, index, Date.now());
  if (expiredDigest) {
    if (sameResumeToken(expiredDigest, resumeClaim.digest, cryptoRuntime)) {
      return send(socket, { type: "error", error: "resume_expired" });
    }
    if (index === 0) return send(socket, { type: "error", error: "room_not_found" });
    current = room.players[index];
  }
  if (resumeOnly && !current) {
    return send(socket, { type: "error", error: "resume_denied" });
  }
  const protectedSeat = current?.resumeProtocol === RESUME_PROTOCOL_VERSION;
  if (protectedSeat && !sameResumeToken(current.resumeTokenDigest, resumeClaim.digest, cryptoRuntime)) {
    return send(socket, { type: "error", error: "resume_denied" });
  }
  // A legacy socket owns its seat until its close callback clears the pointer.
  // Treat CLOSING exactly like OPEN so a contender cannot win the handshake
  // race during a rolling deploy. Authenticated v1 resumes are fenced above.
  if (!protectedSeat && current?.socket) {
    return send(socket, { type: "error", error: "role_taken" });
  }
  const previousSocket = current?.socket || null;
  const resumed = Boolean(current);
  const reconnected = resumed && !previousSocket;
  const player = current || {
    ready: role === "host" || Boolean(message.ready),
    disconnectedAt: 0,
    inputProtocol: 0,
    actionProtocol: 0,
    quickMatch: Boolean(quickMatch),
    resumeProtocol: 0,
    resumeTokenDigest: null,
    connectionGeneration: 0
  };
  player.socket = socket;
  player.disconnectedAt = 0;
  player.inputProtocol = Math.max(
    player.inputProtocol || 0,
    message.inputProtocol === 1 ? 1 : 0
  );
  player.actionProtocol = Math.max(
    player.actionProtocol || 0,
    message.actionProtocol === 1 ? 1 : 0
  );
  if (!protectedSeat && resumeClaim.version === RESUME_PROTOCOL_VERSION) {
    quickMatchResumeIndex.remove(room, index, player.resumeTokenDigest);
    player.resumeProtocol = RESUME_PROTOCOL_VERSION;
    player.resumeTokenDigest = resumeClaim.digest;
  }
  player.connectionGeneration = (player.connectionGeneration || 0) + 1;
  room.players[index] = player;
  if (player.quickMatch && player.resumeProtocol === RESUME_PROTOCOL_VERSION) {
    quickMatchResumeIndex.add(room, index, player.resumeTokenDigest);
  }
  socket.riftbomb = { room, index, generation: player.connectionGeneration };
  room.lastActivity = Date.now();
  if (room.game) {
    room.inputs[index] = 0;
    if (player.inputProtocol === 1) room.inputReliable[index] = true;
    if (player.actionProtocol === 1) room.actionReliable[index] = true;
    room.gridCache = null;
  }
  if (previousSocket && previousSocket !== socket &&
      previousSocket.readyState === WEBSOCKET_OPEN) {
    previousSocket.close(SESSION_REPLACED_CLOSE_CODE, "session_replaced");
  }
  send(socket, {
    type: "connected",
    role,
    playerId: index + 1,
    room: room.code,
    quickMatch: Boolean(player.quickMatch),
    soundCursor: room.game?.authoritativeSound?.latest || room.soundEventSequence || 0,
    input: authoritativeRooms.inputProtocol(room),
    action: authoritativeRooms.actionProtocol(room),
    resume: {
      v: RESUME_PROTOCOL_VERSION,
      protected: player.resumeProtocol === RESUME_PROTOCOL_VERSION,
      resumed
    }
  });
  if (resumed && resumeClaim.version === RESUME_PROTOCOL_VERSION) {
    send(socket, {
      ...authoritativeRooms.lobbyMessage(room),
      type: "resume",
      activeMatch: Boolean(room.game),
      hostConnected: Boolean(room.players[0]?.socket),
      input: authoritativeRooms.inputProtocol(room),
      action: authoritativeRooms.actionProtocol(room)
    });
  } else if (room.game) {
    send(socket, {
      ...authoritativeRooms.lobbyMessage(room),
      type: "start",
      input: authoritativeRooms.inputProtocol(room),
      action: authoritativeRooms.actionProtocol(room)
    });
  }
  if (reconnected) {
    broadcast(room, { type: "presence", playerId: index + 1, connected: true });
  }
  broadcast(room, authoritativeRooms.lobbyMessage(room));
  void authoritativeRooms.start(room);
}

function leaveRoom(socket, room, index, generation) {
  if (room.players[index]?.socket !== socket ||
      room.players[index]?.connectionGeneration !== generation) return false;
  socket.riftbombReleased = true;
  if (index === 0) {
    const now = Date.now();
    const peers = room.players
      .map((player) => player?.socket)
      .filter((peer) => peer && peer !== socket);
    for (let playerIndex = 0; playerIndex < room.players.length; playerIndex += 1) {
      revokePlayerResumeToken(room, playerIndex, now);
    }
    room.players = [null, null];
    room.inputs = [0, 0];
    stopRoom(room);
    for (const peer of peers) {
      send(peer, { type: "room-closed" });
      if (peer.readyState === WEBSOCKET_OPEN) peer.close(4002, "room_closed");
    }
    return true;
  }
  revokePlayerResumeToken(room, index, Date.now());
  room.players[index] = null;
  room.inputs[index] = 0;
  room.inputAccepted[index] = 0;
  room.inputApplied[index] = 0;
  room.inputReliable[index] = false;
  room.actionAck[index] = 0;
  room.actionReliable[index] = false;
  invalidateProtocolCache(room);
  room.lastActivity = Date.now();
  broadcast(room, { type: "presence", playerId: index + 1, connected: false });
  broadcast(room, authoritativeRooms.lobbyMessage(room));
  return true;
}

function parseClientMessage(raw) {
  let message;
  try { message = JSON.parse(raw.toString()); } catch { return null; }
  if (!message || typeof message !== "object" || Array.isArray(message) ||
      typeof message.type !== "string" || !message.type || message.type.length > 32) return null;
  return message;
}

async function handleMessage(socket, raw) {
  const runtime = await loadServerRuntime();
  if (!runtime.allowMessage(socket)) return;
  const message = parseClientMessage(raw);
  if (!message) return;
  socket.lastSeen = Date.now();
  if (message.type === "pong") return;
  if (socket.riftbombSuperseded || socket.riftbombReleased) return;
  if (!socket.riftbomb) {
    const cryptoRuntime = await loadCryptoRuntime();
    return attachPlayer(socket, message, cryptoRuntime);
  }
  const { room, index, generation } = socket.riftbomb;
  if (room.players[index]?.socket !== socket ||
      room.players[index]?.connectionGeneration !== generation) return;
  if (message.type === "leave") return leaveRoom(socket, room, index, generation);
  room.lastActivity = Date.now();

  if (message.type === "input") authoritativeRooms.acceptInput(room, index, message);
  if (message.type === "action") authoritativeRooms.processPlayerAction(room, index, message);
  if (message.type === "guest-config" && index === 1 && !room.game) {
    room.players[1].ready = Boolean(message.ready);
    if (isChampion(message.champion)) room.preset.guestChampion = message.champion;
    broadcast(room, authoritativeRooms.lobbyMessage(room));
    void authoritativeRooms.start(room);
  }
  if (message.type === "lobby" && index === 0 && !room.game) {
    room.preset = validPreset(message);
    broadcast(room, authoritativeRooms.lobbyMessage(room));
  }
  // Host-only rematch after matchover (or if sim still exists and both are connected).
  const validRematchEpoch = message.inputEpoch === room.inputEpoch ||
    (room.players[0]?.inputProtocol !== 1 && message.inputEpoch === undefined);
  if (message.type === "rematch" && index === 0 && room.game?.mode === "matchover" &&
      validRematchEpoch) {
    room.preset = validPreset({
      ...room.preset,
      hostChampion: message.hostChampion,
      guestChampion: message.guestChampion,
      arena: message.arena,
      matchTarget: message.matchTarget
    });
    if (room.players[0]) room.players[0].ready = true;
    if (room.players[1]) room.players[1].ready = true;
    void authoritativeRooms.start(room, { rematch: true });
  }
  // Host explicit start nudge when guest is ready and match has not begun.
  if (message.type === "start" && index === 0 && !room.game) {
    room.preset = validPreset({
      ...room.preset,
      hostChampion: message.hostChampion,
      guestChampion: message.guestChampion,
      arena: message.arena,
      matchTarget: message.matchTarget
    });
    if (room.players[1]) room.players[1].ready = true;
    void authoritativeRooms.start(room);
  }
}

const server = createServer((request, response) => {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("cache-control", "no-store");
  if (request.url === "/health") {
    void loadServerRuntime().then(() => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(getHealthResponse());
    });
    return;
  }
  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});

function registerWebSocketConnection(socket) {
  socket.lastSeen = Date.now();
  // Protocol violations (including maxPayload) belong to the offending peer;
  // ws closes that connection, while this listener keeps the server process alive.
  socket.on("error", () => undefined);
  socket.on("message", (message) => { void handleMessage(socket, message); });
  socket.on("close", () => {
    removeFromQuickMatchQueue(socket);
    if (!socket.riftbomb) return;
    const { room, index, generation } = socket.riftbomb;
    if (room.players[index]?.socket === socket &&
        room.players[index]?.connectionGeneration === generation) {
      room.players[index].socket = null;
      room.players[index].disconnectedAt = Date.now();
      room.inputs[index] = 0;
      broadcast(room, { type: "presence", playerId: index + 1, connected: false });
    }
  });
}

async function ensureWebSocketServer() {
  if (webSockets) return webSockets;
  const [{ WebSocketServer }] = await Promise.all([
    loadWebSocketRuntime(),
    loadServerRuntime()
  ]);
  const instance = new WebSocketServer({
    noServer: true,
    maxPayload: 32_768,
    verifyClient: ({ req }, done) => {
      const authorized = isAuthorizedProxy(req);
      done(authorized, authorized ? 101 : 401, authorized ? undefined : "Unauthorized proxy");
    }
  });
  instance.on("connection", registerWebSocketConnection);
  webSockets = instance;
  return instance;
}

server.on("upgrade", (request, socket, head) => {
  if (request.url?.split("?", 1)[0] !== WS_PATH) {
    socket.destroy();
    return;
  }
  if (!isAuthorizedProxy(request)) {
    socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
    return;
  }
  void ensureWebSocketServer()
    .then((instance) => {
      instance.handleUpgrade(request, socket, head, (client) => {
        instance.emit("connection", client, request);
      });
    })
    .catch(() => socket.destroy());
});

function revokePlayerResumeToken(room, index, now) {
  const player = room.players[index];
  if (player?.resumeProtocol !== RESUME_PROTOCOL_VERSION ||
      !Buffer.isBuffer(player.resumeTokenDigest)) return null;
  const digest = player.resumeTokenDigest;
  quickMatchResumeIndex.remove(room, index, digest);
  revokedResumeTokens.revoke(digest, now + ROOM_TTL_MS);
  player.resumeProtocol = 0;
  player.resumeTokenDigest = null;
  return digest;
}

function stopRoom(room) {
  for (let index = 0; index < room.players.length; index += 1) {
    quickMatchResumeIndex.remove(
      room,
      index,
      room.players[index]?.resumeTokenDigest
    );
  }
  authoritativeRooms.stop(room);
}

function closeRoomAfterHostResumeExpiry(room, now) {
  for (let index = 0; index < room.players.length; index += 1) {
    revokePlayerResumeToken(room, index, now);
  }
  for (const player of room.players) {
    if (!player) continue;
    const activeSocket = player.socket;
    player.socket = null;
    player.disconnectedAt = now;
    player.connectionGeneration = (player.connectionGeneration || 0) + 1;
    if (!activeSocket) continue;
    activeSocket.riftbombSuperseded = true;
    send(activeSocket, { type: "room-closed" });
    if (activeSocket.readyState === WEBSOCKET_OPEN) {
      activeSocket.close(SESSION_EXPIRED_CLOSE_CODE, "resume_expired");
    } else if (activeSocket.readyState !== WEBSOCKET_CLOSED) {
      activeSocket.terminate();
    }
  }
  room.inputs = [0, 0];
  stopRoom(room);
}

function releaseGuestAfterResumeExpiry(room, now) {
  const expiredDigest = revokePlayerResumeToken(room, 1, now);
  room.players[1] = null;
  room.inputs[1] = 0;
  room.inputAccepted[1] = 0;
  room.inputApplied[1] = 0;
  room.inputReliable[1] = false;
  room.actionAck[1] = 0;
  room.actionReliable[1] = false;
  invalidateProtocolCache(room);
  room.gridCache = null;
  room.lastActivity = now;
  broadcast(room, { type: "presence", playerId: 2, connected: false });
  broadcast(room, authoritativeRooms.lobbyMessage(room));
  return expiredDigest;
}

function resumeDeadlineExpired(player, now) {
  return player?.resumeProtocol === RESUME_PROTOCOL_VERSION && !player.socket &&
    player.disconnectedAt > 0 && now - player.disconnectedAt >= RECONNECT_GRACE_MS;
}

function expireDisconnectedSeat(room, index, now) {
  const player = room.players[index];
  if (!resumeDeadlineExpired(player, now)) return null;
  const expiredDigest = player.resumeTokenDigest;
  if (index === 0) closeRoomAfterHostResumeExpiry(room, now);
  else releaseGuestAfterResumeExpiry(room, now);
  return expiredDigest;
}

export function resumeSecuritySnapshot() {
  return revokedResumeTokens.snapshot();
}

export function webSocketRuntimeSnapshot() {
  return {
    loaded: webSocketRuntimePromise !== null,
    serverCreated: webSockets !== null
  };
}

export function runMaintenance(now = Date.now()) {
  revokedResumeTokens.sweep(now);
  if (webSockets) {
    for (const socket of webSockets.clients) {
      if (now - socket.lastSeen > 45_000) socket.terminate();
      else send(socket, { type: "ping", serverTime: now });
    }
  }
  for (const room of rooms.values()) {
    if (resumeDeadlineExpired(room.players[0], now)) {
      expireDisconnectedSeat(room, 0, now);
      continue;
    }
    if (resumeDeadlineExpired(room.players[1], now)) {
      expireDisconnectedSeat(room, 1, now);
    }
    const bothGone = room.players.every((player) => !player?.socket);
    const expired = bothGone && now - room.lastActivity > ROOM_TTL_MS;
    const reconnectExpired = bothGone && room.players.some((player) => player) &&
      room.players.every((player) => !player || now - player.disconnectedAt > RECONNECT_GRACE_MS);
    if (expired || reconnectExpired) stopRoom(room);
  }
}

const maintenanceTimer = setInterval(runMaintenance, 10_000);
maintenanceTimer.unref();

server.listen(PORT, HOST, () => {
  console.log(`Riftbomb authoritative server listening on :${PORT}`);
});

export function closeAuthoritativeServer() {
  clearInterval(maintenanceTimer);
  if (webSockets) {
    for (const socket of webSockets.clients) socket.terminate();
    webSockets.close();
  }
  if (authoritativeRooms) {
    for (const room of [...rooms.values()]) stopRoom(room);
  } else {
    rooms.clear();
  }
  revokedResumeTokens.clear();
  server.close();
}

export { parseClientMessage, server, rooms, PACKAGE_VERSION, readProjectVersion };
