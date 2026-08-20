import assert from "node:assert/strict";
import { test } from "node:test";

import { createV1Policy } from "./create-v1-policy.mjs";
import { ownBombBlastCovers } from "./danger-timeline.mjs";
import { hasTemporalBombEscape } from "./open-route.mjs";
import { runCpuDuels } from "./run-cpu-duels.mjs";

const COLS = 13;
const ROWS = 11;
const TILE = 1;

/** Salt Lens (lattice) hard walls + border, matching ARENA_TEMPLATES.lattice. */
function latticeGrid() {
  const grid = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) =>
      (r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1 ? 1 : 0)));
  for (let r = 2; r < ROWS - 1; r += 2) {
    for (let c = 2; c < COLS - 1; c += 2) grid[r][c] = 1;
  }
  return grid;
}

/** Pocket open, everything else crates — the Training case that boxed Red in. */
function sealedLattice() {
  const grid = latticeGrid();
  const safe = new Set(["9,1", "8,1", "9,2", "1,11", "2,11", "1,10"]);
  for (let r = 1; r < ROWS - 1; r += 1) {
    for (let c = 1; c < COLS - 1; c += 1) {
      if (grid[r][c] === 1 || safe.has(`${r},${c}`)) continue;
      grid[r][c] = 2;
    }
  }
  return grid;
}

function world(r, c) {
  return [(c - (COLS - 1) / 2) * TILE, (r - (ROWS - 1) / 2) * TILE];
}

function makeView(overrides = {}) {
  const [x, z] = world(overrides.at?.r ?? 1, overrides.at?.c ?? 11);
  const [rx, rz] = world(overrides.rivalAt?.r ?? 9, overrides.rivalAt?.c ?? 1);
  return {
    meta: { cols: COLS, rows: ROWS, tile: TILE, roundAge: 5, ...(overrides.meta ?? {}) },
    grid: overrides.grid ?? sealedLattice(),
    self: {
      id: 2, alive: true, x, z, maxBombs: 1, range: 2, speed: 3.45,
      ...(overrides.self ?? {})
    },
    rival: {
      id: 1, alive: true, x: rx, z: rz,
      ...(overrides.rival ?? {})
    },
    bombs: overrides.bombs ?? [],
    blasts: overrides.blasts ?? [],
    pickups: overrides.pickups ?? [],
    dt: overrides.dt ?? 0.016
  };
}

function ownBomb(r, c, extra = {}) {
  return {
    id: 1, ownerId: 2, r, c, range: 2, age: 0, fuse: 2.35,
    exploded: false, passOwners: [2], ...extra
  };
}

test("ownBombBlastCovers is the cardinal cross of a live self bomb", () => {
  const view = makeView({ bombs: [ownBomb(1, 10)] });
  assert.equal(ownBombBlastCovers(view, 1, 10), true, "bomb cell");
  assert.equal(ownBombBlastCovers(view, 1, 11), true, "same row");
  assert.equal(ownBombBlastCovers(view, 2, 11), false, "diagonal pocket cell is off the cross");
  assert.equal(ownBombBlastCovers(view, 2, 10), false, "the lattice pillar stops the south arm");
});

test("Salt Lens L-pocket: plant at r1c10 has a refuge at r2c11; r1c11 does not", () => {
  const atStand = makeView({ at: { r: 1, c: 10 } });
  assert.equal(hasTemporalBombEscape(atStand, { r: 1, c: 10 }), true,
    "the L-pocket diagonal is a forever-safe refuge");

  const atSpawn = makeView({ at: { r: 1, c: 11 } });
  assert.equal(hasTemporalBombEscape(atSpawn, { r: 1, c: 11 }), false,
    "planting on the spawn cell paints every walkable pocket cell");
});

test("V1 plants in the Salt Lens pocket and starts leaving the cross on that frame", () => {
  const policy = createV1Policy({ random: () => 0.5 });
  const view = makeView({ at: { r: 1, c: 10 } });

  const intent = policy.think(view, 0.016);
  assert.equal(intent.plantBomb, true, "stand cell next to the route crate is a legal plant");
  assert.equal(policy.memory.lastBombReason, "open-route");
  assert.equal(intent.dx, 1, "first hop is east toward r1c11, the only walkable exit");
  assert.equal(intent.dz, 0);
  assert.equal(policy.memory.objective, "escape");
  assert.deepEqual(policy.memory.targetCell, { r: 2, c: 11 });
});

test("V1 at the pocket refuge does not walk back onto its own blast", () => {
  const policy = createV1Policy({ random: () => 0.5 });
  const view = makeView({
    at: { r: 2, c: 11 },
    bombs: [ownBomb(1, 10)]
  });

  for (let i = 0; i < 8; i += 1) {
    const intent = policy.think(view, 0.016);
    assert.equal(intent.plantBomb, false, "bomb slot is already used");
    const nextR = 2 + intent.dz;
    const nextC = 11 + intent.dx;
    assert.equal(ownBombBlastCovers(view, nextR, nextC), false,
      `think ${i} stepped to r${nextR}c${nextC}, which is still on the own cross`);
  }
});

test("V1 standing on its own pocket bomb walks off the cross, not along it into the crate", () => {
  const policy = createV1Policy({ random: () => 0.5 });
  const view = makeView({
    at: { r: 1, c: 10 },
    bombs: [ownBomb(1, 10)]
  });

  const intent = policy.think(view, 0.016);
  assert.equal(intent.plantBomb, false);
  assert.equal(policy.memory.objective, "escape");
  assert.deepEqual({ dx: intent.dx, dz: intent.dz }, { dx: 1, dz: 0 },
    "the only leave is east to r1c11, then south to the r2c11 refuge");
});

test("Training-shaped idle Katarina: V1 does not farm-suicide its first-to-3", async () => {
  // Same entry as Treinamento: lattice (Salt Lens) default, P2 V1 Renekton,
  // P1 Katarina who never plants. A suicide dummy loses 3–0 in ~2–6s/round.
  const report = await runCpuDuels({ matches: 1, seed: 42, opponent: "idle" });
  assert.equal(report.opponent.policy, "idle");
  assert.ok(report.v1FirstBombSurvivalRate !== null, "the CPU still plants — not a no-op");
  assert.equal(report.v1OwnBombDeaths, 0, "own-arena-bomb deaths must be gone");
  assert.equal(report.v1FirstBombSurvivalRate, 1, "every first own bomb is survived");
  assert.equal(report.v1RoundLosses, 0, "idle Blue cannot farm a 3–0 on Red suicides");
  assert.ok(report.averageRoundSeconds > 6,
    `rounds lasting ${report.averageRoundSeconds}s still look like the 2–6s suicide farm`);
});
