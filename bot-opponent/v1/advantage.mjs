/**
 * V1 advantage perception (cycle 12) — HOW favorable an engage is right
 * now, measured from the WorldView instead of guessed from temperament.
 *
 * Cycle 11 measured blind aggression losing the mirror (0.8 -> 2V x 8D):
 * engaging without a criterion sacrifices the economy that wins. This
 * module is the criterion: a 0..1 score composed of documented signals,
 * and a temperament threshold — the higher the aggression, the LOWER the
 * advantage the engage demands (aggressive engages on a lean, neutral
 * demands a clear edge, passive almost never engages).
 *
 * Signals (ADV_BASE 0.5 = a perfectly even fight):
 *   - Health ratio gap (+-0.25): self health ratio minus the rival's. The
 *     strongest single signal — a trade the V1 starts ahead on health it
 *     usually ends ahead.
 *   - Fury (+0.10, linear to ADV_FURY_EMPOWER): at 50+ the empowered cast
 *     is available, so the engage combo hits harder.
 *   - Kit gap (+-0.05 per unlocked skill, clamped to +-2): self unlocked
 *     skills minus the rival's (the WorldView copies the rival contestant,
 *     so his `skillsUnlocked` is visible). Unknown kit state counts 0 —
 *     never guessed.
 *   - Cornered rival (+0.10): fraction of the rival's four neighbor cells
 *     that are NOT safe for him (blocked or dangerous right now). A rival
 *     with nowhere to step loses the post-engage footwork.
 *   - Rival under a bomb clock (+0.15): the temporal timeline proves the
 *     rival's cell turns deadly within ADV_THREAT_WINDOW seconds; the
 *     closer the window, the bigger the bonus (full weight when the cell
 *     is already deadly — he must move through us or burn).
 *   - Dominus running (+0.10): the self ultimate is active — healing,
 *     instant Fury and the aura swing the trade.
 *
 * The optional `memory` aims the spatial signals (cornered, bomb clock)
 * at the PREDICTED rival cell when it carries a `rivalModel` — the same
 * interception target the navigation routes to. Without a model (the
 * champion pilot has none) the current cell is judged.
 *
 * Safety invariant: like the personality module, nothing here is read by
 * the temporal escape — this score only gates AGGRESSION (the E engage
 * trigger and the rival-vs-pickup navigation priority).
 *
 * Pure functions over the WorldView; the bot still only emits intents.
 */

import { cellFromWorld, dangerAt } from "../baseline-policy.mjs";
import { dangerTimeline, safeWindowAfter } from "./danger-timeline.mjs";
import { AGGRESSION_DEFAULT } from "./personality.mjs";
import { predictRivalCell } from "./read-rival.mjs";

// Named ADV_* because the V1 bundle inlines this module in the same scope
// as baseline-policy.mjs and the other V1 modules.
export const ADV_BASE = 0.5;           // score of a perfectly even fight
export const ADV_HEALTH_WEIGHT = 0.25; // per full health-ratio gap
export const ADV_FURY_WEIGHT = 0.10;   // at ADV_FURY_EMPOWER or more
export const ADV_FURY_EMPOWER = 50;    // Fury for empowered casts (game rule)
export const ADV_KIT_WEIGHT = 0.05;    // per unlocked-skill difference
export const ADV_KIT_MAX_DIFF = 2;     // skills the gap saturates at
export const ADV_CORNER_WEIGHT = 0.10; // rival with zero safe neighbors
export const ADV_THREAT_WEIGHT = 0.15; // rival cell already deadly
export const ADV_THREAT_WINDOW = 2.35; // seconds; mirrors the bomb fuse
export const ADV_DOMINUS_WEIGHT = 0.10; // self Dominus active

// Temperament thresholds: ADV_THRESHOLD_BASE at the neutral aggression,
// +- ADV_THRESHOLD_SLOPE per point of distance from neutral. 0 -> 0.80
// (almost never engages), 0.5 -> 0.55 (a clear edge: a health lead, full
// fury, a cornered or bomb-clocked rival), 1 -> 0.30 (a lean). Measured
// in the cycle-12 mirror (10 matches, seed 42): a steeper gate
// (base 0.60/slope 0.20, thresholds above the even-fight 0.5 at every
// temperament) made the mirror WORSE (0.5: 4V x 6D; 0.8: 1V x 9D) — the
// engages it blocked were not the losses; this calibration ties the best
// measured mirror (5V x 5D at neutral) while still gating disadvantage
// engages, and it is the one shipped.
export const ADV_THRESHOLD_BASE = 0.55;
export const ADV_THRESHOLD_SLOPE = 0.5;

/**
 * The advantage an engage demands at this aggression: linear from 0.80
 * (fully passive) through 0.55 (neutral) down to 0.30 (fully aggressive).
 */
export function advantageThreshold(aggression) {
  const a = typeof aggression === "number" && Number.isFinite(aggression)
    ? Math.min(1, Math.max(0, aggression))
    : AGGRESSION_DEFAULT;
  return ADV_THRESHOLD_BASE + (AGGRESSION_DEFAULT - a) * ADV_THRESHOLD_SLOPE;
}

/**
 * The engage gate shared by the Renekton pilot (E trigger) and the arena
 * navigation (rival-vs-pickup priority). WITHOUT a personality it is
 * always open: the pre-cycle-12 behavior stands bit-identical.
 */
export function advantageEngageAllowed(view, memory, personality) {
  if (personality === null || personality === undefined) return true;
  return advantageScore(view, memory) >= advantageThreshold(personality.aggression);
}

/**
 * Composed advantage in [0, 1]: ADV_BASE plus the documented signals,
 * clamped. Pure over the WorldView (plus the optional rival model).
 */
export function advantageScore(view, memory = null) {
  const { self, rival, grid, bombs, blasts, meta } = view;
  if (!self?.alive || !rival?.alive) return ADV_BASE;
  const { cols, rows, tile } = meta;

  const selfRatio = self.maxHealth ? self.health / self.maxHealth : 1;
  const rivalRatio = rival.maxHealth ? rival.health / rival.maxHealth : 1;
  let score = ADV_BASE + ADV_HEALTH_WEIGHT * clamp(selfRatio - rivalRatio, -1, 1);

  score += ADV_FURY_WEIGHT * Math.min(1, (self.fury ?? 0) / ADV_FURY_EMPOWER);

  const kitGap = unlockedDiff(self, rival);
  score += ADV_KIT_WEIGHT * clamp(kitGap, -ADV_KIT_MAX_DIFF, ADV_KIT_MAX_DIFF);

  // Spatial signals judge where the rival will be when a model knows his
  // habits (the cell the navigation intercepts), his current cell else.
  const rivalCell = memory?.rivalModel
    ? predictRivalCell(memory.rivalModel, view)
    : cellFromWorld(rival.x, rival.z, cols, rows, tile);

  score += ADV_CORNER_WEIGHT * (1 - safeNeighborCount(view, rivalCell) / 4);

  const window = safeWindowAfter(dangerTimeline(view), rivalCell.r, rivalCell.c, 0);
  if (Number.isFinite(window)) {
    score += ADV_THREAT_WEIGHT * clamp(1 - window / ADV_THREAT_WINDOW, 0, 1);
  }

  if ((self.renektonDominus ?? 0) > 0) score += ADV_DOMINUS_WEIGHT;

  return clamp(score, 0, 1);
}

// Unlocked-skill gap; unknown kit state on EITHER side counts neutral (0)
// — never guessed, never read as a weak rival.
function unlockedDiff(self, rival) {
  if (!Array.isArray(self.skillsUnlocked) || !Array.isArray(rival.skillsUnlocked)) return 0;
  const count = (contestant) => contestant.skillsUnlocked.filter(Boolean).length;
  return count(self) - count(rival);
}

// Neighbor cells the RIVAL could safely stand on right now: walkable for
// him (his own bomb passOwners honored) and outside the binary danger map.
function safeNeighborCount(view, cell) {
  let count = 0;
  for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const r = cell.r + dr;
    const c = cell.c + dc;
    if (view.grid[r]?.[c] !== 0) continue;
    if (view.bombs.some((bomb) => !bomb.exploded && bomb.r === r && bomb.c === c
      && !bomb.passOwners?.includes(view.rival.id))) continue;
    if (dangerAt(r, c, view.grid, view.bombs, view.blasts) !== 0) continue;
    count += 1;
  }
  return count;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
