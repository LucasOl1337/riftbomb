import { createServer } from "node:http";
import { randomInt } from "node:crypto";
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
const MAX_ROOMS = Number(process.env.MAX_ROOMS || 256);
const PROXY_SECRET = process.env.GAME_SERVER_PROXY_SECRET || "";
const ROOM_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const rooms = new Map();
const quickMatchQueue = [];
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

function joinQuickMatch(socket, message) {
  if (socket.quickMatchQueued) return;
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
    attachPlayerToRoom(waiting.socket, { ready: true }, room, "host", { quickMatch: true });
    attachPlayerToRoom(socket, { ready: true }, room, "guest", { quickMatch: true });
    return;
  }

  socket.quickMatchQueued = true;
  quickMatchQueue.push({ socket, preset: validPreset(message.preset) });
  send(socket, { type: "quick-queued", position: quickMatchQueue.length });
}

function attachPlayer(socket, message) {
  if (message.type === "quick-match") return joinQuickMatch(socket, message);
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
  if (role === "host" && !room) room = authoritativeRooms.create(code, message.preset);
  if (!room) return send(socket, { type: "error", error: "room_not_found" });
  attachPlayerToRoom(socket, message, room, role);
}

function attachPlayerToRoom(socket, message, room, role, { quickMatch = false } = {}) {
  const index = role === "host" ? 0 : 1;
  const current = room.players[index];
  if (current?.socket?.readyState === WebSocket.OPEN) {
    return send(socket, { type: "error", error: "role_taken" });
  }
  room.players[index] = { socket, ready: role === "host" || Boolean(message.ready), disconnectedAt: 0 };
  socket.riftbomb = { room, index };
  room.lastActivity = Date.now();
  send(socket, {
    type: "connected",
    role,
    playerId: index + 1,
    room: room.code,
    quickMatch,
    soundCursor: room.game?.authoritativeSound?.latest || room.soundEventSequence || 0
  });
  broadcast(room, authoritativeRooms.lobbyMessage(room));
  void authoritativeRooms.start(room);
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
  if (!socket.riftbomb) return attachPlayer(socket, message);
  const { room, index } = socket.riftbomb;
  room.lastActivity = Date.now();

  if (message.type === "input" && Number.isInteger(message.mask) &&
      message.mask >= 0 && message.mask <= 15) room.inputs[index] = message.mask;
  if (message.type === "action" && room.game) {
    authoritativeRooms.applyPlayerAction(room, index + 1, message);
  }
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
  if (message.type === "rematch" && index === 0) {
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
    const { room, index } = socket.riftbomb;
    if (room.players[index]?.socket === socket) {
      room.players[index].socket = null;
      room.players[index].disconnectedAt = Date.now();
      room.inputs[index] = 0;
      broadcast(room, { type: "presence", playerId: index + 1, connected: false });
    }
  });
});

const maintenanceTimer = setInterval(() => {
  const now = Date.now();
  for (const socket of webSockets.clients) {
    if (now - socket.lastSeen > 45_000) socket.terminate();
    else send(socket, { type: "ping", serverTime: now });
  }
  for (const room of rooms.values()) {
    const bothGone = room.players.every((player) => !player?.socket);
    const expired = now - room.lastActivity > ROOM_TTL_MS;
    const reconnectExpired = bothGone && room.players.some((player) => player) &&
      room.players.every((player) => !player || now - player.disconnectedAt > RECONNECT_GRACE_MS);
    if (expired || reconnectExpired) authoritativeRooms.stop(room);
  }
}, 10_000);
maintenanceTimer.unref();

server.listen(PORT, HOST, () => {
  console.log(`Riftbomb authoritative server listening on :${PORT}`);
});

export function closeAuthoritativeServer() {
  clearInterval(maintenanceTimer);
  for (const socket of webSockets.clients) socket.terminate();
  for (const room of [...rooms.values()]) authoritativeRooms.stop(room);
  webSockets.close();
  server.close();
}

export { parseClientMessage, server, rooms };
