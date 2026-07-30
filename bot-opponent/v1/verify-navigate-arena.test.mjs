import assert from "node:assert/strict";
import { test } from "node:test";

import { createV1Policy } from "./create-v1-policy.mjs";
import { findPath, nextStepToward } from "./navigate-arena.mjs";

const COLS = 13;
const ROWS = 11;
const TILE = 1;

function emptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
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

test("findPath routes around a solid wall", () => {
  const grid = emptyGrid();
  // Solid column at c=7 except a gap at r=10; the straight row is blocked.
  for (let r = 0; r < ROWS - 1; r += 1) grid[r][7] = 1;

  const path = findPath(grid, [], { r: 5, c: 5 }, { r: 5, c: 9 });
  assert.ok(path, "a route around the wall exists");
  assert.deepEqual(path[0], { r: 5, c: 5 });
  assert.deepEqual(path.at(-1), { r: 5, c: 9 });
  assert.equal(path.length, 15, "5 down + 4 east + 5 up through the gap at r=10");
  for (const cell of path) assert.equal(grid[cell.r][cell.c], 0, "path never crosses solids");
});

test("findPath returns null when the target is sealed off", () => {
  const grid = emptyGrid();
  grid[4][6] = 1;
  grid[6][6] = 1;
  grid[5][5] = 1;
  grid[5][7] = 1;

  assert.equal(findPath(grid, [], { r: 5, c: 4 }, { r: 5, c: 6 }), null);
});

test("findPath treats crates as blocked", () => {
  const grid = emptyGrid();
  for (let r = 0; r < ROWS; r += 1) grid[r][7] = 2; // full crate column

  assert.equal(findPath(grid, [], { r: 5, c: 5 }, { r: 5, c: 9 }), null);
});

test("findPath respects bombs unless the self may pass them", () => {
  const grid = emptyGrid();
  for (let r = 0; r < ROWS; r += 1) grid[r][7] = 1; // sealed except the gap
  grid[5][7] = 0;
  const bomb = { id: 9, r: 5, c: 7, x: 1, z: 0, ownerId: 1, passOwners: [1], exploded: false };

  assert.equal(findPath(grid, [bomb], { r: 5, c: 5 }, { r: 5, c: 9 }, 2), null,
    "a rival bomb sealing the only gap blocks the route");

  bomb.passOwners = [1, 2];
  const path = findPath(grid, [bomb], { r: 5, c: 5 }, { r: 5, c: 9 }, 2);
  assert.ok(path, "the self crosses a bomb it is allowed to pass");
  assert.ok(path.some((cell) => cell.r === 5 && cell.c === 7));
});

test("nextStepToward points from the real position to the next cell center", () => {
  // Self sits on cell r5 c5 (world x=-1, z=0), pushed south off the axis.
  const view = makeView({ self: { x: -1, z: 0.3 } });
  const step = nextStepToward(view, { r: 5, c: 8 });
  // Next cell r5 c6 has center (0, 0): east plus back north onto the axis.
  assert.deepEqual(step, { dx: 1, dz: -1 });
});

test("nextStepToward walks a straight axis without sideways drift", () => {
  const view = makeView({ self: { x: -1, z: 0.05 } });
  const step = nextStepToward(view, { r: 5, c: 8 });
  assert.deepEqual(step, { dx: 1, dz: 0 }, "within the align tolerance there is no drift");
});

test("nextStepToward never steps into a dangerous cell", () => {
  const view = makeView({
    self: { x: -1, z: 0 },
    bombs: [{ id: 1, r: 5, c: 8, x: 2, z: 0, ownerId: 1, range: 3, age: 2, fuse: 2.5, exploded: false, passOwners: [] }]
  });
  // The next cell east (r5 c6) turns deadly in 0.5s — before the bot could
  // cross it — and the self cell (r5 c5) sits in the same lane. The
  // temporal fallback sidesteps to the least-worst neighbor: west, out of
  // the lane, instead of freezing on a null.
  assert.deepEqual(nextStepToward(view, { r: 5, c: 9 }), { dx: -1, dz: 0 });
});

test("nextStepToward returns null when no route exists", () => {
  const grid = emptyGrid();
  for (let r = 0; r < ROWS; r += 1) grid[r][7] = 1;
  const view = makeView({ grid, self: { x: -1, z: 0 } });
  assert.equal(nextStepToward(view, { r: 5, c: 9 }), null);
});

test("v1 follows the corridor toward a pickup instead of pushing the wall", () => {
  const grid = emptyGrid();
  // Solid wall between the self and the pickup; the only way is south
  // through the gap at r=10, like a real arena corridor.
  for (let r = 0; r < ROWS - 1; r += 1) grid[r][7] = 1;

  const policy = createV1Policy({ random: () => 0.5 });
  const view = makeView({
    grid,
    self: { x: 0, z: 0 },            // cell r5 c6: staring at the wall
    rival: { x: 4, z: -4 },          // far away on the other side of the wall
    pickups: [{ r: 5, c: 9, type: "range" }]
  });

  const intent = policy.think(view, 0.016);
  assert.deepEqual({ dx: intent.dx, dz: intent.dz }, { dx: 0, dz: 1 },
    "the first routed step heads south toward the corridor gap, not east into the wall");
  assert.deepEqual(policy.memory.targetCell, { r: 5, c: 9 });
  assert.ok(policy.memory.route.length >= 2, "the planned route is stored in the V1 memory");
  assert.deepEqual(policy.memory.route[0], { r: 5, c: 6 });
  assert.deepEqual(policy.memory.route.at(-1), { r: 5, c: 9 });
});

test("v1 prefers its own skill orbs over closer power pickups", () => {
  const policy = createV1Policy({ random: () => 0.5 });
  const view = makeView({
    self: { x: -1, z: 0 }, // cell r5 c5
    pickups: [
      { r: 5, c: 6, type: "range" },                       // 1 step east
      { r: 3, c: 5, type: "skill", slot: 0, ownerId: 2 },  // own orb, 2 north
      { r: 4, c: 5, type: "skill", slot: 1, ownerId: 1 }   // rival orb: ignored
    ]
  });

  const intent = policy.think(view, 0.016);
  assert.deepEqual({ dx: intent.dx, dz: intent.dz }, { dx: 0, dz: -1 },
    "the route heads north to the own skill orb, past the closer range pickup");
  assert.deepEqual(policy.memory.targetCell, { r: 3, c: 5 });
});

test("v1 escapes a lethal cell with a temporal plan instead of drifting", () => {
  const policy = createV1Policy({ random: () => 0.5 });
  const view = makeView({
    blasts: [{ r: 5, c: 6 }], // self cell is lethal: objective escape
    pickups: [{ r: 5, c: 8, type: "range" }]
  });

  const intent = policy.think(view, 0.016);
  assert.equal(policy.memory.objective, "escape");
  assert.deepEqual({ dx: intent.dx, dz: intent.dz }, { dx: 0, dz: -1 },
    "the temporal escape steps off the lethal cell toward the refuge");
  assert.deepEqual(policy.memory.route[0], { r: 5, c: 6 });
  assert.deepEqual(policy.memory.route.at(-1), policy.memory.targetCell,
    "the planned escape route ends at the refuge cell");
});
