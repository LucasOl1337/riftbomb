/**
 * Bot V1 — the first pilot with its own personality.
 *
 * V1 = baseline arena brain (movement + bombs) + V1 memory (objective,
 * decisions) + a pluggable champion pilot (skill intents). Every
 * champion the V1 controls is a module under `v1/<champion>/`; the
 * shared patterns above stay identical no matter who is piloted.
 *
 * Intents still flow through the same entrypoints as human input —
 * game/ validates and applies; the bot never writes Match state.
 *
 * Personality (cycle 11, B8): the optional `personality` option carries
 * temperament weights — today only `aggression` (0..1, default
 * AGGRESSION_DEFAULT = 0.5, the exact pre-personality behavior). The
 * arena side reads it in the navigation target priority; the champion
 * pilot receives its OWN copy from the caller (the factories stay
 * independent). The temporal escape never reads personality.
 */

import { createBaselinePolicy } from "../baseline-policy.mjs";
import { createV1Memory, resetV1Memory } from "./v1-memory.mjs";
import { observeRival } from "./read-rival.mjs";
import { aggressionOf } from "./personality.mjs";
import { beginEscapeFromPlant, escapeTemporalDanger, navigateObjective, planArenaActions, unstickMovement, unwedgeMovement, vetoBombWithoutEscape } from "./plan-arena-actions.mjs";

export function createV1Policy({ champion = null, profile = "rift", random = Math.random, personality = null } = {}) {
  const arena = createBaselinePolicy({ profile, random });
  const memory = createV1Memory();
  const temperament = { aggression: aggressionOf(personality) };

  return {
    profile,
    champion: champion?.id ?? null,
    personality: temperament,
    memory,
    think(view, dt) {
      const intent = arena.think(view, dt);
      // buildWorldView returns null when the bot cannot think (dead, locked
      // round); the arena brain already answered with a neutral intent.
      if (!view) return intent;
      // Rival observation runs once per think, before any planner reads
      // the model, so interception and cut-escape plants use fresh habits.
      observeRival(view, memory.rivalModel);
      const skill = champion?.evaluateSkill?.(view);
      if (skill) intent.skill = skill.slot;
      planArenaActions(view, intent, memory);
      // Route following runs before the unstick recovery: a physical stall
      // the grid cannot see (clipped corner, closing wall) still wins the
      // frame over the planned route. The temporal escape runs after the
      // route following (which clears the route memory on escape frames)
      // so its refuge plan is what the memory keeps.
      navigateObjective(view, intent, memory, arena.memory, temperament);
      // The veto runs after every planner so a plant from the baseline OR
      // the route opener is dropped when the temporal escape cannot prove
      // a refuge. A surviving plant starts its leave on this frame: the
      // bomb is not in the view yet, so escapeTemporalDanger cannot see it.
      vetoBombWithoutEscape(view, intent, memory);
      beginEscapeFromPlant(view, intent, memory, arena.memory);
      escapeTemporalDanger(view, intent, memory, arena.memory);
      unstickMovement(view, intent, memory, arena.memory);
      // Wedge recovery (cycle 15) runs last and only with a champion
      // module: it fires the champion's mobility skill to unfreeze the
      // collision box; the kitless arena brain (self-play P1) has nothing
      // to recover with and keeps the baseline behavior.
      if (champion) unwedgeMovement(view, intent, memory, arena.memory);
      return intent;
    },
    reset(roundInfo = {}) {
      arena.reset(roundInfo);
      resetV1Memory(memory);
      champion?.reset?.();
    }
  };
}
