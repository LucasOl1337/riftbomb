import { createServer } from "node:http";
import { readFileSync, existsSync, createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { Game } from "./game-loader.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 8080);
const TICK = 1000 / 30;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".json": "application/json",
  ".woff2": "font/woff2"
};

const CHAMPIONS = new Set(["katarina", "zed", "renekton", "vladimir", "gangplank", "ziggs"]);

const clients = [];
let game = null;
let gameInterval = null;
let serverTick = 0;

const noOp = () => {};

function createSnapshot(value) {
  const exclude = new Set(["renderer", "music", "presentation", "keys", "touchDirs"]);
  return JSON.parse(JSON.stringify(value, (key, v) => {
    if (key === "") return v;
    if (exclude.has(key)) return undefined;
    if (v instanceof Set) return Array.from(v);
    if (v instanceof Map) return Array.from(v.entries());
    if (typeof v === "function") return undefined;
    return v;
  }));
}

function broadcast(message) {
  const text = JSON.stringify(message);
  for (const client of clients) {
    if (client.ws.readyState === 1) client.ws.send(text);
  }
}

function broadcastLobby() {
  broadcast({
    type: "lobby",
    players: clients.length,
    max: 2,
    choices: clients.map((c) => ({ playerId: c.playerId, champion: c.champion, ready: Boolean(c.champion) }))
  });
}

function stopGame() {
  if (gameInterval) {
    clearInterval(gameInterval);
    gameInterval = null;
  }
  game = null;
  serverTick = 0;
  for (const client of clients) client.keys.clear();
}

function applyInputs() {
  if (!game) return;
  for (const client of clients) {
    const player = game.players[client.playerId - 1];
    if (player) player.keys = client.keys;
  }
}

function tick() {
  if (!game) return;
  serverTick += 1;
  applyInputs();
  try {
    game.update(1 / 30);
  } catch (error) {
    console.error("Game tick failed:", error.stack || error.message);
    broadcast({ type: "error", message: error.message });
    stopGame();
    return;
  }
  broadcast({ type: "snapshot", tick: serverTick, snapshot: createSnapshot(game) });
  if (game.mode === "matchover") {
    broadcast({ type: "finish", wins: game.roundWins });
    stopGame();
  }
}

function startGame() {
  stopGame();
  const presentation = {
    update: noOp,
    selectChampion: noOp,
    prepareRound: noOp,
    announce: noOp,
    finish: noOp,
    setPaused: noOp
  };
  const music = { effect: noOp, explosion: noOp, togglePause: noOp };
  const renderer = { addShock: noOp, cameraShake: 0 };

  game = new Game(renderer, music, presentation);
  game.p2Human = true;
  game.selectedArena = "lattice";
  game.selectedChampion = clients[0]?.champion || "katarina";
  game.selectedChampionP2 = clients[1]?.champion || "ziggs";
  game.start();

  for (const client of clients) {
    client.ws.send(JSON.stringify({
      type: "start",
      playerId: client.playerId,
      snapshot: createSnapshot(game)
    }));
  }

  gameInterval = setInterval(tick, TICK);
}

function maybeStart() {
  if (clients.length < 2) return;
  if (clients.every((c) => c.champion)) startGame();
}

function handleInput(playerId, message) {
  const client = clients.find((c) => c.playerId === playerId);
  if (!client) return;

  if (message.type === "champion") {
    if (CHAMPIONS.has(message.champion) && !client.champion) {
      client.champion = message.champion;
      broadcastLobby();
      maybeStart();
    }
    return;
  }

  if (message.type === "keydown") {
    client.keys.add(message.key);
  } else if (message.type === "keyup") {
    client.keys.delete(message.key);
  } else if (message.type === "action" && game) {
    const player = game.players[playerId - 1];
    if (!player?.alive) return;
    if (message.action === "bomb") {
      game.placeBomb(player);
    } else if (message.action === "satchel") {
      game.requestDash(player);
    } else if (message.action === "ability") {
      game.castAbility(message.slot, player);
    }
  }
}

const httpServer = createServer((request, response) => {
  let url = decodeURIComponent(request.url);
  if (url === "/") url = "/index.html";
  if (url.includes("..")) {
    response.writeHead(403);
    response.end();
    return;
  }

  const filePath = path.join(ROOT, url);
  if (!existsSync(filePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
  });
  createReadStream(filePath).pipe(response);
});

const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

wss.on("connection", (ws, request) => {
  console.log("ws connect", request.url, "clients", clients.length);
  if (clients.length >= 2) {
    ws.close(1002, "room full");
    return;
  }

  const playerId = clients.length + 1;
  const client = { ws, playerId, keys: new Set(), champion: null };
  clients.push(client);
  ws.send(JSON.stringify({ type: "welcome", playerId }));
  broadcastLobby();

  ws.on("message", (data) => {
    try {
      handleInput(playerId, JSON.parse(data));
    } catch {
      // ignore malformed messages
    }
  });

  ws.on("close", (code) => {
    console.log("ws close", code, "player", playerId);
    const index = clients.findIndex((c) => c.ws === ws);
    if (index !== -1) clients.splice(index, 1);
    stopGame();
    broadcastLobby();
  });
});

httpServer.listen(PORT, () => {
  console.log(`Riftbomb online server on port ${PORT}`);
});
