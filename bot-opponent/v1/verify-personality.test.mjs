import assert from "node:assert/strict";
import { test } from "node:test";

import { AGGRESSION_DEFAULT, AGGRESSION_PICKUP_SLACK, aggressionOf, aggressionPickupSlack } from "./personality.mjs";
import { createV1Policy } from "./create-v1-policy.mjs";
import { createRenektonMemory } from "./renekton/renekton-memory.mjs";
import { evaluateRenektonSkill } from "./renekton/renekton-skills.mjs";
import { runCpuDuels } from "./run-cpu-duels.mjs";

function makeArenaView(overrides = {}) {
  const cols = 13;
  const rows = 11;
  const tile = 1;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
  return {
    meta: { cols, rows, tile, roundAge: 5, ...(overrides.meta ?? {}) },
    grid,
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

test("aggression defaults to neutral and clamps to [0, 1]", () => {
  assert.equal(AGGRESSION_DEFAULT, 0.5);
  assert.equal(aggressionOf(null), 0.5);
  assert.equal(aggressionOf({}), 0.5);
  assert.equal(aggressionOf({ aggression: 0.8 }), 0.8);
  assert.equal(aggressionOf({ aggression: 2 }), 1);
  assert.equal(aggressionOf({ aggression: -1 }), 0);
  assert.equal(aggressionOf({ aggression: Number.NaN }), 0.5);
});

test("pickup slack is zero at or below neutral and grows above it", () => {
  assert.equal(aggressionPickupSlack(0), 0);
  assert.equal(aggressionPickupSlack(AGGRESSION_DEFAULT), 0);
  assert.equal(aggressionPickupSlack(1), AGGRESSION_PICKUP_SLACK);
  assert.ok(aggressionPickupSlack(0.8) > 0);
});

test("policy without personality is bit-identical to the explicit default", () => {
  const plain = createV1Policy({ random: () => 0.5 });
  const explicit = createV1Policy({
    random: () => 0.5,
    personality: { aggression: AGGRESSION_DEFAULT }
  });
  const scenarios = [
    () => makeArenaView(),
    () => makeArenaView({ pickups: [{ r: 5, c: 7, type: "range" }] }),
    () => makeArenaView({ blasts: [{ r: 5, c: 6 }] }),
    () => makeArenaView({ rival: { x: 0, z: 4 } })
  ];
  for (let i = 0; i < 120; i += 1) {
    const view = scenarios[i % scenarios.length]();
    assert.deepEqual(plain.think(view, 0.016), explicit.think(view, 0.016), `think ${i}`);
  }
});

test("neutral navigation prefers the closer pickup over the rival", () => {
  // Self on r5 c6; pickup one cell east (dist 1), rival three cells east
  // (dist 3). Neutral: the pickup wins, exactly the pre-B8 priority.
  const policy = createV1Policy({ random: () => 0.5 });
  policy.think(makeArenaView({ pickups: [{ r: 5, c: 7, type: "range" }] }), 0.016);
  assert.deepEqual(policy.memory.targetCell, { r: 5, c: 7 });
});

test("high aggression routes the hunt past a closer pickup", () => {
  const policy = createV1Policy({ random: () => 0.5, personality: { aggression: 0.9 } });
  // Slack at 0.9 is 6.4 tiles: the rival (dist 3) outranks the pickup
  // (dist 1). The even fight (score 0.5) clears the 0.9 advantage
  // threshold (0.35) — the conditioned gate (cycle 12) only stops the
  // hunt at a real disadvantage, covered in verify-advantage.test.mjs.
  policy.think(makeArenaView({ pickups: [{ r: 5, c: 7, type: "range" }] }), 0.016);
  assert.deepEqual(policy.memory.targetCell, { r: 5, c: 9 });
});

test("aggression stretches only the Renekton engage reach", () => {
  // Rival aligned on the same column, 5 tiles away: outside the neutral
  // 4.5 reach, inside the 5.4 reach at full aggression.
  const view = makeRenektonView({ rival: { x: 0, z: 5 } });
  assert.equal(evaluateRenektonSkill(view, createRenektonMemory(), () => 0.5), null);
  const bold = evaluateRenektonSkill(view, createRenektonMemory(), () => 0.5, { aggression: 1 });
  assert.equal(bold?.reason, "close-distance");
});

test("zero aggression tightens the engage reach without breaking", () => {
  // 4 tiles: inside the neutral reach (existing behavior), outside the
  // 3.6 reach at aggression 0.
  const view = makeRenektonView({ rival: { x: 0, z: 4 } });
  const neutral = evaluateRenektonSkill(view, createRenektonMemory(), () => 0.5);
  assert.equal(neutral?.reason, "close-distance");
  assert.equal(evaluateRenektonSkill(view, createRenektonMemory(), () => 0.5, { aggression: 0 }), null);
});

test("aggression never stretches the defensive Dominus reach", () => {
  // Low health with the rival 5 tiles away: survive-low-health keeps the
  // base 4.5 reach even at full aggression (the engage below it may fire).
  const view = makeRenektonView({ rival: { x: 0, z: 5 }, self: { health: 30 } });
  const skill = evaluateRenektonSkill(view, createRenektonMemory(), () => 0.5, { aggression: 1 });
  assert.notEqual(skill?.reason, "survive-low-health");
});

test("harness without aggression stays deterministic (legacy trigger)", async () => {
  // Cycle 12 ended the null-vs-explicit parity ON PURPOSE: with a
  // personality present the engage demands a measured advantage
  // (advantage.mjs), so `--aggression 0.5` no longer plays the legacy
  // trigger. Without a personality the gate is open and the behavior is
  // bit-identical to the pre-cycle-12 V1 — pinned here by determinism.
  const first = await runCpuDuels({ matches: 2, seed: 42 });
  const second = await runCpuDuels({ matches: 2, seed: 42 });
  assert.equal(first.v1.aggression, null);
  assert.deepEqual(second, first);
});

test("self-play opponent v1 is deterministic and reports its policy", async () => {
  const first = await runCpuDuels({ matches: 1, seed: 42, opponent: "v1" });
  assert.equal(first.opponent.policy, "v1");
  assert.equal(first.opponent.player, 1);
  assert.equal(first.opponent.champion, "katarina");
  assert.ok(first.rounds >= 1, "the self-play match played at least one round");
  const second = await runCpuDuels({ matches: 1, seed: 42, opponent: "v1" });
  assert.deepEqual(second, first);
});
