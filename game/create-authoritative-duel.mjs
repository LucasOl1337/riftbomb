import { readFile } from "node:fs/promises";
import vm from "node:vm";

const gameSourceUrl = new URL("./run-champion-bomb-duel.js", import.meta.url);
let GameConstructor;

const noOpService = new Proxy({}, {
  get: () => () => undefined
});

async function loadGameConstructor() {
  if (GameConstructor) return GameConstructor;

  const source = await readFile(gameSourceUrl, "utf8");
  const colors = new Proxy({}, { get: (_target, key) => String(key) });
  const context = vm.createContext({
    Array,
    Boolean,
    Date,
    JSON,
    Map,
    Math,
    Number,
    Object,
    Set,
    String,
    TAU: Math.PI * 2,
    Renderer: { colors },
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    innerWidth: 1920
  });

  vm.runInContext(`${source}\n;globalThis.RiftbombGame = Game;`, context, {
    filename: gameSourceUrl.pathname
  });
  GameConstructor = context.RiftbombGame;
  return GameConstructor;
}

export async function createAuthoritativeDuel(config = {}) {
  const Game = await loadGameConstructor();
  const game = new Game(noOpService, noOpService, noOpService);
  game.selectedChampion = config.hostChampion || "katarina";
  game.selectedChampion2 = config.guestChampion || "zed";
  game.selectedArena = config.arena || "lattice";
  game.matchTarget = config.matchTarget === 10 ? 10 : 3;
  game.p2Human = true;
  game.seed = Number.isInteger(config.seed) ? config.seed >>> 0 : game.seed;
  game.generateMap();
  game.resetPlayers();
  game.start();
  game.p2Human = true;
  return game;
}

export function applyInputMask(game, playerId, mask) {
  const value = Number(mask) || 0;
  const keys = playerId === 1
    ? [[1, "KeyW"], [2, "KeyS"], [4, "KeyA"], [8, "KeyD"]]
    : [[1, "ArrowUp"], [2, "ArrowDown"], [4, "ArrowLeft"], [8, "ArrowRight"]];
  for (const [bit, code] of keys) {
    if (value & bit) game.keys.add(code);
    else game.keys.delete(code);
  }
}

export function applyPlayerAction(game, playerId, action) {
  if (game.mode !== "playing") return false;
  const player = game.players[playerId - 1];
  if (!player) return false;
  if (action.kind === "bomb") return game.placeBomb(player);
  if (action.kind === "ability" && Number.isInteger(action.slot)) {
    return game.castAbility(action.slot, player);
  }
  return false;
}

const snapshotArrays = [
  "bombs", "blasts", "ultimates", "pickups", "daggers", "projectiles",
  "skillTrails", "slashes", "zedShadows", "zedMarks", "vladimirMarks",
  "gangplankBarrels", "gangplankBarrages"
];

const snapshotScalars = [
  "mode", "selectedChampion", "selectedChampion2", "selectedArena", "round", "wave",
  "roundWins", "matchTarget", "roundTime", "roundAge", "roundLocked",
  "roundTransition", "roundDecisionTimer", "elapsed", "bombId", "daggerId",
  "shadowId", "seed", "p2Human"
];

export function serializeAuthoritativeSnapshot(game, sequence, includeGrid = false) {
  const snapshot = { v: 3, s: sequence, serverTime: Date.now(), players: game.players };
  for (const key of snapshotScalars) snapshot[key] = game[key];
  for (const key of snapshotArrays) {
    snapshot[key] = key === "bombs"
      ? game.bombs.map((bomb) => ({ ...bomb, passOwners: [...(bomb.passOwners || [])] }))
      : game[key];
  }
  if (includeGrid) snapshot.grid = game.grid;
  snapshot.particles = game.particles.slice(-72);
  snapshot.pendingWinnerId = game.pendingMatchWinner?.id || 0;
  return snapshot;
}
