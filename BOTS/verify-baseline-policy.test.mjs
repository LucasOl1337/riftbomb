import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWorldView } from "./build-world-view.mjs";
import { createBaselinePolicy } from "./baseline-policy.mjs";

const COLS = 13;
const ROWS = 11;
const TILE = 1.32;

function makeGrid() {
  return Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) =>
      r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1 ? 1 : 0
    )
  );
}

function worldFromCell(r, c) {
  return [(c - (COLS - 1) / 2) * TILE, (r - (ROWS - 1) / 2) * TILE];
}

function makeRng(values) {
  let index = 0;
  return () => {
    const value = values[index];
    index = (index + 1) % values.length;
    return value;
  };
}

function makeMatch(overrides = {}) {
  const self = overrides.self ?? {
    id: 2,
    alive: true,
    x: 0,
    z: 0,
    maxBombs: 1,
    health: 1,
    ultChannel: 0,
    vladimirPool: 0
  };

  const rival = overrides.rival ?? {
    id: 1,
    alive: true,
    x: 0,
    z: 0
  };

  const [x, z] = worldFromCell(5, 6);
  self.x = overrides.selfR !== undefined ? worldFromCell(overrides.selfR, overrides.selfC)[0] : x;
  self.z = overrides.selfR !== undefined ? worldFromCell(overrides.selfR, overrides.selfC)[1] : z;

  const [rx, rz] = worldFromCell(5, 2);
  rival.x = overrides.rivalR !== undefined ? worldFromCell(overrides.rivalR, overrides.rivalC)[0] : rx;
  rival.z = overrides.rivalR !== undefined ? worldFromCell(overrides.rivalR, overrides.rivalC)[1] : rz;

  return {
    mode: "playing",
    paused: false,
    roundLocked: false,
    p2Human: false,
    round: 1,
    roundAge: overrides.roundAge ?? 10,
    roundTime: 80,
    roundWins: [0, 0],
    matchTarget: 3,
    roundDecisionTimer: undefined,
    cols: COLS,
    rows: ROWS,
    tile: TILE,
    grid: overrides.grid ?? makeGrid(),
    players: [rival, self],
    bombs: overrides.bombs ?? [],
    blasts: overrides.blasts ?? [],
    pickups: overrides.pickups ?? []
  };
}

describe("baseline policy intents", () => {
  it("produces a valid intent object from a WorldView", () => {
    const policy = createBaselinePolicy({ random: makeRng([0, 0, 0]) });
    const match = makeMatch({});
    const view = buildWorldView(match, 0.016, 2);
    const intent = policy.think(view, 0.016);

    assert.equal(typeof intent.dx, "number");
    assert.equal(typeof intent.dz, "number");
    assert.equal(typeof intent.plantBomb, "boolean");
    assert.equal(intent.skill, null);
    assert.ok([-1, 0, 1].includes(intent.dx));
    assert.ok([-1, 0, 1].includes(intent.dz));
  });

  it("returns a no-op when the WorldView is missing", () => {
    const policy = createBaselinePolicy({ random: makeRng([0]) });
    const intent = policy.think(null, 0.016);

    assert.deepEqual(intent, { dx: 0, dz: 0, plantBomb: false, skill: null });
  });

  it("moves away from a bomb placed on its own cell", () => {
    const grid = makeGrid();
    const [x, z] = worldFromCell(5, 6);
    const match = makeMatch({
      selfR: 5,
      selfC: 6,
      bombs: [{ id: 1, ownerId: 1, r: 5, c: 6, x, z, range: 2, age: 0, fuse: 3, exploded: false, passOwners: [] }]
    });
    const view = buildWorldView(match, 0.016, 2);

    const policy = createBaselinePolicy({ random: makeRng([0, 0, 0, 0, 0]) });
    policy.memory.think = 0;
    const intent = policy.think(view, 0.016);

    assert.ok(intent.dx !== 0 || intent.dz !== 0);
    assert.equal(intent.plantBomb, false);
  });

  it("plants a bomb when aligned with the rival and round is old enough", () => {
    const grid = makeGrid();
    const match = makeMatch({
      selfR: 5,
      selfC: 6,
      rivalR: 5,
      rivalC: 2,
      roundAge: 2
    });
    const view = buildWorldView(match, 0.016, 2);

    const policy = createBaselinePolicy({ random: makeRng([0, 0, 0, 0, 0, 0]) });
    policy.memory.think = 0;
    const intent = policy.think(view, 0.016);

    assert.equal(intent.plantBomb, true);
  });

  it("does not plant when self has already reached maxBombs", () => {
    const grid = makeGrid();
    const [x, z] = worldFromCell(5, 6);
    const match = makeMatch({
      selfR: 5,
      selfC: 6,
      rivalR: 5,
      rivalC: 2,
      roundAge: 2,
      bombs: [{ id: 1, ownerId: 2, r: 5, c: 6, x, z, range: 2, age: 0, fuse: 3, exploded: false, passOwners: [] }],
      self: { maxBombs: 1 }
    });
    const view = buildWorldView(match, 0.016, 2);

    const policy = createBaselinePolicy({ random: makeRng([0, 0, 0, 0, 0, 0]) });
    policy.memory.think = 0;
    const intent = policy.think(view, 0.016);

    assert.equal(intent.plantBomb, false);
  });

  it("does not move into walls", () => {
    const grid = makeGrid();
    grid[4][6] = 1;
    grid[6][6] = 1;
    grid[5][5] = 1;
    grid[5][7] = 1;

    const match = makeMatch({ selfR: 5, selfC: 6, grid });
    const view = buildWorldView(match, 0.016, 2);

    const policy = createBaselinePolicy({ random: makeRng([0, 0, 0, 0]) });
    policy.memory.think = 0;
    const intent = policy.think(view, 0.016);

    assert.equal(intent.dx, 0);
    assert.equal(intent.dz, 0);
  });
});
