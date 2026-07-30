import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ADV_BASE,
  ADV_DOMINUS_WEIGHT,
  ADV_FURY_WEIGHT,
  advantageEngageAllowed,
  advantageScore,
  advantageThreshold
} from "./advantage.mjs";
import { createV1Policy } from "./create-v1-policy.mjs";
import { createRenektonMemory } from "./renekton/renekton-memory.mjs";
import { evaluateRenektonSkill } from "./renekton/renekton-skills.mjs";

// Same view helpers as verify-personality.test.mjs: 13x11 open grid, self
// on cell (5,6), rival on cell (5,9) at world (3,0).
function makeArenaView(overrides = {}) {
  const cols = 13;
  const rows = 11;
  const tile = 1;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
  return {
    meta: { cols, rows, tile, roundAge: 5, ...(overrides.meta ?? {}) },
    grid: overrides.grid ?? grid,
    self: { id: 2, alive: true, x: 0, z: 0, maxBombs: 1, ...(overrides.self ?? {}) },
    rival: { id: 1, alive: true, x: 3, z: 0, ...(overrides.rival ?? {}) },
    bombs: overrides.bombs ?? [],
    blasts: overrides.blasts ?? [],
    pickups: overrides.pickups ?? [],
    dt: 0.016
  };
}

function makeRenektonView(overrides = {}) {
  const base = makeArenaView(overrides);
  base.self = {
    health: 100, maxHealth: 100, fury: 0,
    qCooldown: 0, wCooldown: 0, eCooldown: 0, rCooldown: 0,
    skillsUnlocked: [true, true, true, true],
    renektonDashRecast: 0, renektonDominus: 0,
    ...base.self
  };
  return base;
}

test("threshold falls as aggression rises", () => {
  const close = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(close(advantageThreshold(0), 0.8));
  assert.ok(close(advantageThreshold(0.5), 0.55));
  assert.ok(close(advantageThreshold(1), 0.3));
  assert.ok(advantageThreshold(0) > advantageThreshold(0.5));
  assert.ok(advantageThreshold(0.5) > advantageThreshold(1));
  assert.ok(close(advantageThreshold(Number.NaN), 0.55)); // invalid: neutral
});

test("an even fight scores the neutral base", () => {
  // Equal health, no fury, equal kit, rival in the open, no bombs.
  const view = makeRenektonView({
    self: { health: 100, maxHealth: 100 },
    rival: { health: 100, maxHealth: 100, skillsUnlocked: [true, true, true, true] }
  });
  assert.equal(advantageScore(view), ADV_BASE);
});

test("score rises with a health edge and falls behind", () => {
  const ahead = makeRenektonView({ rival: { health: 40, maxHealth: 100 } });
  const behind = makeRenektonView({ self: { health: 40, maxHealth: 100 } });
  assert.ok(advantageScore(ahead) > ADV_BASE);
  assert.ok(advantageScore(behind) < ADV_BASE);
});

test("fury at the empower threshold adds its weight", () => {
  const view = makeRenektonView({ self: { fury: 50 } });
  assert.ok(Math.abs(advantageScore(view) - (ADV_BASE + ADV_FURY_WEIGHT)) < 1e-9);
});

test("a cornered rival raises the score", () => {
  // Rival cell (5,9) with three of four neighbors walled off.
  const grid = Array.from({ length: 11 }, () => Array(13).fill(0));
  grid[4][9] = 1;
  grid[6][9] = 1;
  grid[5][10] = 1;
  const open = makeRenektonView();
  const cornered = makeRenektonView({ grid });
  assert.ok(advantageScore(cornered) > advantageScore(open));
});

test("a rival under a bomb clock raises the score as the window closes", () => {
  const bomb = (age) => ({
    id: 1, ownerId: 2, r: 5, c: 8, range: 2,
    fuse: 2.35, age, exploded: false, passOwners: []
  });
  const open = makeRenektonView();
  const early = makeRenektonView({ bombs: [bomb(0)] });
  const late = makeRenektonView({ bombs: [bomb(2)] });
  assert.ok(advantageScore(early) >= advantageScore(open));
  assert.ok(advantageScore(late) > advantageScore(early));
});

test("an active Dominus and a kit edge raise the score", () => {
  const dominus = makeRenektonView({ self: { renektonDominus: 5 } });
  assert.ok(Math.abs(advantageScore(dominus) - (ADV_BASE + ADV_DOMINUS_WEIGHT)) < 1e-9);
  const kitEdge = makeRenektonView({
    rival: { skillsUnlocked: [true, false, false, false] }
  });
  assert.ok(advantageScore(kitEdge) > ADV_BASE);
});

test("score stays clamped inside [0, 1]", () => {
  const desperate = makeRenektonView({
    self: { health: 1, maxHealth: 100, skillsUnlocked: [false, false, false, false] },
    rival: { health: 100, maxHealth: 100, skillsUnlocked: [true, true, true, true] }
  });
  const dream = makeRenektonView({
    self: { fury: 100, renektonDominus: 5 },
    rival: { health: 1, maxHealth: 100, skillsUnlocked: [false, false, false, false] }
  });
  assert.ok(advantageScore(desperate) >= 0);
  assert.ok(advantageScore(dream) <= 1);
});

test("gate opens without a personality and follows the threshold with one", () => {
  const losing = makeRenektonView({ self: { health: 30 } }); // score ~0.325
  assert.equal(advantageEngageAllowed(losing, null, null), true);
  assert.equal(advantageEngageAllowed(losing, null, { aggression: 0.5 }), false); // 0.55
  assert.equal(advantageEngageAllowed(losing, null, { aggression: 0 }), false); // 0.80
  assert.equal(advantageEngageAllowed(losing, null, { aggression: 1 }), true); // 0.30
  // An even fight (score 0.5) clears only the fully aggressive threshold.
  const even = makeRenektonView({
    rival: { health: 100, maxHealth: 100, skillsUnlocked: [true, true, true, true] }
  });
  assert.equal(advantageEngageAllowed(even, null, { aggression: 0.5 }), false);
  assert.equal(advantageEngageAllowed(even, null, { aggression: 1 }), true);
  // A clear edge (rival at 20%) clears the neutral threshold.
  const winning = makeRenektonView({ rival: { health: 20, maxHealth: 100 } });
  assert.equal(advantageEngageAllowed(winning, null, { aggression: 0.5 }), true);
});

test("engage E is blocked at a disadvantage and released with an edge", () => {
  // Aligned rival 4 tiles away; self at 45% health (score ~0.3625, above
  // the 0.4 defensive-Dominus line so branch 2 does not preempt).
  const losing = makeRenektonView({ rival: { x: 0, z: 4 }, self: { health: 45 } });
  // Regression: without a personality the legacy trigger fires as before.
  assert.equal(
    evaluateRenektonSkill(losing, createRenektonMemory(), () => 0.5)?.reason,
    "close-distance"
  );
  assert.equal(
    evaluateRenektonSkill(losing, createRenektonMemory(), () => 0.5, { aggression: 0.5 }),
    null
  );
  // Clear edge (rival at 20%): the neutral temperament engages.
  const winning = makeRenektonView({
    rival: { x: 0, z: 4, health: 20, maxHealth: 100 }
  });
  assert.equal(
    evaluateRenektonSkill(winning, createRenektonMemory(), () => 0.5, { aggression: 0.5 })?.reason,
    "close-distance"
  );
});

test("empowered fury alone clears the neutral threshold", () => {
  // Even health, fury 50: score 0.60 >= 0.55 — the engage fires.
  const view = makeRenektonView({ rival: { x: 0, z: 4 }, self: { fury: 50 } });
  assert.equal(
    evaluateRenektonSkill(view, createRenektonMemory(), () => 0.5, { aggression: 0.5 })?.reason,
    "close-distance"
  );
});

test("high aggression no longer hunts past a pickup at a disadvantage", () => {
  // Same geometry as the cycle-11 slack test (rival dist 3, pickup dist 1,
  // slack 6.4 at 0.9) but the self is at 30% health: the gate keeps the
  // economy target.
  const policy = createV1Policy({ random: () => 0.5, personality: { aggression: 0.9 } });
  policy.think(makeArenaView({
    self: { health: 30, maxHealth: 100 },
    rival: { health: 100, maxHealth: 100 },
    pickups: [{ r: 5, c: 7, type: "range" }]
  }), 0.016);
  assert.deepEqual(policy.memory.targetCell, { r: 5, c: 7 });
});

test("high aggression still hunts past a pickup with the edge", () => {
  const policy = createV1Policy({ random: () => 0.5, personality: { aggression: 0.9 } });
  policy.think(makeArenaView({
    self: { health: 100, maxHealth: 100 },
    rival: { health: 20, maxHealth: 100 },
    pickups: [{ r: 5, c: 7, type: "range" }]
  }), 0.016);
  assert.deepEqual(policy.memory.targetCell, { r: 5, c: 9 });
});
