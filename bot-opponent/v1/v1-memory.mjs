/**
 * V1 pilot memory — what the V1 bot remembers between frames.
 *
 * Arena think/commit timers still live inside the wrapped arena planner
 * (baseline-policy memory); they move here when plan-arena-actions
 * replaces the baseline as the V1 arena brain.
 *
 * Fury, cooldowns, health and recast windows are NOT memory: they belong
 * to the Match and arrive through the WorldView.
 */

import { createRivalModel } from "./read-rival.mjs";

export function createV1Memory() {
  return {
    objective: "press",     // "escape" | "pickup" | "press"
    route: [],              // planned cells [{ r, c }]
    targetCell: null,       // current cell goal { r, c } | null
    lastBombReason: null,   // why the last bomb was planted
    lastDecision: null,     // summary of the last decided intent
    stallTime: 0,           // seconds wanting to move without progress
    lastPosition: null,     // last observed self position { x, z }
    unstickHold: 0,         // seconds the unstick heading still owns the intent
    freezeTime: 0,          // seconds wanting to move with zero progress (wedge watch)
    unwedgeLastPosition: null, // last position sampled by the wedge recovery
    // Cross-round rival habits (B7). resetV1Memory deliberately does NOT
    // clear this field: the model is the memory ABOUT the opponent and
    // must survive the rounds of the same match; it is reborn only with
    // the policy (a new match).
    rivalModel: createRivalModel()
  };
}

export function resetV1Memory(memory) {
  memory.objective = "press";
  memory.route = [];
  memory.targetCell = null;
  memory.lastBombReason = null;
  memory.lastDecision = null;
  memory.stallTime = 0;
  memory.lastPosition = null;
  memory.unstickHold = 0;
  memory.freezeTime = 0;
  memory.unwedgeLastPosition = null;
}
