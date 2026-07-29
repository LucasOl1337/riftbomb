import { performance } from "node:perf_hooks";

import { createAuthoritativeDuel } from "../../../game/create-authoritative-duel.mjs";
import { updateGridCache } from "../src/authoritative-rooms.mjs";

const roomCount = Number(process.env.BENCH_ROOMS || 128);
const snapshotPasses = Number(process.env.BENCH_SNAPSHOT_PASSES || 3_000);
const repetitions = Number(process.env.BENCH_REPETITIONS || 3);

const game = await createAuthoritativeDuel({});
const grids = Array.from({ length: roomCount }, () => game.grid.map((row) => row.slice()));
const rooms = grids.map((grid) => ({ gridCache: grid.map((row) => row.slice()) }));
const snapshots = roomCount * snapshotPasses;
const serializedCharactersPerGrid = JSON.stringify(game.grid).length;

function measureJsonStringify() {
  let observedCharacters = 0;
  const started = performance.now();
  for (let pass = 0; pass < snapshotPasses; pass += 1) {
    for (const grid of grids) observedCharacters += JSON.stringify(grid).length;
  }
  return { elapsedMs: performance.now() - started, observedCharacters };
}

function measureStructuralCache() {
  let changes = 0;
  const started = performance.now();
  for (let pass = 0; pass < snapshotPasses; pass += 1) {
    for (let index = 0; index < grids.length; index += 1) {
      if (updateGridCache(rooms[index], grids[index])) changes += 1;
    }
  }
  return { elapsedMs: performance.now() - started, changes };
}

measureJsonStringify();
measureStructuralCache();

for (let iteration = 1; iteration <= repetitions; iteration += 1) {
  const beforeFirst = iteration % 2 === 1;
  const first = beforeFirst ? measureJsonStringify() : measureStructuralCache();
  const second = beforeFirst ? measureStructuralCache() : measureJsonStringify();
  const before = beforeFirst ? first : second;
  const after = beforeFirst ? second : first;
  console.log(JSON.stringify({
    iteration,
    order: beforeFirst ? "before-after" : "after-before",
    rooms: roomCount,
    snapshotPasses,
    snapshots,
    gridRows: game.grid.length,
    gridCells: game.grid.reduce((total, row) => total + row.length, 0),
    beforeMs: Number(before.elapsedMs.toFixed(3)),
    afterMs: Number(after.elapsedMs.toFixed(3)),
    speedup: Number((before.elapsedMs / after.elapsedMs).toFixed(2)),
    temporaryGridStringsBefore: snapshots,
    temporaryGridStringsAfter: 0,
    serializedCharactersBefore: before.observedCharacters,
    serializedCharactersAfter: 0,
    expectedSerializedCharacters: snapshots * serializedCharactersPerGrid,
    detectedChangesAfterWarmup: after.changes
  }));
}
