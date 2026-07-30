import assert from "node:assert/strict";
import { test } from "node:test";

import { createV1Policy } from "./create-v1-policy.mjs";
import {
  DANGER_BLAST_LIFE,
  DANGER_CHAIN_FRAME,
  dangerTimeline,
  escapePlan,
  isDeadlyAt,
  safeWindowAfter
} from "./danger-timeline.mjs";
import { nextStepToward } from "./navigate-arena.mjs";

const COLS = 13;
const ROWS = 11;
const TILE = 1;

function emptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

/** One open row (r=5) sealed by solid rows above and below — a corridor. */
function corridorGrid() {
  const grid = emptyGrid();
  for (let c = 0; c < COLS; c += 1) {
    grid[4][c] = 1;
    grid[6][c] = 1;
  }
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

function bomb(overrides) {
  return {
    id: 1, ownerId: 1, range: 2, age: 0, fuse: 2.35,
    exploded: false, passOwners: [], ...overrides
  };
}

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
}

test("single bomb: lane cells turn deadly at fuse-age and clear after the blast life", () => {
  // Bomb at r5 c8, range 2, 1.85s left on the fuse.
  const view = makeView({ bombs: [bomb({ r: 5, c: 8, age: 0.5 })] });
  const timeline = dangerTimeline(view);

  for (const cell of [{ r: 5, c: 8 }, { r: 5, c: 7 }, { r: 5, c: 6 }, { r: 3, c: 8 }]) {
    const { deadlyFrom, deadlyUntil } = timeline.cells[cell.r][cell.c];
    close(deadlyFrom, 1.85, `deadlyFrom of r${cell.r} c${cell.c}`);
    close(deadlyUntil, 1.85 + DANGER_BLAST_LIFE, `deadlyUntil of r${cell.r} c${cell.c}`);
  }
  assert.equal(isDeadlyAt(timeline, 5, 7, 1.0), false, "not deadly before the fuse ends");
  assert.equal(isDeadlyAt(timeline, 5, 7, 1.9), true, "deadly once the blast is out");
  assert.equal(isDeadlyAt(timeline, 5, 7, 3.0), false, "safe again after the blast life");
});

test("cells out of the blast path are never deadly; a crate shields what is behind it", () => {
  const grid = emptyGrid();
  grid[5][7] = 2; // crate eats the ray
  const view = makeView({ grid, bombs: [bomb({ r: 5, c: 8, range: 3 })] });
  const timeline = dangerTimeline(view);

  assert.equal(timeline.cells[4][6].deadlyFrom, Infinity, "diagonal cell: never deadly");
  assert.equal(timeline.cells[1][1].deadlyFrom, Infinity, "far cell: never deadly");
  assert.equal(timeline.cells[5][7].deadlyFrom, 2.35, "the crate cell itself is hit");
  assert.equal(timeline.cells[5][6].deadlyFrom, Infinity, "the crate shields the cell behind it");
  assert.equal(safeWindowAfter(timeline, 5, 6, 0), Infinity);
});

test("an active blast is deadly now until the rest of its life", () => {
  const view = makeView({ blasts: [{ r: 5, c: 6, age: 0.2, life: 0.58 }] });
  const timeline = dangerTimeline(view);

  close(timeline.cells[5][6].deadlyFrom, 0, "blast cells are deadly from now");
  close(timeline.cells[5][6].deadlyUntil, 0.38, "until the remainder of the blast life");
  assert.equal(isDeadlyAt(timeline, 5, 6, 0), true);
  assert.equal(isDeadlyAt(timeline, 5, 6, 0.4), false);
  assert.equal(safeWindowAfter(timeline, 5, 6, 0), 0, "no safe window inside the blast");
  assert.equal(safeWindowAfter(timeline, 5, 6, 0.4), Infinity, "safe forever once it passed");

  // Blast entries without age/life (older call sites) default to a fresh blast.
  const fresh = dangerTimeline(makeView({ blasts: [{ r: 5, c: 6 }] }));
  close(fresh.cells[5][6].deadlyUntil, DANGER_BLAST_LIFE, "fresh blast defaults");
});

test("chain detonation: a bomb caught in another blast explodes one frame after it", () => {
  // Bomb A (r5 c5, range 3) blows in 1.0s and its lane reaches bomb B
  // (r5 c7, range 2, own fuse 2.35s away). B must explode at 1.0 + 1/60,
  // not at 2.35 — proven on r3 c7, which only B's blast can reach.
  const view = makeView({
    bombs: [
      bomb({ id: 1, r: 5, c: 5, range: 3, age: 1.35 }),
      bomb({ id: 2, r: 5, c: 7, range: 2, age: 0 })
    ]
  });
  const timeline = dangerTimeline(view);

  close(timeline.cells[3][7].deadlyFrom, 1.0 + DANGER_CHAIN_FRAME,
    "B chain-detonates one frame after A's blast reaches it");
  close(timeline.cells[5][7].deadlyFrom, 1.0,
    "B's own cell is already covered by A's blast at 1.0s");
});

test("no chain through a solid: the blocked bomb keeps its own fuse", () => {
  const grid = emptyGrid();
  grid[5][6] = 1; // solid between A and B
  const view = makeView({
    grid,
    bombs: [
      bomb({ id: 1, r: 5, c: 5, range: 3, age: 1.35 }),
      bomb({ id: 2, r: 5, c: 7, range: 2, age: 0 })
    ]
  });
  const timeline = dangerTimeline(view);

  close(timeline.cells[3][7].deadlyFrom, 2.35, "B explodes on its own fuse");
  assert.equal(timeline.cells[5][6].deadlyFrom, Infinity, "the solid itself is not in any lane");
});

test("escapePlan crosses a lane it has time for instead of freezing on binary danger", () => {
  // Corridor: self r5 c6, bomb r5 c9 range 3 blowing in 1.2s. The binary
  // danger map flags the whole row; the temporal plan sees the crossing
  // (~1.0s) fits before 1.2s and walks west to the safe r5 c5.
  const view = makeView({
    grid: corridorGrid(),
    bombs: [bomb({ r: 5, c: 9, range: 3, age: 1.15 })]
  });
  const plan = escapePlan(view);

  assert.equal(plan.reachedRefuge, true);
  assert.deepEqual(plan.refuge, { r: 5, c: 5 }, "out of the range-3 lane");
  assert.deepEqual(plan.route, [{ r: 5, c: 6 }, { r: 5, c: 5 }]);
  assert.deepEqual(plan.step, { dx: -1, dz: 0 }, "west, immediately");
  assert.equal(plan.hold, 0);
});

test("escapePlan waits out a closing cell on a safe one instead of stepping in", () => {
  // Corridor: the only west exit (r5 c5) sits under an active blast until
  // 0.58s; the self cell stays safe until 2.0s. The plan holds ~0.13s and
  // steps in right after the blast ends.
  const view = makeView({
    grid: corridorGrid(),
    blasts: [{ r: 5, c: 5 }],
    bombs: [bomb({ r: 5, c: 10, range: 4, age: 0.35 })] // self cell deadly at 2.0s
  });
  const plan = escapePlan(view);

  assert.equal(plan.reachedRefuge, true);
  assert.deepEqual(plan.refuge, { r: 5, c: 5 }, "the blast cell is a refuge once it clears");
  assert.deepEqual(plan.step, { dx: 0, dz: 0 }, "hold: the first move is only safe later");
  close(plan.hold, 0.58 - 0.45, "holds until the exit crossing fits");
});

test("escapePlan least-worst fallback holds on the cell with the most time left", () => {
  // Sealed pocket (r5 c5..c7): a range-2 bomb on c7 turns every reachable
  // cell deadly at 1.0s. No refuge exists — the plan stays on the current
  // cell (most time left) instead of running or freezing on nulls.
  const grid = corridorGrid();
  grid[5][4] = 1;
  grid[5][8] = 1;
  const view = makeView({
    grid,
    bombs: [bomb({ r: 5, c: 7, range: 2, age: 1.35 })]
  });
  const plan = escapePlan(view);

  assert.equal(plan.reachedRefuge, false, "no cell survives the blast");
  assert.deepEqual(plan.refuge, { r: 5, c: 6 }, "the least-worst cell is the current one");
  assert.deepEqual(plan.route, [{ r: 5, c: 6 }]);
  assert.deepEqual(plan.step, { dx: 0, dz: 0 }, "holds instead of stepping into a faster death");
});

test("v1 policy escapes an urgent lane through the temporal plan", () => {
  // Same corridor as the pure test: the fuse (1.2s) is under the urgency
  // threshold, so the V1 overrides the baseline with the escape plan.
  const policy = createV1Policy({ random: () => 0.5 });
  const view = makeView({
    grid: corridorGrid(),
    bombs: [bomb({ r: 5, c: 9, range: 3, age: 1.15 })]
  });

  const intent = policy.think(view, 0.016);
  assert.equal(policy.memory.objective, "escape");
  assert.deepEqual({ dx: intent.dx, dz: intent.dz }, { dx: -1, dz: 0 },
    "the temporal escape heads west toward the refuge");
  assert.deepEqual(policy.memory.targetCell, { r: 5, c: 5 });
  assert.deepEqual(policy.memory.route, [{ r: 5, c: 6 }, { r: 5, c: 5 }]);
});

test("v1 policy starts the temporal escape as soon as the lane is dangerous", () => {
  // Same corridor, but the fuse is fresh (2.35s): the escape still owns the
  // frame — post-plant drift under the baseline steering is what walked the
  // bot into sealed pockets. The plan crosses the lane while it fits.
  const policy = createV1Policy({ random: () => 0.5 });
  const view = makeView({
    grid: corridorGrid(),
    bombs: [bomb({ r: 5, c: 9, range: 3, age: 0 })]
  });

  const intent = policy.think(view, 0.016);
  assert.equal(policy.memory.objective, "escape");
  assert.deepEqual({ dx: intent.dx, dz: intent.dz }, { dx: -1, dz: 0 },
    "the temporal escape heads west immediately, even with a fresh fuse");
  assert.deepEqual(policy.memory.targetCell, { r: 5, c: 5 });
});

test("nextStepToward crosses a fresh lane when the crossing fits before the blast", () => {
  // Bomb r5 c8 range 3 just planted (2.35s left): the binary guard refused
  // this step; the temporal guard sees the crossing (~1.0s) fits.
  const view = makeView({
    self: { x: -1, z: 0 }, // cell r5 c5
    bombs: [bomb({ r: 5, c: 8, range: 3, age: 0 })]
  });
  assert.deepEqual(nextStepToward(view, { r: 5, c: 9 }), { dx: 1, dz: 0 },
    "a fresh bomb lane no longer paralyzes the route");
});
