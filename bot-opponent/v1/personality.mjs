/**
 * V1 personality — tunable temperament weights (cycle 11, B8).
 *
 * One axis for now: `aggression` in [0, 1]. AGGRESSION_DEFAULT (0.5) is
 * the documented neutral temperament: the consumers in THIS module (the
 * pickup slack) degenerate to the exact pre-personality behavior at the
 * neutral point, and a policy created without `personality` stays
 * bit-identical to the pre-B8 V1. Since cycle 12 the engage/navigation
 * also reads the measured advantage (advantage.mjs) whenever a
 * personality is PRESENT — an explicit neutral temperament now demands a
 * clear edge to engage, by design.
 * Above neutral the rival matters more — the hunt outranks distant
 * pickups in the navigation and the Renekton engage reach stretches.
 * Below neutral only the engage reach shrinks: the navigation already
 * ranks the rival dead last, so there is nothing left to subtract.
 *
 * Safety invariant: the temporal escape (escapeTemporalDanger,
 * vetoBombWithoutEscape, hasTemporalBombEscape) NEVER reads personality.
 */

export const AGGRESSION_DEFAULT = 0.5;

// Tiles of path-distance slack the predicted rival cell gains over a
// pickup at full aggression: at 1.0 the hunt outranks any pickup up to
// AGGRESSION_PICKUP_SLACK tiles closer.
export const AGGRESSION_PICKUP_SLACK = 8;

/** Clamped aggression weight; the neutral default when unset/invalid. */
export function aggressionOf(personality = null) {
  const raw = personality?.aggression;
  return typeof raw === "number" && Number.isFinite(raw)
    ? Math.min(1, Math.max(0, raw))
    : AGGRESSION_DEFAULT;
}

/**
 * Path-distance slack the rival target gains over pickups. Zero at or
 * below neutral, so the gate that reads it stays closed and the old
 * pickup-first priority is preserved exactly.
 */
export function aggressionPickupSlack(aggression) {
  return Math.max(0, aggression - AGGRESSION_DEFAULT) * 2 * AGGRESSION_PICKUP_SLACK;
}
