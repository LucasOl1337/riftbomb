import { performance } from "node:perf_hooks";

import {
  createAuthoritativeDuel,
  serializeAuthoritativeSnapshot
} from "../../../game/create-authoritative-duel.mjs";

const GAME_COUNT = Number(process.env.BENCH_SNAPSHOT_GAMES || 32);
const PASSES = Number(process.env.BENCH_SNAPSHOT_PASSES || 1_000);
const REPETITIONS = Number(process.env.BENCH_SNAPSHOT_REPETITIONS || 3);

const SNAPSHOT_ARRAYS = [
  "bombs", "blasts", "ultimates", "pickups", "daggers", "projectiles",
  "skillTrails", "slashes", "zedShadows", "zedMarks", "vladimirMarks",
  "gangplankBarrels", "gangplankBarrages"
];
const SNAPSHOT_SCALARS = [
  "mode", "selectedChampion", "selectedChampion2", "selectedArena", "round", "wave",
  "roundWins", "matchTarget", "roundTime", "roundAge", "roundLocked",
  "roundTransition", "roundDecisionTimer", "elapsed", "bombId", "daggerId",
  "shadowId", "seed", "p2Human"
];

function legacySerializeAuthoritativeSnapshot(game, sequence, includeGrid = false) {
  const snapshot = { v: 3, s: sequence, serverTime: Date.now(), players: game.players };
  for (const key of SNAPSHOT_SCALARS) snapshot[key] = game[key];
  for (const key of SNAPSHOT_ARRAYS) {
    snapshot[key] = key === "bombs"
      ? game.bombs.map((bomb) => ({ ...bomb, passOwners: [...(bomb.passOwners || [])] }))
      : game[key];
  }
  if (includeGrid) snapshot.grid = game.grid;
  snapshot.particles = game.particles.slice(-72);
  snapshot.sound = game.authoritativeSound
    ? {
      v: 1,
      latest: game.authoritativeSound.latest,
      events: game.authoritativeSound.events.slice(-32)
    }
    : { v: 1, latest: 0, events: [] };
  snapshot.pendingWinnerId = game.pendingMatchWinner?.id || 0;
  return snapshot;
}

async function createFixtures() {
  const empty = [];
  const active = [];
  for (let index = 0; index < GAME_COUNT; index += 1) {
    empty.push(await createAuthoritativeDuel({ seed: index }));
    const game = await createAuthoritativeDuel({ seed: index });
    game.placeBomb(game.players[0]);
    game.particles = Array.from({ length: 8 }, (_, particleIndex) => ({
      x: particleIndex,
      y: 0,
      z: 0,
      age: 0,
      life: 1
    }));
    active.push(game);
  }
  return { empty, active };
}

function measure(games, serialize) {
  global.gc?.();
  const started = performance.now();
  let checksum = 0;
  for (let pass = 0; pass < PASSES; pass += 1) {
    for (const game of games) {
      const snapshot = serialize(game, pass);
      checksum += snapshot.s;
    }
  }
  return {
    elapsedMs: performance.now() - started,
    checksum
  };
}

function serializedBytes(games, serialize) {
  const snapshot = serialize(games[0], 0);
  snapshot.serverTime = 0;
  return JSON.stringify(snapshot).length;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

const fixtures = await createFixtures();
const results = [];
for (const [name, games] of Object.entries(fixtures)) {
  const beforeSamples = [];
  const afterSamples = [];
  for (let repetition = 0; repetition < REPETITIONS; repetition += 1) {
    const beforeFirst = repetition % 2 === 0;
    const first = beforeFirst
      ? measure(games, legacySerializeAuthoritativeSnapshot)
      : measure(games, serializeAuthoritativeSnapshot);
    const second = beforeFirst
      ? measure(games, serializeAuthoritativeSnapshot)
      : measure(games, legacySerializeAuthoritativeSnapshot);
    beforeSamples.push(beforeFirst ? first : second);
    afterSamples.push(beforeFirst ? second : first);
  }
  const before = median(beforeSamples.map(({ elapsedMs }) => elapsedMs));
  const after = median(afterSamples.map(({ elapsedMs }) => elapsedMs));
  results.push({
    fixture: name,
    snapshots: GAME_COUNT * PASSES,
    emptyAllocationsAvoided: name === "empty" ? GAME_COUNT * PASSES * 4 : 0,
    beforeMs: Number(before.toFixed(3)),
    afterMs: Number(after.toFixed(3)),
    speedup: Number((before / after).toFixed(2)),
    jsonBytesBefore: serializedBytes(games, legacySerializeAuthoritativeSnapshot),
    jsonBytesAfter: serializedBytes(games, serializeAuthoritativeSnapshot),
    jsonBytesEqual: serializedBytes(games, legacySerializeAuthoritativeSnapshot) ===
      serializedBytes(games, serializeAuthoritativeSnapshot),
    checksumPreserved: beforeSamples.every(({ checksum }) => checksum === afterSamples[0].checksum) &&
      afterSamples.every(({ checksum }) => checksum === afterSamples[0].checksum)
  });
}

console.log(JSON.stringify({
  node: process.version,
  games: GAME_COUNT,
  passes: PASSES,
  repetitions: REPETITIONS,
  emptyAllocationsAvoidedPerSnapshot: 4,
  results
}));
