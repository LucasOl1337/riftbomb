/**
 * Renekton kit evaluation for the V1 pilot.
 *
 * Emits skill *intents* only ("q" | "w" | "e" | "r"); game/ validates
 * cooldowns, Fury and executes through the same path as human input.
 * Readiness is only trusted when the WorldView exposes it — unknown
 * cooldown state means "not ready" (never emit blind).
 *
 * Real WorldView fields (from the Match contestant): flat cooldowns
 * `qCooldown`…`rCooldown` in seconds, `skillsUnlocked` array (0=Q…3=R),
 * `fury` 0–100, `renektonDashRecast` (Dice window), `renektonDominus`.
 *
 * Combo play (cycle 9): the pilot drives a tactical combo through
 * `memory.comboStep` — E closes (step 1) → Dominus opens the commit →
 * W stuns (step 2) → Q harvests inside the stun (step 3) → the open Dice
 * window finishes through the rival or dashes back to `memory.exitCell`.
 * A CONNECTED Slice always opens `renektonDashRecast`, so the follow-ups
 * (Dominus/W/Q) are evaluated BEFORE the Dice spending — otherwise the
 * recast priority turns the real combo into E→Dice→reset. The Dice only
 * takes the frame as the finisher (the kill closes), as the exit when the
 * combo is done or offers no follow-up (W and Q on cooldown), or as a
 * last resort with the window closing. Without an open recast the Q
 * concludes the combo immediately instead of leaving state around until
 * the timeout. Combos expire on a leash (rival fled), on a timeout, or
 * when the rival dies; round resets clear the whole memory.
 *
 * Cast reconciliation: the combo memory advances when an intent is ASKED,
 * but game/ may reject the cast. The next evaluation proves from the
 * WorldView that the ask really happened (cooldown started, Dominus
 * running, recast/E cooldown moved); an unconfirmed ask has its combo
 * effects rolled back so the sequence replays the skipped step.
 *
 * Aim discipline: directional casts (E, W) travel along `lastDx/lastDz`,
 * the facing the previous frame's movement left behind (the think runs
 * before this frame's movement, D8). When the recent movement does not
 * point at the target the pilot HOLDS the cast — the arena brain keeps
 * walking and prepares the facing — instead of dashing sideways. A hold
 * is never extended while it runs, and after AIM_MAX_HOLDS expirations of
 * the SAME slot the evaluation gives up on that cast once (the branch
 * retries naturally on later ticks). Unknown facing (partial views,
 * tests) never blocks.
 *
 * Escape dashes follow a stricter rule: the facing must point at a KNOWN
 * safe direction (a walkable neighbor with dangerAt === 0, or the first
 * hop of the temporal escape route), because a dash fired on a stale
 * facing can carry the bot INTO the threat. Misaligned: hold the cast —
 * the temporal escape walks one frame toward safety and the dash fires
 * next tick with the right facing. Last call: when the cell's deadly
 * window starts in under ESCAPE_LAST_CALL seconds there is no next tick,
 * so a crooked dash beats dying.
 */

import { cellFromWorld, dangerAt, worldFromCell } from "../../baseline-policy.mjs";
import { dangerTimeline, escapePlan, safeWindowAfter } from "../danger-timeline.mjs";
import { createRenektonMemory, resetRenektonMemory } from "./renekton-memory.mjs";

const MELEE_REACH = 1.6;    // tiles — Q/W want the rival adjacent
const ENGAGE_REACH = 4.5;   // tiles — E engage window
const EMPOWER_FURY = 50;    // Fury threshold for empowered casts
const COMBO_W_REACH = 2.9;  // tiles — W locks the rival up to 3.05 (game)
const COMBO_LEASH = 5.5;    // tiles — beyond this the engage is over
const COMBO_TIMEOUT = 6;    // seconds a combo may stay unfinished
const DICE_REACH = 3.0;     // tiles — Dice crosses the rival up to 3.15 (game)
const FINISH_HEALTH = 0.35; // rival ratio where an empowered Dice closes the kill
const AIM_ENGAGE = 0.6;     // min facing·target dot to start the E engage
const AIM_W = 0.3;          // min dot for W (game locks the rival above -0.15)
const AIM_DICE = 0.45;      // min dot to Dice through the rival
const AIM_EXIT = 0.3;       // min dot to Dice back toward the exit cell
const AIM_ESCAPE = 0.3;     // min facing·safe-direction dot for the escape dash
const AIM_PATIENCE = 0.6;   // seconds a held cast waits for the facing
const AIM_MAX_HOLDS = 2;    // expirations of the same slot before giving up once
const DICE_LAST_CALL = 0.8; // window seconds where Dice fires even misaligned
const ESCAPE_LAST_CALL = 0.4; // deadly-window seconds where a crooked dash beats dying
const COMBO_HESITATION = 0.22; // base hesitation between steps of one combo
const SLOT_INDEX = { q: 0, w: 1, e: 2, r: 3 };

export function createRenektonPilot({ random = Math.random } = {}) {
  const memory = createRenektonMemory();
  return {
    id: "renekton",
    memory,
    evaluateSkill(view) {
      return evaluateRenektonSkill(view, memory, random);
    },
    reset() {
      resetRenektonMemory(memory);
    }
  };
}

export function evaluateRenektonSkill(view, memory, random = Math.random) {
  memory.skillHesitation = Math.max(0, memory.skillHesitation - (view.dt ?? 0));
  if (memory.skillHesitation > 0) return null;
  if (!view.self?.alive || !view.rival?.alive) {
    resetCombo(memory);
    return null;
  }

  const { self, rival, grid, bombs, blasts, meta } = view;
  const { cols, rows, tile, roundAge } = meta;
  const cell = cellFromWorld(self.x, self.z, cols, rows, tile);
  const rivalCell = cellFromWorld(rival.x, rival.z, cols, rows, tile);
  const danger = dangerAt(cell.r, cell.c, grid, bombs, blasts);
  const distance = Math.hypot(self.x - rival.x, self.z - rival.z) / tile;
  const fury = self.fury ?? 0;
  const healthRatio = self.maxHealth ? self.health / self.maxHealth : 1;
  const rivalRatio = rival.maxHealth ? rival.health / rival.maxHealth : 1;
  const recastOpen = (self.renektonDashRecast ?? 0) > 0;
  const recastClosing = recastOpen && self.renektonDashRecast < DICE_LAST_CALL;
  const dominusUp = (self.renektonDominus ?? 0) > 0;

  // The WorldView is the source of truth about what actually happened: a
  // cast the game rejected must not advance the combo. Roll back the
  // memory effects of an unconfirmed ask before any branch reads them.
  reconcileLastSkill(memory, self);

  // A combo that cannot finish — the rival fled beyond the leash or the
  // window ran out — is forgotten before any branch reads it.
  if (memory.comboStep > 0 && (roundAge > memory.comboUntil || distance > COMBO_LEASH)) {
    resetCombo(memory);
  }

  // AIM_PATIENCE is a real deadline: a hold is never extended while it
  // runs, and each expiration of the SAME slot is counted (`holds`). After
  // AIM_MAX_HOLDS expirations the evaluation gives up on that cast once —
  // clears the hold and refuses the slot below, so the rest of the
  // pipeline still runs. Giving up drops the count together with the
  // hold, so the branch retries naturally on later ticks.
  let aimExhausted = null;
  if (memory.aimPending && roundAge > memory.aimPending.until) {
    if (memory.aimPending.holds >= AIM_MAX_HOLDS) {
      aimExhausted = memory.aimPending.slot;
      memory.aimPending = null;
    }
    // Below the limit the expired hold stays in place: holdForFacing turns
    // it into the next counted hold of the same slot.
  }

  // Hesitation between steps of the SAME combo is short: a 0.68s stun does
  // not wait a full second for the follow-up. Outside combos the deliberate
  // 0.9–1.3s pacing stands — a Dice that closes a sequence resets the combo
  // BEFORE asking, so an out-of-combo Dice keeps the deliberate pacing.
  const ask = (slot, reason, effects = null) => {
    memory.lastSkill = { slot, reason, at: roundAge, effects };
    memory.skillHesitation = memory.comboStep > 0
      ? COMBO_HESITATION + random() * 0.16
      : 0.9 + random() * 0.4;
    memory.aimPending = null;
    return { slot, reason };
  };

  // Holds a directional cast when the facing is not prepared. Returns
  // false when already aligned (cast now), true while holding (the caller
  // returns null), "exhausted" when the slot burned its AIM_MAX_HOLDS
  // expirations (skip the cast this tick, keep evaluating).
  const holdForFacing = (slot, minDot, tx, tz) => {
    if (facingAligned(self, tx, tz, minDot)) return false;
    if (aimExhausted === slot) return "exhausted";
    const pending = memory.aimPending;
    if (pending?.slot === slot && roundAge <= pending.until) return true;
    memory.aimPending = {
      slot,
      until: roundAge + AIM_PATIENCE,
      holds: pending?.slot === slot ? pending.holds + 1 : 1
    };
    return true;
  };

  // 1. Escape: standing in danger, dash out with Slice (or with Dice while
  //    the recast window is open). The dash travels along the facing and
  //    the facing belongs to the PREVIOUS frame, so it must point at a
  //    known-safe direction before the cast fires — see the header rule.
  if (danger > 0 && skillReady(self, "e")) {
    const timeline = dangerTimeline(view);
    const closing = safeWindowAfter(timeline, cell.r, cell.c, 0) < ESCAPE_LAST_CALL;
    const aligned = escapeFacingAligned(view, cell, timeline);
    if (closing || aligned !== false) {
      const effects = snapshotCombo(memory);
      resetCombo(memory);
      memory.pendingDice = true;
      return ask("e", "escape-danger", effects);
    }
    return null; // hold: the temporal escape owns this frame's movement
  }

  // 2. Survive: low health with the rival close — Dominus swings the fight.
  //    Defensive casts stay legal in danger; only offensive W/Q are gated.
  if (
    healthRatio < 0.4 && distance <= ENGAGE_REACH
    && skillReady(self, "r") && !dominusUp
  ) {
    return ask("r", "survive-low-health");
  }

  // 3. Combo continuation: the engage committed, now play the sequence.
  //    Runs BEFORE the Dice spending below — a connected Slice opened the
  //    recast window, and E→R→W→Q→Dice deals more than E→Dice.
  if (memory.comboStep > 0 && danger === 0) {
    // Dominus opens a committed engage — heal, instant Fury (feeds the
    // empowered W) and the aura — never twice on the same combo.
    if (!memory.comboUlted && !dominusUp && skillReady(self, "r") && distance <= COMBO_W_REACH) {
      const effects = snapshotCombo(memory);
      memory.comboUlted = true;
      return ask("r", "dominus-engage", effects);
    }
    // Step 1 → 2: Ruthless Predator locks the rival inside W reach. A
    // closing recast window does not wait for the facing — the Dice below
    // takes the frame instead.
    if (memory.comboStep === 1 && distance <= COMBO_W_REACH && skillReady(self, "w")) {
      const held = holdForFacing("w", AIM_W, rival.x, rival.z);
      if (held === true && !recastClosing) return null;
      if (held === false) {
        const effects = snapshotCombo(memory);
        memory.comboStep = 2;
        return ask("w", "combo-stun", effects);
      }
      // held with the window closing, or exhausted: fall through.
    }
    // Steps 1–2 → 3: Cull the Meek lands inside the stun (or replaces a W
    // still on cooldown). Without an open recast window the Q concludes
    // the combo right away — no Dice is coming, so no combo state may
    // linger until the timeout.
    if (memory.comboStep >= 1 && memory.comboStep < 3 && distance <= MELEE_REACH && skillReady(self, "q")) {
      const effects = snapshotCombo(memory);
      if (recastOpen) memory.comboStep = 3;
      else resetCombo(memory);
      return ask("q", "combo-cull", effects);
    }
  }

  // 4. Dice: the recast window is open — spend it with purpose, never let
  //    it rot. The window yields to the combo follow-ups above and takes
  //    the frame only as the finisher (the kill closes), as the exit when
  //    the combo is done or offers no follow-up, or as a last resort with
  //    the window closing. The escape branch above already owns danger
  //    frames, so this only ever fires from a safe cell.
  if (recastOpen && skillReady(self, "e")) {
    const killCloses = fury >= EMPOWER_FURY && rivalRatio <= FINISH_HEALTH && distance <= DICE_REACH;
    const comboDone = memory.comboStep === 0 || memory.comboStep >= 3;
    const followUpReady = memory.comboStep > 0 && (
      (memory.comboStep === 1 && distance <= COMBO_W_REACH && skillReady(self, "w"))
      || (memory.comboStep < 3 && distance <= MELEE_REACH && skillReady(self, "q")));
    const inCombat = memory.comboStep > 0 && distance <= DICE_REACH;
    if (killCloses || (inCombat && (comboDone || !followUpReady || recastClosing))) {
      // Cross the rival: damage plus position. A closing window fires even
      // misaligned — a spent Dice beats an expired one.
      const held = recastClosing ? false : holdForFacing("e", AIM_DICE, rival.x, rival.z);
      if (held === true) return null; // walking one frame prepares the facing
      if (held !== "exhausted") {
        const effects = snapshotCombo(memory);
        resetCombo(memory);
        return ask("e", killCloses ? "dice-finish" : "dice-through", effects);
      }
      // exhausted: try the exit dash below.
    }
    // The engage ended with the window open: dash back to the planned exit
    // when the facing allows, otherwise let the window expire.
    if (memory.exitCell) {
      const [exitX, exitZ] = worldFromCell(memory.exitCell.r, memory.exitCell.c, cols, rows, tile);
      if (facingAligned(self, exitX, exitZ, AIM_EXIT)) {
        const effects = snapshotCombo(memory);
        resetCombo(memory);
        return ask("e", "dice-exit", effects);
      }
    }
  }

  // 5. Melee: rival adjacent — empowered W stun beats Q harvest beats plain
  //    W. Offensive casts are gated to safe cells: in danger the escape and
  //    the defensive Dominus own the frame (a W teleports the bot and would
  //    strand the temporal escape route computed from the old position).
  if (danger === 0 && distance <= MELEE_REACH) {
    if (fury >= EMPOWER_FURY && skillReady(self, "w")) return ask("w", "empowered-stun");
    if (skillReady(self, "q")) return ask("q", "harvest-adjacent-rival");
    if (skillReady(self, "w")) return ask("w", "stun-adjacent-rival");
  }

  // 6. Engage: aligned with the rival, safe cell — Slice closes the gap and
  //    opens the combo. The temporal escape runs after this evaluation and
  //    would override the movement on danger frames, so an engage only ever
  //    starts from a safe cell (never a dash the escape is about to abort).
  const aligned = cell.r === rivalCell.r || cell.c === rivalCell.c;
  if (
    !recastOpen && memory.comboStep === 0 && aligned && danger === 0
    && distance <= ENGAGE_REACH && skillReady(self, "e")
  ) {
    const held = holdForFacing("e", AIM_ENGAGE, rival.x, rival.z);
    if (held !== false) return null; // held: walk a frame; exhausted: skip
    const effects = snapshotCombo(memory);
    memory.comboStep = 1;
    memory.comboUntil = roundAge + COMBO_TIMEOUT;
    memory.comboUlted = false;
    memory.pendingDice = true;
    memory.exitCell = { r: cell.r, c: cell.c };
    return ask("e", "close-distance", effects);
  }

  return null;
}

function resetCombo(memory) {
  memory.comboStep = 0;
  memory.comboUntil = 0;
  memory.comboUlted = false;
  memory.pendingDice = false;
  memory.exitCell = null;
  memory.aimPending = null; // a held aim belongs to the discarded combo
}

// The combo state an ask is about to move, kept in `lastSkill.effects` so
// reconcileLastSkill can roll the move back when the cast never happened.
function snapshotCombo(memory) {
  return {
    comboStep: memory.comboStep,
    comboUntil: memory.comboUntil,
    comboUlted: memory.comboUlted,
    pendingDice: memory.pendingDice,
    exitCell: memory.exitCell
  };
}

/**
 * Cast reconciliation: the combo memory advances when an intent is ASKED,
 * but game/ may reject the cast (stun, a closed buffer, short Fury).
 * Before the next decision, prove from the WorldView that the last ask
 * really happened; an unconfirmed ask has its combo effects rolled back,
 * so the sequence replays the skipped step instead of advancing past it.
 *
 * Known blind spot, documented: a rejected DICE inside an open recast
 * window is indistinguishable from a fired one (the E cooldown already ran
 * from the Slice and the window decays every frame), so the exit reset
 * stands in that case.
 */
function reconcileLastSkill(memory, self) {
  const last = memory.lastSkill;
  if (!last) return;
  memory.lastSkill = null; // every ask is reconciled exactly once
  if (castConfirmed(self, last.slot)) return;
  if (!last.effects) return;
  memory.comboStep = last.effects.comboStep;
  memory.comboUntil = last.effects.comboUntil;
  memory.comboUlted = last.effects.comboUlted;
  memory.pendingDice = last.effects.pendingDice;
  memory.exitCell = last.effects.exitCell;
}

// WorldView evidence that the asked cast really happened: the matching
// cooldown started, Dominus is running, or the E cooldown/recast moved.
function castConfirmed(self, slot) {
  if (slot === "r") return (self.renektonDominus ?? 0) > 0 || (self.rCooldown ?? 0) > 0;
  if (slot === "e") return (self.renektonDashRecast ?? 0) > 0 || (self.eCooldown ?? 0) > 0;
  return (self[`${slot}Cooldown`] ?? 0) > 0;
}

/**
 * Escape-dash alignment: true when the facing points at a KNOWN safe
 * direction — any walkable neighbor cell the binary danger map calls safe
 * right now, or the first hop of the temporal escape route (the plan
 * already proved that hop survivable). False when safe directions exist
 * but the facing matches none of them (hold the cast: the temporal escape
 * walks one frame and the dash fires next tick). "none" when there is no
 * known safe direction at all — then the old blind dash stands, because
 * standing still in danger is worse.
 */
function escapeFacingAligned(view, cell, timeline) {
  const { cols, rows, tile } = view.meta;
  const { self } = view;
  let found = false;
  for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const r = cell.r + dr;
    const c = cell.c + dc;
    if (view.grid[r]?.[c] !== 0) continue;
    if (dangerAt(r, c, view.grid, view.bombs, view.blasts) !== 0) continue;
    if (view.bombs.some((bomb) => !bomb.exploded && bomb.r === r && bomb.c === c
      && !bomb.passOwners?.includes(self.id))) continue;
    found = true;
    const [x, z] = worldFromCell(r, c, cols, rows, tile);
    if (facingAligned(self, x, z, AIM_ESCAPE)) return true;
  }
  const hop = escapePlan(view, timeline)?.route?.[1];
  if (hop) {
    found = true;
    const [x, z] = worldFromCell(hop.r, hop.c, cols, rows, tile);
    if (facingAligned(self, x, z, AIM_ESCAPE)) return true;
  }
  return found ? false : "none";
}

/**
 * Directional skills travel along `lastDx/lastDz`; this measures whether
 * the recent movement points at the target. Unknown facing (partial views,
 * tests) never blocks — the game falls back to the facing angle. A bot
 * standing perfectly still has no usable facing and must walk a frame.
 */
function facingAligned(self, targetX, targetZ, minDot) {
  const { lastDx, lastDz } = self;
  if (typeof lastDx !== "number" || typeof lastDz !== "number") return true;
  const toX = targetX - self.x;
  const toZ = targetZ - self.z;
  const targetLength = Math.hypot(toX, toZ);
  if (targetLength < 1e-6) return true; // already on top of the target
  const facingLength = Math.hypot(lastDx, lastDz);
  if (facingLength < 1e-6) return false; // standing still: walk a frame first
  return (toX / targetLength) * (lastDx / facingLength)
    + (toZ / targetLength) * (lastDz / facingLength) >= minDot;
}

function skillReady(self, slot) {
  const index = SLOT_INDEX[slot];
  if (Array.isArray(self.skillsUnlocked) && self.skillsUnlocked[index] === false) return false;
  if (self.skills?.[slot]?.unlocked === false) return false; // legacy/test shape
  // E recast ("Dice") ignores cooldown while the window is open.
  if (slot === "e" && (self.renektonDashRecast ?? 0) > 0) return true;
  const flat = self[`${slot}Cooldown`] ?? self[`cooldown_${slot}`];
  if (typeof flat === "number") return flat <= 0;
  const cooldowns = self.cooldowns ?? self.abilityCooldowns;
  if (cooldowns && typeof cooldowns === "object") return (cooldowns[slot] ?? Infinity) <= 0;
  return false; // unknown cooldown state — never emit blind
}
