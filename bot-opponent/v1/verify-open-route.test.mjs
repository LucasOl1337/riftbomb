import assert from "node:assert/strict";
import { test } from "node:test";

import { createV1Policy } from "./create-v1-policy.mjs";
import { findRouteCrate } from "./open-route.mjs";

const COLS = 13;
const ROWS = 11;
const TILE = 1;

function emptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

/** Solid column at c=7 except the given cells, filled with `fill`. */
function walledGrid(gaps, fill = 2) {
  const grid = emptyGrid();
  for (let r = 0; r < ROWS; r += 1) grid[r][7] = 1;
  for (const r of gaps) grid[r][7] = fill;
  return grid;
}

function makeView(overrides = {}) {
  return {
    meta: { cols: COLS, rows: ROWS, tile: TILE, roundAge: 5, ...(overrides.meta ?? {}) },
    grid: overrides.grid ?? emptyGrid(),
    self: { id: 2, alive: true, x: 0, z: 0, maxBombs: 1, ...(overrides.self ?? {}) },
    rival: { id: 1, alive: true, x: 0, z: 3, ...(overrides.rival ?? {}) },
    bombs: overrides.bombs ?? [],
    blasts: overrides.blasts ?? [],
    pickups: overrides.pickups ?? [],
    dt: 0.016
  };
}

test("findRouteCrate picks the cheapest crate among two candidates", () => {
  // Solid wall at c=7 with two crate gaps: r3 (near the self) and r8.
  const grid = walledGrid([3, 8]);
  const view = makeView({ grid, self: { x: -1, z: 0 } }); // cell r5 c5

  const route = findRouteCrate(view, { r: 5, c: 5 }, { r: 5, c: 9 });
  assert.deepEqual(route.crateCell, { r: 3, c: 7 },
    "the crate minimizing dist(self) + dist(target) wins");
  assert.deepEqual(route.standCell, { r: 3, c: 6 },
    "the stand cell is the crate neighbor closest to the self");
});

test("findRouteCrate returns null when solids seal the target", () => {
  const grid = walledGrid([]); // no gap at all
  const view = makeView({ grid, self: { x: -1, z: 0 } });
  assert.equal(findRouteCrate(view, { r: 5, c: 5 }, { r: 5, c: 9 }), null);
});

test("v1 walks to the stand cell when the target sits behind a crate", () => {
  const grid = walledGrid([3, 8]);
  const policy = createV1Policy({ random: () => 0.5 });
  const view = makeView({
    grid,
    self: { x: -1, z: 0 },   // cell r5 c5
    rival: { x: 3, z: 0 }    // cell r5 c9, behind the wall
  });

  const intent = policy.think(view, 0.016);
  assert.deepEqual({ dx: intent.dx, dz: intent.dz }, { dx: 1, dz: 0 },
    "the first step follows the BFS route toward the stand cell");
  assert.equal(intent.plantBomb, false, "no bomb before reaching the crate");
  assert.deepEqual(policy.memory.targetCell, { r: 3, c: 7 },
    "the route crate is recorded as the target cell");
  assert.deepEqual(policy.memory.route[0], { r: 5, c: 5 });
  assert.deepEqual(policy.memory.route.at(-1), { r: 3, c: 6 },
    "the planned route ends at the stand cell");
});

test("v1 plants on the stand cell with a proven escape and records open-route", () => {
  // Single crate gap; the self already stands next to it. Behind the crate
  // the blast stops, and r4 c5 is a danger-free cell 2 steps away
  // (2 x 0.45 + 0.35 slack = 1.25s < 2.35s fuse).
  const grid = walledGrid([5]);
  const policy = createV1Policy({ random: () => 0.5 });
  const view = makeView({
    grid,
    self: { x: 0, z: 0 },    // cell r5 c6: adjacent to the crate r5 c7
    rival: { x: 3, z: 0 }    // cell r5 c9, behind the crate
  });

  const intent = policy.think(view, 0.016);
  assert.equal(intent.plantBomb, true, "the V1 bombs the route crate on purpose");
  assert.deepEqual({ dx: intent.dx, dz: intent.dz }, { dx: 0, dz: -1 },
    "the plant frame already starts the first hop off the blast cross");
  assert.equal(policy.memory.lastBombReason, "open-route");
  assert.deepEqual(policy.memory.targetCell, { r: 4, c: 5 },
    "the temporal plan's refuge replaces the crate as the walk target");
  assert.equal(policy.memory.lastDecision.plantBomb, true);
  assert.equal(policy.memory.objective, "escape");
});

test("v1 does not plant when the bomb seals the only exit — it steps back", () => {
  // Pocket: the only reachable cells are r5 c6 (self) and r5 c5, both inside
  // the blast of a range-2 bomb planted at r5 c6. No escape => no bomb.
  const grid = walledGrid([5]);
  grid[4][6] = 1;
  grid[6][6] = 1;
  grid[4][5] = 1;
  grid[6][5] = 1;
  grid[5][4] = 1;
  const policy = createV1Policy({ random: () => 0.5 });
  const view = makeView({
    grid,
    self: { x: 0, z: 0 },    // cell r5 c6
    rival: { x: 3, z: 0 }    // cell r5 c9, behind the crate
  });

  const intent = policy.think(view, 0.016);
  assert.equal(intent.plantBomb, false, "no bomb without a proven escape");
  assert.deepEqual({ dx: intent.dx, dz: intent.dz }, { dx: -1, dz: 0 },
    "the bot steps back from the crate and waits");
  assert.equal(policy.memory.lastBombReason, null, "no open-route bomb was planted");
  assert.deepEqual(policy.memory.targetCell, { r: 5, c: 7 },
    "the route crate stays recorded while waiting");
});

test("open route targets the own skill orb before a closer power pickup", () => {
  // Two crate gaps: r3 leads to the own skill orb, r5 to a power pickup.
  const grid = walledGrid([3, 5]);
  const policy = createV1Policy({ random: () => 0.5 });
  const view = makeView({
    grid,
    self: { x: -1, z: 0 },   // cell r5 c5
    rival: { x: 4, z: 0 },   // cell r5 c10, also behind the wall
    pickups: [
      { r: 5, c: 9, type: "range" },                      // behind crate r5 c7
      { r: 3, c: 9, type: "skill", slot: 0, ownerId: 2 }  // behind crate r3 c7
    ]
  });

  const intent = policy.think(view, 0.016);
  assert.deepEqual(policy.memory.targetCell, { r: 3, c: 7 },
    "the route opens toward the own skill orb, not the closer pickup");
  assert.deepEqual({ dx: intent.dx, dz: intent.dz }, { dx: 1, dz: 0 },
    "the first step follows the route to the orb-side stand cell");
});
