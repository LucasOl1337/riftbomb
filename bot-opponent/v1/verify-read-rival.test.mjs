import assert from "node:assert/strict";
import { test } from "node:test";

import { createV1Memory, resetV1Memory } from "./v1-memory.mjs";
import { createV1Policy } from "./create-v1-policy.mjs";
import {
  RIVAL_ESCAPE_WINDOW,
  bombCutsRivalEscape,
  createRivalModel,
  favoriteEscapeCells,
  hottestRivalCell,
  observeRival,
  predictRivalCell,
  rivalBombHabit
} from "./read-rival.mjs";

const DT = 1 / 60;

function makeView(overrides = {}) {
  const cols = 13;
  const rows = 11;
  const tile = 1;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
  return {
    meta: { cols, rows, tile, roundAge: 5, ...(overrides.meta ?? {}) },
    grid: overrides.grid ?? grid,
    self: {
      id: 2, alive: true, x: 0, z: 0, maxBombs: 1, range: 2, speed: 1,
      ...(overrides.self ?? {})
    },
    rival: {
      id: 1, alive: true, x: 0, z: 0,
      ...(overrides.rival ?? {})
    },
    bombs: overrides.bombs ?? [],
    blasts: overrides.blasts ?? [],
    pickups: overrides.pickups ?? [],
    dt: overrides.dt ?? DT
  };
}

function liveBomb(overrides = {}) {
  return {
    id: 99, ownerId: 1, r: 5, c: 4, age: 0, fuse: 2.35, range: 2,
    exploded: false, passOwners: [], ...overrides
  };
}

test("heat map accumulates where the rival stands and decays with time", () => {
  const model = createRivalModel();
  const view = makeView();
  for (let i = 0; i < 30; i += 1) observeRival(view, model); // 0.5s at (0,0) -> r5 c6
  const before = model.heat[5][6];
  assert.ok(before > 0, "occupation time must accumulate");
  assert.deepEqual(hottestRivalCell(model), { r: 5, c: 6 });

  // Two heat half-lives (40s) elsewhere: the old hot cell cools below a
  // third of its weight while the new one takes over.
  view.rival.x = 3; // r5 c9
  for (let i = 0; i < 40 * 60; i += 1) observeRival(view, model);
  assert.ok(model.heat[5][6] < before / 3, "old heat must decay");
  assert.ok(model.heat[5][9] > model.heat[5][6], "recent occupation wins");
  assert.deepEqual(hottestRivalCell(model), { r: 5, c: 9 });
});

test("escape route is recorded after a bomb lands near the rival", () => {
  const model = createRivalModel();
  const bomb = liveBomb(); // r5 c4: two cells west of the rival at r5 c6
  const view = makeView({ bombs: [bomb] });
  const frames = Math.ceil((RIVAL_ESCAPE_WINDOW + 0.1) / DT);
  for (let i = 0; i < frames; i += 1) {
    view.rival.z -= DT; // flees north at one cell per second
    observeRival(view, model);
  }
  assert.equal(model.escapeSamples, 1, "one completed escape track");
  const [favorite] = favoriteEscapeCells(model, 1);
  // The track closes at the end of the window: one cell north at 1 cell/s.
  assert.equal(favorite.dr, -1, "the dodge points one cell north");
  assert.equal(favorite.dc, 0);
  assert.ok(favorite.weight > 0);
});

test("a track opened on a dying fuse records nothing", () => {
  const model = createRivalModel();
  // 0.15s of fuse left: below RIVAL_MIN_TRACK_FUSE, the track never opens.
  const bomb = liveBomb({ age: 2.2 });
  const view = makeView({ bombs: [bomb] });
  for (let i = 0; i < 30; i += 1) observeRival(view, model);
  assert.equal(model.escapeTracks.length, 0);
  assert.equal(model.escapeSamples, 0);
});

test("a rival who never dodges leaves no escape habit", () => {
  const model = createRivalModel();
  const view = makeView({ bombs: [liveBomb()] });
  const frames = Math.ceil((RIVAL_ESCAPE_WINDOW + 0.2) / DT);
  for (let i = 0; i < frames; i += 1) observeRival(view, model);
  assert.equal(model.escapeSamples, 0, "zero displacement is not a route");
  assert.deepEqual(favoriteEscapeCells(model), []);
});

test("prediction intercepts a moving rival instead of chasing his cell", () => {
  const model = createRivalModel();
  const view = makeView();
  for (let i = 0; i < 30; i += 1) {
    view.rival.z -= DT; // walking north, one cell per second
    observeRival(view, model);
  }
  const currentR = Math.round(view.rival.z + 5);
  const predicted = predictRivalCell(model, view);
  assert.ok(predicted.r < currentR,
    `expected an intercept north of r${currentR}, got r${predicted.r}`);
  assert.equal(predicted.c, 6);
});

test("prediction uses the favorite escape habit while the rival is threatened", () => {
  const model = createRivalModel();
  // Teach the habit: threatened once, dodged two cells north.
  model.escapeOffsets.set("-2,0", 5);
  model.escapeSamples = 3;
  const view = makeView({ bombs: [liveBomb()] }); // threatens r5 c6
  observeRival(view, model);
  assert.deepEqual(predictRivalCell(model, view), { r: 3, c: 6 });
});

test("rival model survives resetV1Memory (habits persist between rounds)", () => {
  const memory = createV1Memory();
  const view = makeView();
  for (let i = 0; i < 30; i += 1) observeRival(view, memory.rivalModel);
  memory.rivalModel.escapeOffsets.set("0,2", 4);
  memory.rivalModel.escapeSamples = 2;

  const modelRef = memory.rivalModel;
  resetV1Memory(memory);
  assert.equal(memory.rivalModel, modelRef, "same model instance after the round reset");
  assert.ok(memory.rivalModel.heat[5][6] > 0, "heat kept");
  assert.equal(memory.rivalModel.escapeSamples, 2, "escape habits kept");
  assert.equal(memory.objective, "press", "round memory still resets");
});

test("without observations the prediction is the current cell (regression)", () => {
  const model = createRivalModel();
  const view = makeView({ rival: { x: 2, z: -1 } }); // r4 c8
  assert.deepEqual(predictRivalCell(model, view), { r: 4, c: 8 });
  assert.deepEqual(predictRivalCell(null, view), { r: 4, c: 8 }, "null model is the old behavior");
  assert.deepEqual(favoriteEscapeCells(model), []);
  assert.equal(bombCutsRivalEscape(view, model, { r: 5, c: 7 }), false);
  assert.equal(hottestRivalCell(model), null);
});

test("bomb habit counts rival plants, crate contact and alignment", () => {
  const model = createRivalModel();
  const grid = Array.from({ length: 11 }, () => Array(13).fill(0));
  grid[5][7] = 2; // crate east of the first plant
  const view = makeView({
    grid,
    bombs: [
      liveBomb({ id: 1, r: 5, c: 6 }),  // crate neighbor, aligned with the self row
      liveBomb({ id: 2, r: 2, c: 2, ownerId: 2 }) // the V1's own bomb: ignored
    ]
  });
  observeRival(view, model);
  observeRival(view, model); // second tick must not double-count the same bombs
  const habit = rivalBombHabit(model);
  assert.equal(habit.plants, 1);
  assert.equal(habit.nearCrateRatio, 1);
  assert.equal(habit.alignedRatio, 1);
  assert.equal(model.bombHeat[5][6] > 0, true);
});

test("bombCutsRivalEscape proves the trap geometry", () => {
  const model = createRivalModel();
  model.escapeOffsets.set("0,2", 5); // habit: dodge two cells east
  model.escapeSamples = 3;
  const view = makeView(); // rival at r5 c6
  // V1 at r5 c7: a range-2 bomb there covers c5..c9 — the rival (c6) and
  // his favorite escape destination (c8) alike.
  assert.equal(bombCutsRivalEscape(view, model, { r: 5, c: 7 }), true);
  // Too far: the blast never reaches the rival.
  assert.equal(bombCutsRivalEscape(view, model, { r: 5, c: 10 }), false);
  // Covers the rival but not the escape destination.
  assert.equal(bombCutsRivalEscape(view, model, { r: 3, c: 6 }), false);
});

test("the v1 think observes the rival and reset keeps the model", () => {
  const policy = createV1Policy({ random: () => 0.5 });
  const view = makeView({ rival: { x: 0, z: 3 } }); // r8 c6
  policy.think(view, DT);
  assert.ok(policy.memory.rivalModel.heat[8][6] > 0, "think feeds the model");
  const modelRef = policy.memory.rivalModel;
  policy.reset();
  assert.equal(policy.memory.rivalModel, modelRef, "model survives the round reset");
});
