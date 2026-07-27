import assert from "node:assert/strict";
import { test } from "node:test";
import { CELL } from "./sense-arena.mjs";
import { buildWorldView, canThink } from "./build-world-view.mjs";

const COLS = 13;
const ROWS = 11;

function makeGrid() {
  return Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) =>
      r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1 ? CELL.SOLID : CELL.OPEN
    )
  );
}

function makePlayer(id) {
  return {
    id,
    champion: id === 1 ? "katarina" : "ziggs",
    side: id === 1 ? "blue" : "red",
    name: id === 1 ? "P1" : "Red Ziggs",
    x: id === 1 ? -7.26 : 7.26,
    z: id === 1 ? 5.94 : -5.94,
    facing: id === 1 ? Math.PI : 0,
    lastDx: 0,
    lastDz: id === 1 ? -1 : 1,
    alive: true,
    health: 1,
    maxHealth: 1,
    speed: 3.45,
    maxBombs: 1,
    range: 2,
    shield: 0,
    invulnerable: 0,
    hurt: 0,
    stunned: 0,
    dashing: 0,
    dashCooldown: 0,
    dashRequested: false,
    speedBoost: 0,
    aiDx: 0,
    aiDz: 1,
    aiCommit: 0.5,
    aiThink: 0.2
  };
}

function stubMatch(overrides = {}) {
  return {
    cols: COLS,
    rows: ROWS,
    tile: 1.32,
    mode: "playing",
    paused: false,
    roundLocked: false,
    round: 1,
    roundAge: 0.5,
    roundTime: 89.5,
    roundWins: [0, 0],
    matchTarget: 3,
    roundDecisionTimer: -1,
    grid: makeGrid(),
    players: [makePlayer(1), makePlayer(2)],
    bombs: [
      {
        id: 1,
        ownerId: 2,
        r: 5,
        c: 6,
        x: 0,
        z: 0,
        age: 0.5,
        fuse: 2.5,
        range: 2,
        exploded: false,
        passOwners: new Set([2])
      }
    ],
    blasts: [{ r: 5, c: 6, age: 0.1, life: 0.58, ownerId: 2, source: 1, core: true }],
    pickups: [{ r: 3, c: 3, x: 0, z: 0, type: "range" }],
    ...overrides
  };
}

test("canThink is false when guards fail", () => {
  assert.equal(canThink(stubMatch({ mode: "intro" }), 2), false);
  assert.equal(canThink(stubMatch({ paused: true }), 2), false);
  assert.equal(canThink(stubMatch({ roundLocked: true }), 2), false);
  assert.equal(canThink(stubMatch({ players: [makePlayer(1)] }), 2), false);

  const dead = stubMatch();
  dead.players[1].alive = false;
  assert.equal(canThink(dead, 2), false);
});

test("buildWorldView returns null when not thinkable", () => {
  assert.equal(buildWorldView(stubMatch({ mode: "intro" }), 0.016), null);
});

test("buildWorldView returns P0 WorldView for the default bot id 2", () => {
  const match = stubMatch();
  const view = buildWorldView(match, 0.016);

  assert.ok(view);
  assert.equal(view.meta.cols, COLS);
  assert.equal(view.meta.rows, ROWS);
  assert.equal(view.meta.tile, 1.32);
  assert.equal(view.meta.mode, "playing");
  assert.equal(view.meta.selfId, 2);
  assert.equal(view.meta.rivalId, 1);
  assert.deepEqual(view.meta.roundWins, [0, 0]);

  assert.equal(view.self.id, 2);
  assert.equal(view.self.champion, "ziggs");
  assert.equal(view.rival.id, 1);
  assert.equal(view.rival.champion, "katarina");

  assert.equal(view.bombs.length, 1);
  assert.equal(view.bombs[0].ownerId, 2);
  assert.deepEqual(view.bombs[0].passOwners, [2]);

  assert.equal(view.blasts.length, 1);
  assert.equal(view.blasts[0].core, true);

  assert.equal(view.pickups.length, 1);
  assert.equal(view.pickups[0].type, "range");

  assert.equal(view.dt, 0.016);
});

test("buildWorldView grid is a copy — mutation does not leak back", () => {
  const match = stubMatch();
  const view = buildWorldView(match, 0.016);

  view.grid[1][1] = CELL.SOLID;
  assert.equal(match.grid[1][1], CELL.OPEN);
});

test("buildWorldView self is a copy — changes after the snapshot do not leak back", () => {
  const match = stubMatch();
  const view = buildWorldView(match, 0.016);

  assert.notEqual(view.self, match.players[1]);
  match.players[1].x = 999;
  assert.notEqual(view.self.x, 999);
});

test("buildWorldView excludes CPU memory fields from self", () => {
  const match = stubMatch();
  const view = buildWorldView(match, 0.016);

  assert.equal(view.self.aiDx, undefined);
  assert.equal(view.self.aiDz, undefined);
  assert.equal(view.self.aiCommit, undefined);
  assert.equal(view.self.aiThink, undefined);
});

test("buildWorldView passOwners is exposed as an array", () => {
  const match = stubMatch();
  const view = buildWorldView(match, 0.016);

  assert.ok(Array.isArray(view.bombs[0].passOwners));
  assert.deepEqual(view.bombs[0].passOwners, [2]);
});
