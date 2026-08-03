import { readFile } from "node:fs/promises";
import vm from "node:vm";

const gameSourceUrl = new URL("./run-champion-bomb-duel.js", import.meta.url);
const combatRulesSourceUrl = new URL("./apply-combat-rules.js", import.meta.url);
let GameConstructor;
let installCombatRules;

const noOpService = new Proxy({}, {
  get: () => () => undefined
});

const AUDIO_EVENT_LIMIT = 64;
const AUDIO_SNAPSHOT_LIMIT = 32;
const EMPTY_SNAPSHOT_ARRAY = Object.freeze([]);
const EMPTY_AUDIO_SNAPSHOT = Object.freeze({
  v: 1,
  latest: 0,
  events: EMPTY_SNAPSHOT_ARRAY
});
const AUDIO_CUES = new Set([
  "barrelBoom", "bladeHit", "bomb", "cannonBarrage", "cannonImpact",
  "daggerLand", "deathLotus", "deathMark", "dominus", "explosion",
  "gangplankQ", "hemoplague", "hemoplaguePop", "hit", "katQ", "katW",
  "kill", "markPop", "pickup", "powderKeg", "removeScurvy", "renektonDice",
  "renektonE", "renektonQ", "renektonQEmpowered", "renektonW",
  "renektonWEmpowered", "sanguinePool", "shield", "shunpo", "tidesOfBlood",
  "vladimirQ", "vladimirQEmpowered", "voracity", "zedE", "zedQ", "zedSwap",
  "zedW"
]);

const finiteBetween = (value, min, max, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};

export function createAuthoritativeAudioRecorder(startId = 0) {
  const events = [];
  let sequence = Number.isSafeInteger(startId) && startId >= 0 ? startId : 0;
  let emptySnapshot = null;
  const record = (candidate = {}) => {
    const cue = String(candidate.type || "");
    if (!AUDIO_CUES.has(cue)) return false;
    const event = {
      id: ++sequence,
      cue,
      strength: finiteBetween(candidate.strength, 0.5, 1.45, 1),
      x: finiteBetween(candidate.x, -64, 64),
      z: finiteBetween(candidate.z, -64, 64)
    };
    const chainDepth = finiteBetween(candidate.options?.chainDepth, 0, 4);
    if (chainDepth !== null) event.chainDepth = Math.trunc(chainDepth);
    events.push(event);
    if (events.length > AUDIO_EVENT_LIMIT) events.splice(0, events.length - AUDIO_EVENT_LIMIT);
    return event;
  };
  const recorder = {
    events,
    get latest() { return sequence; },
    emitGameEvent: record,
    snapshot(limit = AUDIO_SNAPSHOT_LIMIT) {
      const bounded = Math.max(0, Math.min(AUDIO_EVENT_LIMIT, Math.trunc(limit) || 0));
      if (bounded === AUDIO_SNAPSHOT_LIMIT && events.length === 0) {
        emptySnapshot ??= Object.freeze({
          v: 1,
          latest: sequence,
          events: EMPTY_SNAPSHOT_ARRAY
        });
        return emptySnapshot;
      }
      return { v: 1, latest: sequence, events: events.slice(-bounded) };
    },
    service: {
      emitGameEvent: record,
      effect(type, strength, options) {
        return record({ type, strength, x: options?.x, z: options?.z, options });
      },
      explosion(strength, options) {
        return record({ type: "explosion", strength, x: options?.x, z: options?.z, options });
      }
    }
  };
  return recorder;
}

async function loadGameConstructor() {
  if (GameConstructor) return GameConstructor;

  const [source, combatRulesSource] = await Promise.all([
    readFile(gameSourceUrl, "utf8"),
    readFile(combatRulesSourceUrl, "utf8")
  ]);
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
    lerp: (start, end, amount) => start + (end - start) * amount,
    // Loot art is presentation-only; the authoritative simulation still
    // creates the pickup, but never needs to resolve a browser asset URL.
    skillArtUrl: () => "",
    innerWidth: 1920
  });

  vm.runInContext(combatRulesSource, context, {
    filename: combatRulesSourceUrl.pathname
  });
  vm.runInContext(`${source}\n;globalThis.RiftbombGame = Game;`, context, {
    filename: gameSourceUrl.pathname
  });
  GameConstructor = context.RiftbombGame;
  installCombatRules = context.installRiftbombCombatRules;
  return GameConstructor;
}

export async function createAuthoritativeDuel(config = {}) {
  const Game = await loadGameConstructor();
  const audio = createAuthoritativeAudioRecorder(config.soundEventStartId);
  const game = new Game(noOpService, audio.service, noOpService);
  game.authoritativeSound = audio;
  game.audioEvents = audio.events;
  installCombatRules(game);
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
    const aim = Number.isFinite(action.aimX) && Number.isFinite(action.aimZ)
      ? { x: action.aimX, z: action.aimZ }
      : null;
    return game.castAbility(action.slot, player, aim ? { aim } : {});
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
      ? game.bombs.length === 0
        ? EMPTY_SNAPSHOT_ARRAY
        : game.bombs.map((bomb) => ({ ...bomb, passOwners: [...(bomb.passOwners || [])] }))
      : game[key];
  }
  if (includeGrid) snapshot.grid = game.grid;
  snapshot.particles = game.particles.length === 0
    ? EMPTY_SNAPSHOT_ARRAY
    : game.particles.slice(-72);
  snapshot.sound = game.authoritativeSound?.snapshot(AUDIO_SNAPSHOT_LIMIT) || EMPTY_AUDIO_SNAPSHOT;
  snapshot.pendingWinnerId = game.pendingMatchWinner?.id || 0;
  return snapshot;
}
