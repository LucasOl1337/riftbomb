import assert from "node:assert/strict";
import { test } from "node:test";

import { createV1Policy } from "./create-v1-policy.mjs";
import { unwedgeMovement } from "./plan-arena-actions.mjs";
import { createV1Memory } from "./v1-memory.mjs";

function makeView(overrides = {}) {
  const cols = 13;
  const rows = 11;
  const tile = 1;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
  return {
    meta: { cols, rows, tile, roundAge: 5, ...(overrides.meta ?? {}) },
    grid,
    self: {
      id: 2, alive: true, x: 0, z: 0, maxBombs: 1,
      ...(overrides.self ?? {})
    },
    rival: {
      id: 1, alive: true, x: 0, z: 3,
      ...(overrides.rival ?? {})
    },
    bombs: overrides.bombs ?? [],
    blasts: overrides.blasts ?? [],
    pickups: overrides.pickups ?? [],
    dt: 0.016
  };
}

test("v1 think emits the intent shape without a champion", () => {
  const policy = createV1Policy({ random: () => 0.5 });
  const intent = policy.think(makeView(), 0.016);
  assert.equal(typeof intent.dx, "number");
  assert.equal(typeof intent.dz, "number");
  assert.equal(typeof intent.plantBomb, "boolean");
  assert.equal(intent.skill, null);
  assert.equal(policy.champion, null);
});

test("v1 passes through the champion skill intent", () => {
  const champion = {
    id: "renekton",
    evaluateSkill: () => ({ slot: "q", reason: "harvest-adjacent-rival" }),
    reset() {}
  };
  const policy = createV1Policy({ champion, random: () => 0.5 });
  const intent = policy.think(makeView(), 0.016);
  assert.equal(intent.skill, "q");
  assert.equal(policy.champion, "renekton");
  assert.equal(policy.memory.lastDecision.skill, "q");
});

test("v1 records escape objective when the self cell is in danger", () => {
  const policy = createV1Policy({ random: () => 0.5 });
  // Self at world (0, 0) sits on cell r5 c6 of a 13x11 arena.
  policy.think(makeView({ blasts: [{ r: 5, c: 6 }] }), 0.5);
  assert.equal(policy.memory.objective, "escape");
  assert.equal(policy.memory.lastDecision.objective, "escape");
});

test("v1 records pickup objective when a pickup is close and safe", () => {
  const policy = createV1Policy({ random: () => 0.5 });
  policy.think(makeView({ pickups: [{ r: 5, c: 7, type: "range" }] }), 0.5);
  assert.equal(policy.memory.objective, "pickup");
});

test("v1 reset clears memory and keeps a clean decision trail", () => {
  const policy = createV1Policy({ random: () => 0.5 });
  policy.think(makeView({ blasts: [{ r: 5, c: 6 }] }), 0.5);
  policy.reset();
  assert.equal(policy.memory.objective, "press");
  assert.equal(policy.memory.lastDecision, null);
  assert.equal(policy.memory.lastBombReason, null);
});

test("v1 idles safely when self or rival is not alive", () => {
  const policy = createV1Policy({ random: () => 0.5 });
  const intent = policy.think(makeView({ self: { alive: false } }), 0.5);
  assert.deepEqual(intent, { dx: 0, dz: 0, plantBomb: false, skill: null });
});

test("v1 recovers its heading when movement stalls against a wall", () => {
  const policy = createV1Policy({ random: () => 0.5 });
  // Rival far east pulls the baseline east; the self never moves (blocked
  // corner in the real game), so the V1 must override the stalled heading.
  const view = makeView({ rival: { x: 4, z: 0 } });
  let sawEast = false;
  let recovered = null;
  for (let i = 0; i < 180 && !recovered; i++) {
    const intent = policy.think(view, 1 / 60);
    if (intent.dx === 1 && intent.dz === 0) sawEast = true;
    if (sawEast && intent.dx !== 1) recovered = intent;
  }
  assert.ok(sawEast, "baseline should pull the bot east toward the rival");
  assert.ok(recovered, "unstick should override the stalled heading");
  assert.equal(recovered.dx, 0);
});

test("v1 keeps the baseline heading while movement makes progress", () => {
  const policy = createV1Policy({ random: () => 0.5 });
  const view = makeView({ rival: { x: 4, z: 0 } });
  for (let i = 0; i < 90; i++) {
    policy.think(view, 1 / 60);
    view.self.x += 0.05; // the match moves the bot — progress every frame
  }
  assert.equal(policy.memory.stallTime, 0);
});

test("v1 idles safely when the world view is null (bot dead, round live)", () => {
  // buildWorldView returns null while the Match keeps ticking after the bot
  // died; the champion pilot must never be asked to evaluate a null view.
  const champion = {
    id: "renekton",
    evaluateSkill: () => { throw new Error("must not run on a null view"); },
    reset() {}
  };
  const policy = createV1Policy({ champion, random: () => 0.5 });
  const intent = policy.think(null, 0.016);
  assert.deepEqual(intent, { dx: 0, dz: 0, plantBomb: false, skill: null });
});

// --- Cycle 15: wedge recovery ----------------------------------------------
//
// A dash landing can leave the collision box overlapping a solid; every
// later move is rejected and the bot starves frozen (the seed-42 drawn
// rounds). Only another dash moves the body center out — the recovery
// steers the facing toward the free landing and casts "e".

// Self frozen against the top border (row 0 solid): the body box at
// (0, -4.56) overlaps row 0, so every cardinal move is rejected; the only
// dash with a free landing points south (dz = 1).
function wedgedView(selfOverrides = {}) {
  const view = makeView({
    self: { x: 0, z: -4.56, lastDx: 0, lastDz: -1, ...selfOverrides },
    rival: { x: 0, z: 4 }
  });
  view.grid[0].fill(1);
  view.dt = 0.1; // the wedge watch reads the view's dt
  return view;
}

test("wedge recovery steers the facing south, then casts the dash", () => {
  const memory = createV1Memory();
  const view = wedgedView();
  let intent = { dx: 0, dz: -1, plantBomb: false, skill: null };
  for (let i = 0; i < 13; i += 1) {
    intent = unwedgeMovement(view, { dx: 0, dz: -1, plantBomb: false, skill: null }, memory, {});
  }
  // Freeze declared: steer toward the free landing, no cast before the
  // facing is prepared.
  assert.deepEqual([intent.dx, intent.dz], [0, 1]);
  assert.equal(intent.skill, null);
  // Facing prepared (the game copies the steered intent into lastDx/lastDz):
  // the next evaluation fires the dash.
  view.self.lastDx = 0;
  view.self.lastDz = 1;
  intent = unwedgeMovement(view, { dx: 0, dz: 1, plantBomb: false, skill: null }, memory, {});
  assert.equal(intent.skill, "e");
});

test("wedge recovery holds while the dash is on cooldown", () => {
  const memory = createV1Memory();
  const view = wedgedView({ eCooldown: 5 });
  let intent = null;
  for (let i = 0; i < 15; i += 1) {
    intent = unwedgeMovement(view, { dx: 0, dz: -1, plantBomb: false, skill: null }, memory, {});
  }
  assert.equal(intent.skill, null);
  assert.deepEqual([intent.dx, intent.dz], [0, -1]); // untouched intent
  assert.ok(memory.freezeTime >= 1.2, "freeze time keeps accumulating");
});

test("wedge recovery never fires while the bot moves or waits deliberately", () => {
  const memory = createV1Memory();
  const view = wedgedView();
  // Progress: the position changes between thinks.
  let intent = { dx: 0, dz: -1, plantBomb: false, skill: null };
  for (let i = 0; i < 20; i += 1) {
    view.self.z -= 0.1;
    intent = unwedgeMovement(view, intent, memory, {});
  }
  assert.equal(memory.freezeTime, 0);
  assert.equal(intent.skill, null);
  // Deliberate wait IN THE OPEN (box free, zero intent): nothing accumulates.
  const openView = makeView({ self: { x: 0, z: 0 }, rival: { x: 0, z: 4 } });
  openView.dt = 0.1;
  for (let i = 0; i < 20; i += 1) {
    intent = unwedgeMovement(openView, { dx: 0, dz: 0, plantBomb: false, skill: null }, memory, {});
  }
  assert.equal(memory.freezeTime, 0);
  assert.equal(intent.skill, null);
});

test("wedge watch survives idle intent frames while physically frozen", () => {
  // The measured seed-42 pattern: the baseline brain emits {0,0} frames
  // between unstick commits; each one used to reset the watch and the
  // recovery never fired.
  const memory = createV1Memory();
  const view = wedgedView();
  let intent = null;
  for (let i = 0; i < 14; i += 1) {
    const moving = i % 2 === 0 ? { dx: 0, dz: -1 } : { dx: 0, dz: 0 };
    intent = unwedgeMovement(view, { ...moving, plantBomb: false, skill: null }, memory, {});
  }
  assert.ok(memory.freezeTime >= 1.2, "idle frames must not reset the wedge watch");
  assert.deepEqual([intent.dx, intent.dz], [0, 1]); // steering south
  assert.equal(intent.skill, null); // facing not prepared yet
});
