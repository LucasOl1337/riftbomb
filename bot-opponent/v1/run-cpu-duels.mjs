/**
 * Headless CPU-vs-CPU duel harness — Bot V1/Renekton (P2) vs baseline (P1).
 *
 * Runs the real Match rules (game/run-champion-bomb-duel.js) inside a Node
 * `vm` context with stubbed renderer/sfx/presentation — no browser, no DOM.
 * P1 is piloted WITHOUT touching the game: the harness imitates the keyboard
 * state a human produces (WASD in `match.keys`) and calls the same public
 * entrypoints the input layer uses (`placeBomb`, `castAbility`).
 *
 * Determinism: every source of randomness comes from seeded mulberry32
 * streams — the Match's `this.random` (map crates, particles), the V1 policy
 * random and the P1 baseline random. Same seed => same report.
 *
 * Usage: node bot-opponent/v1/run-cpu-duels.mjs --matches 100 --seed 42
 * Output: one JSON report on stdout (see REPORT_FIELDS below).
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameDirectory = path.resolve(__dirname, "../../game");

const DT = 1 / 60;
// Safety cap in simulated frames: 5 rounds x 90s plus transitions, with slack.
const MAX_FRAMES_PER_MATCH = 60 * 480;
// Same mapping the Match uses for bot skill intents (BOT_SKILL_SLOTS).
const SKILL_SLOTS = Object.freeze({ q: 0, w: 1, e: 2, r: 3 });

/** mulberry32 — tiny seeded PRNG, deterministic across platforms. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseArgs(argv) {
  const options = { matches: 100, seed: 42 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--matches") options.matches = Number(argv[++i]);
    else if (argv[i] === "--seed") options.seed = Number(argv[++i]);
  }
  if (!Number.isInteger(options.matches) || options.matches < 1) {
    throw new Error("--matches must be a positive integer");
  }
  if (!Number.isFinite(options.seed)) throw new Error("--seed must be a number");
  return options;
}

function createStubs() {
  const renderer = {
    hitPulse: 0,
    cameraShake: 0,
    mobilePerf: false,
    addShock() {},
    ensureChampionModel() {}
  };
  const sfx = { effect() {}, explosion() {} };
  const presentation = {
    selectChampion() {},
    prepareRound() {},
    announce() {},
    update() {},
    finish() {}
  };
  return { renderer, sfx, presentation };
}

/**
 * Loads the baseline bundle, the V1 bundle and the Match rules into one vm
 * context (same script order as the browser page) and returns the Game class.
 */
async function loadGameClass() {
  const baseline = await readFile(path.join(gameDirectory, "load-baseline-bot.js"), "utf8");
  const v1 = await readFile(path.join(gameDirectory, "load-v1-bot.js"), "utf8");
  const rules = await readFile(path.join(gameDirectory, "run-champion-bomb-duel.js"), "utf8");

  const rendererColors = new Proxy({}, { get: (target, key) => key });
  const context = vm.createContext({
    console,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    TAU: Math.PI * 2,
    Renderer: { colors: rendererColors },
    // Pickup art is render-only; the headless harness never draws it.
    skillArtUrl: () => ""
  });
  vm.runInContext(baseline, context, { filename: "load-baseline-bot.js" });
  vm.runInContext(v1, context, { filename: "load-v1-bot.js" });
  // Top-level `const` lives in the context's lexical scope, not on globalThis;
  // expose the bundle namespace so the harness can reach it from Node.
  vm.runInContext("globalThis.RIFTBOMB_BOTS = RIFTBOMB_BOTS;", context);
  vm.runInContext(`${rules}\nglobalThis.Game = Game;`, context, { filename: "run-champion-bomb-duel.js" });
  return context;
}

/**
 * Drives P1 through the human input surface: translates a policy intent into
 * the WASD key set a player would hold, then plants/casts via the public
 * entrypoints. Never writes Match state beyond what those entrypoints do.
 */
function applyHumanStyleIntent(match, player, intent) {
  for (const code of ["KeyW", "KeyA", "KeyS", "KeyD"]) match.keys.delete(code);
  if (intent.dx < 0) match.keys.add("KeyA");
  else if (intent.dx > 0) match.keys.add("KeyD");
  if (intent.dz < 0) match.keys.add("KeyW");
  else if (intent.dz > 0) match.keys.add("KeyS");
  if (intent.plantBomb) match.placeBomb(player);
  if (intent.skill != null && intent.skill in SKILL_SLOTS) {
    match.castAbility(SKILL_SLOTS[intent.skill], player);
  }
}

function createRoundStats() {
  return {
    frames: 0,
    v1Pickups: 0,
    v1FirstBomb: null, // bomb id of the first V1 bomb this round
    v1SurvivedFirstBomb: null // true/false once that bomb exploded
  };
}

function runMatch(context, matchIndex, seed) {
  const { renderer, sfx, presentation } = createStubs();
  const match = new context.Game(renderer, sfx, presentation);

  // Deterministic RNG: replace the Match's xorshift (start() would reseed it
  // from Date.now) with a seeded stream, and give each policy its own stream.
  const gameRng = mulberry32((seed ^ (matchIndex * 0x9E3779B9)) >>> 0);
  const v1Rng = mulberry32((seed ^ 0x5F3759DF ^ (matchIndex * 0x85EBCA6B)) >>> 0);
  const p1Rng = mulberry32((seed ^ 0xC2B2AE35 ^ (matchIndex * 0x27D4EB2F)) >>> 0);
  match.random = gameRng;

  // V1/Renekton pilots P2 — the same champion the pilot expects to cast.
  match.selectChampion2("renekton");
  match.botPolicy = context.RIFTBOMB_BOTS.createV1Policy({
    champion: context.RIFTBOMB_BOTS.createRenektonPilot({ random: v1Rng }),
    random: v1Rng
  });
  const p1Policy = context.RIFTBOMB_BOTS.createBaselinePolicy({ random: p1Rng });

  // Instrumentation wraps instance methods only — Match rules stay untouched.
  const skillsCast = { q: 0, w: 0, e: 0, r: 0 };
  const originalCastAbility = match.castAbility.bind(match);
  match.castAbility = (slot, player = match.player) => {
    const result = originalCastAbility(slot, player);
    if (result && player.id === 2) skillsCast["qwer"[slot]] += 1;
    return result;
  };
  const originalCollectPickups = match.collectPickups.bind(match);
  match.collectPickups = () => {
    const before = match.pickups.slice();
    originalCollectPickups();
    const collected = before.filter((item) => !match.pickups.includes(item));
    for (const item of collected) {
      const p2 = match.players[1];
      if (p2.alive && Math.hypot(item.x - p2.x, item.z - p2.z) <= 0.58) roundStats.v1Pickups += 1;
    }
  };

  let winner = null;
  const originalFinish = presentation.finish.bind(presentation);
  presentation.finish = (matchWinner, ...rest) => {
    winner = matchWinner;
    originalFinish(matchWinner, ...rest);
  };

  const rounds = [];
  let roundStats = createRoundStats();
  let prevRoundWins = [0, 0];
  let prevRound = match.round;
  let pendingRoundWinner = null; // decided, waiting for the round to close
  let frames = 0;
  let timedOut = false;

  const closeRound = () => {
    rounds.push({
      winner: pendingRoundWinner,
      frames: roundStats.frames,
      v1Pickups: roundStats.v1Pickups,
      v1SurvivedFirstBomb: roundStats.v1SurvivedFirstBomb
    });
    roundStats = createRoundStats();
    pendingRoundWinner = null;
  };

  match.start();

  while (match.mode === "playing") {
    if (frames >= MAX_FRAMES_PER_MATCH) {
      timedOut = true;
      break;
    }
    frames += 1;
    roundStats.frames += 1;

    // P1 thinks through the same perception bundle, with selfId = 1.
    const p1 = match.players[0];
    if (p1?.alive && !match.roundLocked) {
      const view = context.RIFTBOMB_BOTS.buildWorldView(match, DT, p1.id);
      applyHumanStyleIntent(match, p1, p1Policy.think(view, DT));
    }
    match.update(DT);

    // Detect the fate of the V1's first bomb of the round.
    if (roundStats.v1SurvivedFirstBomb === null) {
      if (roundStats.v1FirstBomb === null) {
        const first = match.bombs.find((bomb) => bomb.ownerId === 2);
        if (first) roundStats.v1FirstBomb = first.id;
      } else {
        const bomb = match.bombs.find((candidate) => candidate.id === roundStats.v1FirstBomb);
        if (!bomb || bomb.exploded) {
          roundStats.v1SurvivedFirstBomb = match.players[1].alive;
        }
      }
    }

    // Round decision: a win counter moved while this round was live. A draw
    // moves no counter — it is recorded when the round closes instead.
    if (match.roundWins[0] !== prevRoundWins[0] || match.roundWins[1] !== prevRoundWins[1]) {
      pendingRoundWinner = match.roundWins[1] > prevRoundWins[1] ? 2 : 1;
      prevRoundWins = [...match.roundWins];
    }

    // Round boundary: startRound() bumped the counter and reset the players.
    if (match.round !== prevRound) {
      prevRound = match.round;
      closeRound();
      p1Policy.reset({ random: () => 0 });
    }
  }

  // The deciding round closes with finishMatch, not startRound.
  if (winner || pendingRoundWinner !== null) closeRound();

  if (timedOut) {
    // CPU stalemates can draw rounds forever (identical power at the 90s
    // limit); settle the match by the official round score.
    const [p1Wins, p2Wins] = match.roundWins;
    winner = p2Wins > p1Wins ? match.players[1] : p1Wins > p2Wins ? match.players[0] : null;
  }

  return { winner, rounds, frames, timedOut, skillsCast };
}

export async function runCpuDuels({ matches = 100, seed = 42 } = {}) {
  const context = await loadGameClass();
  const perMatch = [];
  for (let i = 0; i < matches; i += 1) {
    perMatch.push(runMatch(context, i, seed >>> 0));
  }
  if (process.env.DUELS_DEBUG) { // TEMP cycle-9 diagnosis — revert after use
    console.error(JSON.stringify(perMatch.map((m, i) => ({
      match: i,
      winner: m.winner?.id ?? 0,
      rounds: m.rounds.map((r) => `${r.winner ?? 0}${r.v1SurvivedFirstBomb === false ? "x" : ""}`)
    }))));
  }

  const v1MatchWins = perMatch.filter((m) => m.winner?.id === 2).length;
  const baselineMatchWins = perMatch.filter((m) => m.winner?.id === 1).length;
  const drawnMatches = perMatch.filter((m) => !m.winner).length;
  const allRounds = perMatch.flatMap((m) => m.rounds);
  const v1RoundWins = allRounds.filter((r) => r.winner === 2).length;
  const v1RoundLosses = allRounds.filter((r) => r.winner === 1).length;
  const drawnRounds = allRounds.filter((r) => r.winner === null).length;
  const bombRounds = allRounds.filter((r) => r.v1SurvivedFirstBomb !== null);
  const survivedFirstBomb = bombRounds.filter((r) => r.v1SurvivedFirstBomb).length;
  const skillsCast = { q: 0, w: 0, e: 0, r: 0 };
  for (const m of perMatch) {
    for (const slot of Object.keys(skillsCast)) skillsCast[slot] += m.skillsCast?.[slot] ?? 0;
  }

  const round = (value, digits = 4) => Number(value.toFixed(digits));
  return {
    seed: seed >>> 0,
    matches,
    v1: { champion: "renekton", player: 2 },
    opponent: { policy: "baseline", player: 1, champion: "katarina" },
    v1MatchWins,
    baselineMatchWins,
    drawnMatches,
    v1WinRate: round(v1MatchWins / matches),
    rounds: allRounds.length,
    v1RoundWins,
    v1RoundLosses,
    drawnRounds,
    v1FirstBombSurvivalRate: bombRounds.length ? round(survivedFirstBomb / bombRounds.length) : null,
    v1PickupsPerRound: allRounds.length
      ? round(allRounds.reduce((sum, r) => sum + r.v1Pickups, 0) / allRounds.length)
      : 0,
    v1SkillsCast: skillsCast,
    averageRoundSeconds: allRounds.length
      ? round(allRounds.reduce((sum, r) => sum + r.frames, 0) / allRounds.length * DT, 2)
      : 0,
    timeouts: perMatch.filter((m) => m.timedOut).length
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await runCpuDuels(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
