import assert from "node:assert/strict";
import { test } from "node:test";

import { createRenektonMemory, resetRenektonMemory } from "./renekton-memory.mjs";
import { createRenektonPilot, evaluateRenektonSkill } from "./renekton-skills.mjs";

function makeView(overrides = {}) {
  const cols = 13;
  const rows = 11;
  const tile = 1;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
  return {
    meta: { cols, rows, tile, roundAge: 5, ...(overrides.meta ?? {}) },
    grid,
    self: {
      id: 2, alive: true, x: 0, z: 0,
      health: 100, maxHealth: 100, fury: 0,
      qCooldown: 0, wCooldown: 0, eCooldown: 0, rCooldown: 0,
      skillsUnlocked: [true, true, true, true],
      renektonDashRecast: 0, renektonDominus: 0,
      ...(overrides.self ?? {})
    },
    rival: {
      id: 1, alive: true, x: 0, z: 1,
      ...(overrides.rival ?? {})
    },
    bombs: overrides.bombs ?? [],
    blasts: overrides.blasts ?? [],
    pickups: overrides.pickups ?? [],
    dt: overrides.dt ?? 0.016
  };
}

test("renekton harvests with Q when the rival is adjacent", () => {
  const memory = createRenektonMemory();
  const skill = evaluateRenektonSkill(makeView(), memory, () => 0.5);
  assert.equal(skill.slot, "q");
  assert.equal(skill.reason, "harvest-adjacent-rival");
  assert.equal(memory.lastSkill.slot, "q");
  assert.ok(memory.skillHesitation > 0);
});

test("renekton prefers empowered W with 50+ fury in melee", () => {
  const memory = createRenektonMemory();
  const skill = evaluateRenektonSkill(
    makeView({ self: { fury: 60 } }),
    memory,
    () => 0.5
  );
  assert.equal(skill.slot, "w");
  assert.equal(skill.reason, "empowered-stun");
});

test("renekton dashes out with E when standing in danger", () => {
  const memory = createRenektonMemory();
  const skill = evaluateRenektonSkill(
    makeView({ blasts: [{ r: 5, c: 6 }], rival: { z: 4 } }),
    memory,
    () => 0.5
  );
  assert.equal(skill.slot, "e");
  assert.equal(skill.reason, "escape-danger");
  assert.equal(memory.pendingDice, true);
});

test("renekton ults to survive when low with the rival close", () => {
  const memory = createRenektonMemory();
  const skill = evaluateRenektonSkill(
    makeView({ self: { health: 30 }, rival: { z: 3 } }),
    memory,
    () => 0.5
  );
  assert.equal(skill.slot, "r");
  assert.equal(skill.reason, "survive-low-health");
});

test("renekton engages with E when aligned, safe and in reach", () => {
  const memory = createRenektonMemory();
  const skill = evaluateRenektonSkill(
    makeView({ rival: { z: 4 } }),
    memory,
    () => 0.5
  );
  assert.equal(skill.slot, "e");
  assert.equal(skill.reason, "close-distance");
  assert.equal(memory.pendingDice, true);
});

test("renekton never emits blind when cooldown state is unknown", () => {
  const memory = createRenektonMemory();
  const view = makeView();
  delete view.self.qCooldown;
  delete view.self.wCooldown;
  delete view.self.eCooldown;
  delete view.self.rCooldown;
  const skill = evaluateRenektonSkill(view, memory, () => 0.5);
  assert.equal(skill, null);
});

test("renekton treats the open Dice window as E ready despite cooldown", () => {
  const memory = createRenektonMemory();
  const skill = evaluateRenektonSkill(
    makeView({ blasts: [{ r: 5, c: 6 }], rival: { z: 4 }, self: { eCooldown: 8, renektonDashRecast: 2.1 } }),
    memory,
    () => 0.5
  );
  assert.equal(skill.slot, "e");
  assert.equal(skill.reason, "escape-danger");
});

test("renekton respects locked skills and running cooldowns", () => {
  const memory = createRenektonMemory();
  const locked = evaluateRenektonSkill(
    makeView({ self: { skillsUnlocked: [false, true, true, true] } }),
    memory,
    () => 0.5
  );
  assert.equal(locked.slot, "w"); // Q locked, falls through to plain W

  const cooling = evaluateRenektonSkill(
    makeView({ self: { qCooldown: 2, wCooldown: 2, eCooldown: 2, rCooldown: 2 } }),
    createRenektonMemory(),
    () => 0.5
  );
  assert.equal(cooling, null);
});

test("renekton does not ult while Dominus is already running", () => {
  const memory = createRenektonMemory();
  const skill = evaluateRenektonSkill(
    makeView({ self: { health: 30, renektonDominus: 3 }, rival: { z: 3 } }),
    memory,
    () => 0.5
  );
  assert.notEqual(skill?.slot, "r");
});

test("hesitation window blocks immediate skill spam", () => {
  const memory = createRenektonMemory();
  const first = evaluateRenektonSkill(makeView(), memory, () => 0.5);
  assert.equal(first.slot, "q");
  const second = evaluateRenektonSkill(makeView(), memory, () => 0.5);
  assert.equal(second, null);
});

test("renekton plays the full combo E→R→W→Q→Dice with the recast open", () => {
  const memory = createRenektonMemory();
  // E: aligned, safe, in reach — opens the combo.
  const open = evaluateRenektonSkill(
    makeView({ rival: { z: 4 }, self: { lastDx: 0, lastDz: 1 } }),
    memory,
    () => 0.5
  );
  assert.equal(open.slot, "e");
  assert.equal(open.reason, "close-distance");
  assert.equal(memory.comboStep, 1);
  assert.ok(memory.exitCell);
  // A CONNECTED Slice always opens the recast window: the pilot stands ~3
  // tiles in, the rival 1 tile ahead, E on cooldown.
  const afterSlice = { z: 3, eCooldown: 13, renektonDashRecast: 2.6, lastDx: 0, lastDz: 1 };
  // Dominus opens the commit BEFORE the Dice can preempt it.
  const ult = evaluateRenektonSkill(
    makeView({ rival: { z: 4 }, self: afterSlice, dt: 2 }),
    memory,
    () => 0.5
  );
  assert.equal(ult.slot, "r");
  assert.equal(ult.reason, "dominus-engage");
  assert.equal(memory.comboUlted, true);
  // W stuns before the Dice (Dominus confirmed by the running aura).
  const stun = evaluateRenektonSkill(
    makeView({
      rival: { z: 4 },
      self: { ...afterSlice, renektonDominus: 4, rCooldown: 120, renektonDashRecast: 2.2 },
      dt: 1
    }),
    memory,
    () => 0.5
  );
  assert.equal(stun.slot, "w");
  assert.equal(stun.reason, "combo-stun");
  assert.equal(memory.comboStep, 2);
  // Q harvests inside the stun; the window stays open, so the combo waits
  // for the Dice instead of concluding (W confirmed by its cooldown).
  const cull = evaluateRenektonSkill(
    makeView({
      rival: { z: 4 },
      self: { ...afterSlice, renektonDominus: 4, rCooldown: 120, wCooldown: 13, renektonDashRecast: 1.8 },
      dt: 1
    }),
    memory,
    () => 0.5
  );
  assert.equal(cull.slot, "q");
  assert.equal(cull.reason, "combo-cull");
  assert.equal(memory.comboStep, 3);
  // The Dice finishes through the rival and closes the sequence (Q
  // confirmed by its cooldown).
  const dice = evaluateRenektonSkill(
    makeView({
      rival: { z: 4 },
      self: {
        ...afterSlice, renektonDominus: 4, rCooldown: 120,
        wCooldown: 12, qCooldown: 9, renektonDashRecast: 1.2
      },
      dt: 1
    }),
    memory,
    () => 0.5
  );
  assert.equal(dice.slot, "e");
  assert.equal(dice.reason, "dice-through");
  assert.equal(memory.comboStep, 0);
  assert.equal(memory.exitCell, null);
});

test("renekton stuns before spending the Dice inside the combo", () => {
  const memory = createRenektonMemory();
  memory.comboStep = 1;
  memory.comboUntil = 10;
  memory.exitCell = { r: 5, c: 6 };
  // Recast open and the rival inside W reach: the old priority fired the
  // Dice here and reset the combo (E→Dice instead of E→W→Q→Dice).
  const skill = evaluateRenektonSkill(
    makeView({
      rival: { z: 2 },
      self: { renektonDashRecast: 2.5, eCooldown: 13, rCooldown: 30, lastDx: 0, lastDz: 1 }
    }),
    memory,
    () => 0.5
  );
  assert.equal(skill.slot, "w");
  assert.equal(skill.reason, "combo-stun");
  assert.equal(memory.comboStep, 2);
});

test("renekton ults once at a committed engage, ahead of the Dice", () => {
  const memory = createRenektonMemory();
  memory.comboStep = 1;
  memory.comboUntil = 10;
  // The recast window a connected Slice opened stays up the whole time.
  const ult = evaluateRenektonSkill(
    makeView({ self: { renektonDashRecast: 2.5, eCooldown: 13, lastDx: 0, lastDz: 1 } }),
    memory,
    () => 0.5
  );
  assert.equal(ult.slot, "r");
  assert.equal(ult.reason, "dominus-engage");
  assert.equal(memory.comboUlted, true);
  // Dominus confirmed (aura running): same combo, R ready again — Dominus
  // is not spent twice; the combo continues with the stun.
  const next = evaluateRenektonSkill(
    makeView({
      self: { renektonDashRecast: 2.1, eCooldown: 12, renektonDominus: 4, rCooldown: 120, lastDx: 0, lastDz: 1 },
      dt: 1
    }),
    memory,
    () => 0.5
  );
  assert.equal(next.slot, "w");
  assert.equal(next.reason, "combo-stun");
});

test("renekton spends the Dice as the exit when no follow-up is available", () => {
  const memory = createRenektonMemory();
  memory.comboStep = 2;
  memory.comboUntil = 10;
  memory.exitCell = { r: 5, c: 6 };
  // W and Q both on cooldown: nothing left inside the stun, so the Dice
  // takes the frame as the exit.
  const skill = evaluateRenektonSkill(
    makeView({
      rival: { z: 1 },
      self: {
        renektonDashRecast: 2.5, eCooldown: 13, rCooldown: 30,
        qCooldown: 9, wCooldown: 9, lastDx: 0, lastDz: 1
      }
    }),
    memory,
    () => 0.5
  );
  assert.equal(skill.slot, "e");
  assert.equal(skill.reason, "dice-through");
  assert.equal(memory.comboStep, 0);
  assert.equal(memory.exitCell, null);
  assert.ok(memory.skillHesitation > 0.5); // out of combo: deliberate pacing
});

test("renekton fires the Dice as last resort when the window closes", () => {
  const memory = createRenektonMemory();
  memory.comboStep = 1;
  memory.comboUntil = 10;
  // W is ready and in reach, but the window is closing and the facing is
  // wrong: a spent Dice beats an expired one.
  const skill = evaluateRenektonSkill(
    makeView({
      rival: { z: 2 },
      self: { renektonDashRecast: 0.5, eCooldown: 13, rCooldown: 30, lastDx: 1, lastDz: 0 }
    }),
    memory,
    () => 0.5
  );
  assert.equal(skill.slot, "e");
  assert.equal(skill.reason, "dice-through");
  assert.equal(memory.comboStep, 0);
});

test("renekton dices for the kill when empowered and the rival is low", () => {
  const memory = createRenektonMemory();
  const skill = evaluateRenektonSkill(
    makeView({
      self: { renektonDashRecast: 2.5, eCooldown: 8, fury: 60, lastDx: 0, lastDz: 1 },
      rival: { health: 20, maxHealth: 100 }
    }),
    memory,
    () => 0.5
  );
  assert.equal(skill.slot, "e");
  assert.equal(skill.reason, "dice-finish");
});

test("renekton concludes the combo on Q when no recast window is open", () => {
  const memory = createRenektonMemory();
  memory.comboStep = 2;
  memory.comboUntil = 10;
  memory.pendingDice = true;
  memory.exitCell = { r: 5, c: 6 };
  // The Slice missed or the window expired: no Dice is coming, so the Q
  // concludes the combo instead of leaving state around until the timeout.
  const skill = evaluateRenektonSkill(
    makeView({
      rival: { z: 1 },
      self: { eCooldown: 13, wCooldown: 12, rCooldown: 30, lastDx: 0, lastDz: 1 }
    }),
    memory,
    () => 0.5
  );
  assert.equal(skill.slot, "q");
  assert.equal(skill.reason, "combo-cull");
  assert.equal(memory.comboStep, 0);
  assert.equal(memory.pendingDice, false);
  assert.equal(memory.exitCell, null);
  assert.ok(memory.skillHesitation > 0.5); // deliberate pacing after the reset
});

test("renekton holds W until the recent movement faces the rival", () => {
  const memory = createRenektonMemory();
  memory.comboStep = 1;
  memory.comboUntil = 10;
  // Facing away from the rival (rival at +z, facing -z): no crooked cast.
  const held = evaluateRenektonSkill(
    makeView({ self: { renektonDashRecast: 2.5, eCooldown: 13, rCooldown: 30, lastDx: 0, lastDz: -1 } }),
    memory,
    () => 0.5
  );
  assert.equal(held, null);
  assert.equal(memory.aimPending?.slot, "w");
  // One frame walking toward the rival prepares the facing: the cast fires.
  const fired = evaluateRenektonSkill(
    makeView({ self: { renektonDashRecast: 2.5, eCooldown: 13, rCooldown: 30, lastDx: 0, lastDz: 1 }, dt: 1 }),
    memory,
    () => 0.5
  );
  assert.equal(fired.slot, "w");
  assert.equal(fired.reason, "combo-stun");
  assert.equal(memory.aimPending, null);
});

test("renekton gives up a held cast after two expirations of the same slot", () => {
  const memory = createRenektonMemory();
  memory.comboStep = 1;
  memory.comboUntil = 99;
  // Rival at distance 2 (inside W reach, outside Q), recast open and not
  // closing, facing pinned AWAY from the rival and never fixed manually.
  const view = (roundAge) => makeView({
    meta: { roundAge },
    rival: { z: 2 },
    self: { renektonDashRecast: 2.5, eCooldown: 13, rCooldown: 30, lastDx: 0, lastDz: -1 }
  });
  // First hold: the patience window is a real deadline.
  assert.equal(evaluateRenektonSkill(view(5.0), memory, () => 0.5), null);
  assert.deepEqual(
    { slot: memory.aimPending.slot, holds: memory.aimPending.holds },
    { slot: "w", holds: 1 }
  );
  const deadline = memory.aimPending.until;
  // Inside the window the hold is NOT extended.
  assert.equal(evaluateRenektonSkill(view(5.3), memory, () => 0.5), null);
  assert.equal(memory.aimPending.until, deadline);
  // First expiration: one more counted hold of the same slot.
  assert.equal(evaluateRenektonSkill(view(5.7), memory, () => 0.5), null);
  assert.equal(memory.aimPending.holds, 2);
  // Second expiration: the evaluation gives up on the cast — the hold is
  // cleared and no W fires (the Dice does not steal the frame either: the
  // follow-up is still available).
  assert.equal(evaluateRenektonSkill(view(6.4), memory, () => 0.5), null);
  assert.equal(memory.aimPending, null);
  assert.equal(memory.comboStep, 1);
  // The branch retries naturally on a later tick with a fresh count.
  assert.equal(evaluateRenektonSkill(view(7.0), memory, () => 0.5), null);
  assert.equal(memory.aimPending?.holds, 1);
});

test("renekton holds the engage E while the facing points elsewhere", () => {
  const memory = createRenektonMemory();
  const held = evaluateRenektonSkill(
    makeView({ rival: { z: 4 }, self: { lastDx: 1, lastDz: 0 } }),
    memory,
    () => 0.5
  );
  assert.equal(held, null);
  assert.equal(memory.aimPending?.slot, "e");
  assert.equal(memory.comboStep, 0);
  const fired = evaluateRenektonSkill(
    makeView({ rival: { z: 4 }, self: { lastDx: 0, lastDz: 1 }, dt: 1 }),
    memory,
    () => 0.5
  );
  assert.equal(fired.slot, "e");
  assert.equal(fired.reason, "close-distance");
  assert.equal(memory.comboStep, 1);
});

test("renekton holds the escape dash until the facing points to safety", () => {
  const memory = createRenektonMemory();
  // Bombs cover the self row and the +z column: the self cell turns deadly
  // in 2.35s, the facing (+z, toward the rival) points into the blast, and
  // the only safe neighbors are -x/-z.
  const bombs = [
    { id: 9, r: 5, c: 8, range: 2, fuse: 2.35, age: 0, exploded: false },
    { id: 10, r: 8, c: 6, range: 2, fuse: 2.35, age: 0, exploded: false }
  ];
  const held = evaluateRenektonSkill(
    makeView({ bombs, rival: { z: 4 }, self: { lastDx: 0, lastDz: 1 } }),
    memory,
    () => 0.5
  );
  assert.equal(held, null); // no dash on a stale facing — into the threat
  // One frame walking the escape route turns the facing: the dash fires.
  const fired = evaluateRenektonSkill(
    makeView({ bombs, rival: { z: 4 }, self: { lastDx: -1, lastDz: 0 } }),
    memory,
    () => 0.5
  );
  assert.equal(fired.slot, "e");
  assert.equal(fired.reason, "escape-danger");
  assert.equal(memory.pendingDice, true);
});

test("renekton dashes even misaligned when the deadly window is imminent", () => {
  const memory = createRenektonMemory();
  // 0.25s until the blast: there is no next tick to fix the facing, so a
  // crooked dash beats dying.
  const bombs = [{ id: 9, r: 5, c: 8, range: 2, fuse: 2.35, age: 2.1, exploded: false }];
  const skill = evaluateRenektonSkill(
    makeView({ bombs, rival: { z: 4 }, self: { lastDx: 0, lastDz: 1 } }),
    memory,
    () => 0.5
  );
  assert.equal(skill.slot, "e");
  assert.equal(skill.reason, "escape-danger");
});

test("renekton holds offensive W/Q while standing in danger", () => {
  const memory = createRenektonMemory();
  // Blast on the self cell, E on cooldown: no offensive cast may fire — a
  // W teleport would strand the temporal escape route computed from the
  // old position.
  const skill = evaluateRenektonSkill(
    makeView({
      blasts: [{ r: 5, c: 6 }],
      rival: { z: 1 },
      self: { fury: 60, eCooldown: 8 }
    }),
    memory,
    () => 0.5
  );
  assert.equal(skill, null);
});

test("renekton replays a combo step the game never confirmed", () => {
  const memory = createRenektonMemory();
  memory.comboStep = 1;
  memory.comboUntil = 10;
  // The stun is asked...
  const asked = evaluateRenektonSkill(
    makeView({
      rival: { z: 2 },
      self: { renektonDashRecast: 2.5, eCooldown: 13, rCooldown: 30, lastDx: 0, lastDz: 1 }
    }),
    memory,
    () => 0.5
  );
  assert.equal(asked.slot, "w");
  assert.equal(memory.comboStep, 2);
  // ...but castAbility rejected it: the W cooldown never started. The next
  // evaluation rolls the step back and asks the stun again instead of
  // advancing to the Dice.
  const replayed = evaluateRenektonSkill(
    makeView({
      rival: { z: 2 },
      self: { renektonDashRecast: 2.0, eCooldown: 12, rCooldown: 30, wCooldown: 0, lastDx: 0, lastDz: 1 },
      dt: 1
    }),
    memory,
    () => 0.5
  );
  assert.equal(replayed.slot, "w");
  assert.equal(replayed.reason, "combo-stun");
});

test("a combo the rival escaped is forgotten beyond the leash", () => {
  const memory = createRenektonMemory();
  memory.comboStep = 1;
  memory.comboUntil = 10;
  const skill = evaluateRenektonSkill(
    makeView({ rival: { z: 8 }, self: { qCooldown: 2, wCooldown: 2, eCooldown: 2, rCooldown: 2 } }),
    memory,
    () => 0.5
  );
  assert.equal(skill, null);
  assert.equal(memory.comboStep, 0);
});

test("hesitation is short inside a combo and deliberate outside it", () => {
  const outside = createRenektonMemory();
  evaluateRenektonSkill(makeView(), outside, () => 0.5);
  assert.ok(outside.skillHesitation > 0.5); // 0.9 + 0.4 * 0.5

  const inside = createRenektonMemory();
  inside.comboStep = 1;
  inside.comboUntil = 10;
  evaluateRenektonSkill(
    makeView({ self: { rCooldown: 30, lastDx: 0, lastDz: 1 } }),
    inside,
    () => 0.5
  );
  assert.ok(inside.skillHesitation > 0);
  assert.ok(inside.skillHesitation < 0.5); // 0.22 + 0.16 * 0.5
});

test("pilot composes memory, evaluation and reset", () => {
  const pilot = createRenektonPilot({ random: () => 0.5 });
  assert.equal(pilot.id, "renekton");
  const skill = pilot.evaluateSkill(makeView());
  assert.equal(skill.slot, "q");
  pilot.reset();
  assert.equal(pilot.memory.lastSkill, null);
  assert.equal(pilot.memory.skillHesitation, 0);
  assert.equal(pilot.memory.pendingDice, false);
});

test("renekton memory reset restores the initial tactical state", () => {
  const memory = createRenektonMemory();
  memory.comboStep = 2;
  memory.pendingDice = true;
  memory.exitCell = { r: 5, c: 6 };
  memory.lastSkill = { slot: "e", reason: "escape-danger", at: 4, effects: null };
  memory.skillHesitation = 1.2;
  resetRenektonMemory(memory);
  assert.deepEqual(memory, createRenektonMemory());
});
