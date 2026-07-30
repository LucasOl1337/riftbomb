import { createServer } from "node:http";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { performance } from "node:perf_hooks";
import { WebSocketServer, WebSocket } from "ws";
import { AuthoritativeRooms, isChampion, validPreset } from "./authoritative-rooms.mjs";
import { createJsonTransport } from "./json-transport.mjs";
import { createMessageRateLimiter } from "./message-rate-limit.mjs";

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
const PROXY_SECRET = process.env.GAME_SERVER_PROXY_SECRET || "";
const ROOM_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const rooms = new Map();
const quickMatchQueue = [];
const revokedResumeTokens = createBoundedRevokedResumeTokens({
  capacity: MAX_REVOKED_RESUME_TOKENS,
  sweepLimit: REVOKED_RESUME_SWEEP_LIMIT
});
const jsonTransport = createJsonTransport({ openState: WebSocket.OPEN });
const allowMessage = createMessageRateLimiter();

function send(socket, message) {
  return jsonTransport.send(socket, message);
}

function broadcast(room, message) {
  return jsonTransport.broadcast(
    [room.players[0]?.socket, room.players[1]?.socket],
    message
  );
}
const authoritativeRooms = new AuthoritativeRooms({ rooms, broadcast });

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

function digestResumeToken(value) {
  if (typeof value !== "string" || !RESUME_TOKEN_PATTERN.test(value)) return null;
  return createHash("sha256").update(value, "utf8").digest();
}

function readResumeClaim(message) {
  if (message?.resumeProtocol === undefined) {
    return { valid: true, version: 0, digest: null };
  }
  if (message.resumeProtocol !== RESUME_PROTOCOL_VERSION) {
    return { valid: false, version: 0, digest: null };
  }
  const digest = digestResumeToken(message.resumeToken);
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

function sameResumeToken(expected, presented) {
  return Buffer.isBuffer(expected) && Buffer.isBuffer(presented) &&
    expected.length === presented.length && timingSafeEqual(expected, presented);
}

function findQuickMatchResumeSeat(presented) {
  if (!Buffer.isBuffer(presented)) return null;
  for (const room of rooms.values()) {
    for (let index = 0; index < room.players.length; index += 1) {
      const player = room.players[index];
      if (player?.quickMatch !== true ||
          player.resumeProtocol !== RESUME_PROTOCOL_VERSION ||
          !sameResumeToken(player.resumeTokenDigest, presented)) continue;
      if (resumeDeadlineExpired(player, Date.now())) {
        expireDisconnectedSeat(room, index, Date.now());
        return { expired: true };
      }
      return { room, index, role: index === 0 ? "host" : "guest" };
    }
  }
  return null;
}

function removeFromQuickMatchQueue(socket) {
  const index = quickMatchQueue.findIndex((entry) => entry.socket === socket);
  if (index >= 0) quickMatchQueue.splice(index, 1);
  socket.quickMatchQueued = false;
}

function nextRoomCode() {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    let code = "";
    for (let index = 0; index < 6; index += 1) {
      code += ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return "";
}

function joinQuickMatch(socket, message, resumeClaim) {
  // Once queued, repeated frames from this socket are a no-op. A fresh socket
  // with the same bearer is still allowed to replace it below after reload.
  if (socket.quickMatchQueued) return;
  if (resumeClaim.version === RESUME_PROTOCOL_VERSION) {
    const resumedSeat = findQuickMatchResumeSeat(resumeClaim.digest);
    if (resumedSeat?.expired) {
      return send(socket, { type: "error", error: "resume_expired" });
    }
    if (resumedSeat) {
      attachPlayerToRoom(socket, {
        ready: true,
        inputProtocol: message.inputProtocol,
        actionProtocol: message.actionProtocol
      }, resumedSeat.room, resumedSeat.role, { quickMatch: true, resumeClaim });
      return;
    }
    const queuedIndex = quickMatchQueue.findIndex((entry) =>
      entry.resumeClaim?.version === RESUME_PROTOCOL_VERSION &&
      sameResumeToken(entry.resumeClaim.digest, resumeClaim.digest)
    );
    if (queuedIndex >= 0) {
      const queued = quickMatchQueue[queuedIndex];
      if (queued.socket === socket) return;
      queued.socket.quickMatchQueued = false;
      queued.socket.riftbombSuperseded = true;
      socket.quickMatchQueued = true;
      quickMatchQueue[queuedIndex] = {
        socket,
        preset: validPreset(message.preset),
        inputProtocol: message.inputProtocol === 1 ? 1 : 0,
        actionProtocol: message.actionProtocol === 1 ? 1 : 0,
        resumeClaim
      };
      if (queued.socket.readyState === WebSocket.OPEN) {
        queued.socket.close(SESSION_REPLACED_CLOSE_CODE, "session_replaced");
      }
      send(socket, { type: "quick-queued", position: queuedIndex + 1 });
      return;
    }
  }
  if (rooms.size >= MAX_ROOMS) return send(socket, { type: "error", error: "server_full" });

  while (quickMatchQueue.length) {
    const waiting = quickMatchQueue.shift();
    waiting.socket.quickMatchQueued = false;
    if (waiting.socket.readyState !== WebSocket.OPEN || waiting.socket.riftbomb) continue;

    const code = nextRoomCode();
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
    }, room, "host", { quickMatch: true, resumeClaim: waiting.resumeClaim });
    attachPlayerToRoom(socket, {
      ready: true,
      inputProtocol: message.inputProtocol,
      actionProtocol: message.actionProtocol
    }, room, "guest", { quickMatch: true, resumeClaim });
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
  send(socket, { type: "quick-queued", position: quickMatchQueue.length });
}

function attachPlayer(socket, message) {
  const resumeClaim = readResumeClaim(message);
  if (!resumeClaim.valid) {
    return send(socket, { type: "error", error: resumeClaim.error || "invalid_resume" });
  }
  if (message.resumeOnly === true && resumeClaim.version !== RESUME_PROTOCOL_VERSION) {
    return send(socket, { type: "error", error: "invalid_resume" });
  }
  if (message.type === "quick-match") return joinQuickMatch(socket, message, resumeClaim);
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
    resumeOnly: message.resumeOnly === true
  });
}

function attachPlayerToRoom(socket, message, room, role, {
  quickMatch = false,
  resumeClaim = readResumeClaim(message),
  resumeOnly = false
} = {}) {
  const index = role === "host" ? 0 : 1;
  let current = room.players[index];
  const expiredDigest = expireDisconnectedSeat(room, index, Date.now());
  if (expiredDigest) {
    if (sameResumeToken(expiredDigest, resumeClaim.digest)) {
      return send(socket, { type: "error", error: "resume_expired" });
    }
    if (index === 0) return send(socket, { type: "error", error: "room_not_found" });
    current = room.players[index];
  }
  if (resumeOnly && !current) {
    return send(socket, { type: "error", error: "resume_denied" });
  }
  const protectedSeat = current?.resumeProtocol === RESUME_PROTOCOL_VERSION;
  if (protectedSeat && !sameResumeToken(current.resumeTokenDigest, resumeClaim.digest)) {
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
    player.resumeProtocol = RESUME_PROTOCOL_VERSION;
    player.resumeTokenDigest = resumeClaim.digest;
  }
  player.connectionGeneration = (player.connectionGeneration || 0) + 1;
  room.players[index] = player;
  socket.riftbomb = { room, index, generation: player.connectionGeneration };
  room.lastActivity = Date.now();
  if (room.game) {
    room.inputs[index] = 0;
    if (player.inputProtocol === 1) room.inputReliable[index] = true;
    if (player.actionProtocol === 1) room.actionReliable[index] = true;
    room.gridCache = null;
  }
  if (previousSocket && previousSocket !== socket &&
      previousSocket.readyState === WebSocket.OPEN) {
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
    for (const player of room.players) revokePlayerResumeToken(player, now);
    room.players = [null, null];
    room.inputs = [0, 0];
    authoritativeRooms.stop(room);
    for (const peer of peers) {
      send(peer, { type: "room-closed" });
      if (peer.readyState === WebSocket.OPEN) peer.close(4002, "room_closed");
    }
    return true;
  }
  revokePlayerResumeToken(room.players[index], Date.now());
  room.players[index] = null;
  room.inputs[index] = 0;
  room.inputAccepted[index] = 0;
  room.inputApplied[index] = 0;
  room.inputReliable[index] = false;
  room.actionAck[index] = 0;
  room.actionReliable[index] = false;
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

function handleMessage(socket, raw) {
  if (!allowMessage(socket)) return;
  const message = parseClientMessage(raw);
  if (!message) return;
  socket.lastSeen = Date.now();
  if (message.type === "pong") return;
  if (socket.riftbombSuperseded || socket.riftbombReleased) return;
  if (!socket.riftbomb) return attachPlayer(socket, message);
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
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      ok: true,
      rooms: rooms.size,
      quickMatchWaiting: quickMatchQueue.length,
      authority: "server",
      region: "sa-saopaulo-1",
      performance: {
        ...authoritativeRooms.performanceSnapshot(),
        webSocketClients: webSockets.clients.size,
        eventLoopUtilization: Number(performance.eventLoopUtilization().utilization.toFixed(4))
      }
    }));
    return;
  }
  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});

const webSockets = new WebSocketServer({
  server,
  path: WS_PATH,
  maxPayload: 32_768,
  verifyClient: ({ req }, done) => {
    const authorized = !PROXY_SECRET || req.headers["x-riftbomb-proxy"] === PROXY_SECRET;
    done(authorized, authorized ? 101 : 401, authorized ? undefined : "Unauthorized proxy");
  }
});
webSockets.on("connection", (socket) => {
  socket.lastSeen = Date.now();
  // Protocol violations (including maxPayload) belong to the offending peer;
  // ws closes that connection, while this listener keeps the server process alive.
  socket.on("error", () => undefined);
  socket.on("message", (message) => handleMessage(socket, message));
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
});

function revokePlayerResumeToken(player, now) {
  if (player?.resumeProtocol !== RESUME_PROTOCOL_VERSION ||
      !Buffer.isBuffer(player.resumeTokenDigest)) return null;
  const digest = player.resumeTokenDigest;
  revokedResumeTokens.revoke(digest, now + ROOM_TTL_MS);
  player.resumeProtocol = 0;
  player.resumeTokenDigest = null;
  return digest;
}

function closeRoomAfterHostResumeExpiry(room, now) {
  for (const player of room.players) {
    revokePlayerResumeToken(player, now);
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
    if (activeSocket.readyState === WebSocket.OPEN) {
      activeSocket.close(SESSION_EXPIRED_CLOSE_CODE, "resume_expired");
    } else if (activeSocket.readyState !== WebSocket.CLOSED) {
      activeSocket.terminate();
    }
  }
  room.inputs = [0, 0];
  authoritativeRooms.stop(room);
}

function releaseGuestAfterResumeExpiry(room, now) {
  const guest = room.players[1];
  const expiredDigest = revokePlayerResumeToken(guest, now);
  room.players[1] = null;
  room.inputs[1] = 0;
  room.inputAccepted[1] = 0;
  room.inputApplied[1] = 0;
  room.inputReliable[1] = false;
  room.actionAck[1] = 0;
  room.actionReliable[1] = false;
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

export function runMaintenance(now = Date.now()) {
  revokedResumeTokens.sweep(now);
  for (const socket of webSockets.clients) {
    if (now - socket.lastSeen > 45_000) socket.terminate();
    else send(socket, { type: "ping", serverTime: now });
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
    if (expired || reconnectExpired) authoritativeRooms.stop(room);
  }
}

const maintenanceTimer = setInterval(runMaintenance, 10_000);
maintenanceTimer.unref();

server.listen(PORT, HOST, () => {
  console.log(`Riftbomb authoritative server listening on :${PORT}`);
});

export function closeAuthoritativeServer() {
  clearInterval(maintenanceTimer);
  for (const socket of webSockets.clients) socket.terminate();
  for (const room of [...rooms.values()]) authoritativeRooms.stop(room);
  revokedResumeTokens.clear();
  webSockets.close();
  server.close();
}

export { parseClientMessage, server, rooms };
