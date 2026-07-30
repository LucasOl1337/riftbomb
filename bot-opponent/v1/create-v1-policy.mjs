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
 */

import { createBaselinePolicy } from "../baseline-policy.mjs";
import { createV1Memory, resetV1Memory } from "./v1-memory.mjs";
import { escapeTemporalDanger, navigateObjective, planArenaActions, unstickMovement, vetoBombWithoutEscape } from "./plan-arena-actions.mjs";

export function createV1Policy({ champion = null, profile = "rift", random = Math.random } = {}) {
  const arena = createBaselinePolicy({ profile, random });
  const memory = createV1Memory();

  return {
    profile,
    champion: champion?.id ?? null,
    memory,
    think(view, dt) {
      const intent = arena.think(view, dt);
      // buildWorldView returns null when the bot cannot think (dead, locked
      // round); the arena brain already answered with a neutral intent.
      if (!view) return intent;
      const skill = champion?.evaluateSkill?.(view);
      if (skill) intent.skill = skill.slot;
      planArenaActions(view, intent, memory);
      // Route following runs before the unstick recovery: a physical stall
      // the grid cannot see (clipped corner, closing wall) still wins the
      // frame over the planned route. The temporal escape runs after the
      // route following (which clears the route memory on escape frames)
      // so its refuge plan is what the memory keeps.
      navigateObjective(view, intent, memory, arena.memory);
      // The veto runs after every planner so a plant from the baseline OR
      // the route opener is dropped when the temporal escape cannot prove
      // a refuge; the escape step then owns the frame as usual.
      vetoBombWithoutEscape(view, intent, memory);
      escapeTemporalDanger(view, intent, memory, arena.memory);
      unstickMovement(view, intent, memory, arena.memory);
      return intent;
    },
    reset(roundInfo = {}) {
      arena.reset(roundInfo);
      resetV1Memory(memory);
      champion?.reset?.();
    }
  };
}
