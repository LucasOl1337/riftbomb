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
const MAX_ROOMS = Number(process.env.MAX_ROOMS || 256);
const MAX_REVOKED_RESUME_TOKENS = Math.max(256, Math.min(16_384, MAX_ROOMS * 16));
const REVOKED_RESUME_SWEEP_LIMIT = 64;
const runtimePerformance = globalThis.performance;
const WEBSOCKET_OPEN = 1;
const WEBSOCKET_CLOSED = 3;
const PROXY_SECRET = process.env.GAME_SERVER_PROXY_SECRET || "";
const rooms = new Map();

let cryptoRuntimePromise = null;
let webSocketRuntimePromise = null;
// SERVER_BOOT_LAZY_V1: support modules are not needed to bind the HTTP port.
let serverRuntimePromise = null;
let authoritativeRooms = null;
let jsonTransport = null;
let allowMessage = null;
let getHealthResponse = null;
let readEventLoopUtilization = null;
let webSockets = null;

function send(socket, message) {
  return jsonTransport.send(socket, message);
}

function broadcast(sockets, message) {
  return jsonTransport.broadcast(sockets, message);
}

function closeSocket(socket, code, reason, { terminatePending = false } = {}) {
  if (socket.readyState === WEBSOCKET_OPEN) socket.close(code, reason);
  else if (terminatePending && socket.readyState !== WEBSOCKET_CLOSED) socket.terminate();
}

function loadServerRuntime() {
  return serverRuntimePromise ??= Promise.all([
    import("./authoritative-rooms.mjs"),
    import("./json-transport.mjs"),
    import("./message-rate-limit.mjs"),
    import("./health-response.mjs")
  ]).then(([authoritative, transport, limiter, health]) => {
    jsonTransport = transport.createJsonTransport({ openState: WEBSOCKET_OPEN });
    allowMessage = limiter.createMessageRateLimiter();
    authoritativeRooms = new authoritative.AuthoritativeRooms({
      rooms,
      maxRooms: MAX_ROOMS,
      revokedResumeCapacity: MAX_REVOKED_RESUME_TOKENS,
      revokedResumeSweepLimit: REVOKED_RESUME_SWEEP_LIMIT,
      transport: {
        send,
        broadcast,
        close: closeSocket,
        isOpen: (socket) => socket.readyState === WEBSOCKET_OPEN
      }
    });
    readEventLoopUtilization = health.createEventLoopUtilizationSampler(
      () => runtimePerformance.eventLoopUtilization()
    );
    getHealthResponse = health.createHealthResponseCache(() => {
      const lifecycle = authoritativeRooms.lifecycleSnapshot();
      return {
        ok: true,
        service: "riftbomb-authoritative",
        version: PACKAGE_VERSION,
        rooms: lifecycle.rooms,
        quickMatchWaiting: lifecycle.quickMatchWaiting,
        authority: "server",
        region: "sa-saopaulo-1",
        performance: {
          ...authoritativeRooms.performanceSnapshot(),
          webSocketClients: webSockets?.clients.size || 0,
          eventLoopUtilization: readEventLoopUtilization()
        }
      };
    }, { ttlMs: health.DEFAULT_HEALTH_RESPONSE_TTL_MS });
    return { allowMessage, authoritativeRooms };
  });
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
    return runtime.authoritativeRooms.acceptConnection(socket, message, cryptoRuntime);
  }
  runtime.authoritativeRooms.receive(socket, message);
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
  // Protocol violations belong to the peer; the listener keeps the process alive.
  socket.on("error", () => undefined);
  socket.on("message", (message) => { void handleMessage(socket, message); });
  socket.on("close", () => authoritativeRooms?.disconnect(socket));
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

export function resumeSecuritySnapshot() {
  return authoritativeRooms?.lifecycleSnapshot().resumeSecurity || {
    size: 0,
    capacity: MAX_REVOKED_RESUME_TOKENS,
    sweepLimit: REVOKED_RESUME_SWEEP_LIMIT
  };
}

export function webSocketRuntimeSnapshot() {
  return {
    loaded: webSocketRuntimePromise !== null,
    serverCreated: webSockets !== null
  };
}

export function runMaintenance(now = Date.now()) {
  if (webSockets) {
    for (const socket of webSockets.clients) {
      if (now - socket.lastSeen > 45_000) socket.terminate();
      else send(socket, { type: "ping", serverTime: now });
    }
  }
  authoritativeRooms?.maintain(now);
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
  if (authoritativeRooms) authoritativeRooms.shutdown();
  else rooms.clear();
  server.close();
}

export { parseClientMessage, server, rooms, PACKAGE_VERSION, readProjectVersion };
