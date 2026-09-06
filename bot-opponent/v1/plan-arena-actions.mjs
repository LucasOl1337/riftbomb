/**
 * V1 arena planning — classifies the current objective and records
 * decisions in the V1 memory.
 *
 * V1.0 keeps the baseline policy as the arena brain (movement + bombs);
 * this module is the seam where V1 planning grows without touching the
 * baseline port.
 */

import { cellFromWorld, dangerAt, isBlocked, worldFromCell } from "../baseline-policy.mjs";
import { bfsField, nextStepToward, pathFromField } from "./navigate-arena.mjs";
import { dangerTimeline, escapePlan } from "./danger-timeline.mjs";
import { canPlantRouteBomb, findRouteCrate, hasTemporalBombEscape, hypotheticalBomb } from "./open-route.mjs";
import { bombCutsRivalEscape, predictRivalCell } from "./read-rival.mjs";
import { aggressionOf, aggressionPickupSlack } from "./personality.mjs";
import { advantageEngageAllowed } from "./advantage.mjs";

export function planArenaActions(view, intent, memory) {
  const { cols, rows, tile } = view.meta;
  const cell = cellFromWorld(view.self.x, view.self.z, cols, rows, tile);
  const danger = dangerAt(cell.r, cell.c, view.grid, view.bombs, view.blasts);

  if (danger > 0) {
    memory.objective = "escape";
  } else if (nearestPickupDistance(view, cell) <= 3) {
    memory.objective = "pickup";
  } else {
    memory.objective = "press";
  }

  if (intent.plantBomb) {
    memory.lastBombReason = memory.objective === "press" ? "pressure-rival" : "clear-crates";
  }

  // Cut-escape pressure plant (B7): when the rival model proves that a
  // bomb on the self cell covers BOTH the rival and his favorite escape
  // destination, plant on purpose instead of waiting for the baseline's
  // random aligned plants. The temporal escape proof keeps the V1's own
  // survival ahead of the trap, and vetoBombWithoutEscape re-proves the
  // plant downstream like any other.
  if (!intent.plantBomb && memory.objective === "press"
    && bombCutsRivalEscape(view, memory.rivalModel, cell)
    && canPlantRouteBomb(view, cell)
    && hasTemporalBombEscape(view, cell)) {
    intent.plantBomb = true;
    memory.lastBombReason = "cut-escape";
  }

  memory.lastDecision = {
    dx: intent.dx,
    dz: intent.dz,
    plantBomb: intent.plantBomb,
    skill: intent.skill ?? null,
    objective: memory.objective
  };

  return intent;
}

function nearestPickupDistance(view, cell) {
  return view.pickups.reduce(
    (best, pickup) => Math.min(best, Math.abs(pickup.r - cell.r) + Math.abs(pickup.c - cell.c)),
    Infinity
  );
}

// --- Route following -------------------------------------------------------
//
// Outside escape situations the V1 navigates by BFS instead of the greedy
// baseline scoring: own skill orbs first (they unlock the kit), then the
// nearest reachable pickup by path distance, then the rival's cell. The
// chosen heading is written back into the arena memory exactly like the
// unstick recovery does, so the baseline cannot undo it between think
// ticks. ROUTE_COMMIT stays far below UNSTICK_COMMIT: it only needs to hold
// the heading until the next frame (this planner overrides the intent every
// frame anyway), and a short commit expires before the baseline's next full
// think tick — keeping the baseline's bomb planting alive.

const ROUTE_COMMIT = 0.05; // seconds the routed heading holds in arena memory

export function navigateObjective(view, intent, memory, arenaMemory, personality = null) {
  memory.route = [];
  memory.targetCell = null;
  if (memory.objective === "escape") return intent;
  if (!view.self?.alive || !view.rival?.alive) return intent;

  const { cols, rows, tile } = view.meta;
  const from = cellFromWorld(view.self.x, view.self.z, cols, rows, tile);
  const field = bfsField(view.grid, view.bombs, from, view.self.id);
  const target = chooseRouteTarget(view, field, memory.rivalModel, personality);
  if (!target) return openRouteObjective(view, intent, memory, arenaMemory, from, field, personality);

  const step = nextStepToward(view, target);
  if (!step) return intent; // no safe step: the baseline decision stands

  memory.targetCell = { r: target.r, c: target.c };
  memory.route = pathFromField(field, from, target) ?? [];
  return commitRouteStep(intent, memory, arenaMemory, step);
}

// Applies a routed heading to the intent and pins it in the arena memory so
// the baseline cannot undo it between think ticks. While a physical-stall
// recovery owns the heading (unstickHold), every planner stands down:
// re-committing here would wipe the unstick heading one frame after it
// fired and trap the bot against the same corner again.
function commitRouteStep(intent, memory, arenaMemory, step) {
  if ((memory.unstickHold ?? 0) > 0) return intent;
  intent.dx = step.dx;
  intent.dz = step.dz;
  if (arenaMemory) {
    arenaMemory.lastDx = step.dx;
    arenaMemory.lastDz = step.dz;
    arenaMemory.commit = ROUTE_COMMIT;
  }
  if (memory.lastDecision) {
    memory.lastDecision.dx = step.dx;
    memory.lastDecision.dz = step.dz;
  }
  return intent;
}

function chooseRouteTarget(view, field, rivalModel = null, personality = null) {
  const reachable = (cell) => Number.isFinite(field.dist[cell.r]?.[cell.c]);
  const nearest = (cells) => cells
    .filter(reachable)
    .sort((a, b) => field.dist[a.r][a.c] - field.dist[b.r][b.c])[0] ?? null;

  // Skill orbs only unlock for the owner who broke the crate; rival orbs are
  // dead weight for the V1 and are ignored entirely. The rival fallback aims
  // at the PREDICTED cell (B7): interception, not pursuit — with no model
  // data the prediction is the current cell, the old behavior.
  const ownOrbs = view.pickups.filter(
    (pickup) => pickup.type === "skill" && pickup.ownerId === view.self.id);
  const otherPickups = view.pickups.filter(
    (pickup) => !(pickup.type === "skill" && pickup.ownerId != null));

  const orb = nearest(ownOrbs);
  if (orb) return orb;
  const pickup = nearest(otherPickups);
  const rival = nearest([predictRivalCell(rivalModel, view)]);

  // Aggression (B8): above the neutral temperament the hunt outranks a
  // pickup within the slack — the finisher walks toward the predicted
  // rival cell instead of a distant errand. At or below neutral the slack
  // is zero, the gate stays closed and the pickup keeps the old priority
  // exactly (bit-identical to the pre-personality behavior). Cycle 12:
  // even with slack the hunt only outranks the pickup when the measured
  // advantage clears the temperament threshold — chasing at a
  // disadvantage is what made blind aggression lose the mirror.
  const slack = aggressionPickupSlack(aggressionOf(personality));
  if (slack > 0 && pickup && rival
    && field.dist[rival.r][rival.c] <= field.dist[pickup.r][pickup.c] + slack
    && advantageEngageAllowed(view, { rivalModel }, personality)) {
    return rival;
  }
  return pickup ?? rival;
}

// --- Route opening through crates ------------------------------------------
//
// When every target sits behind crates the walkable BFS finds nothing and
// the round stalls into a timeout draw. Instead of waiting for the baseline
// to break crates by accident, the V1 picks the route crate (double BFS in
// open-route.mjs), walks to its stand cell and plants ON PURPOSE — but only
// with a proven TEMPORAL escape (hasTemporalBombEscape: the time-expanded
// plan must still reach a refuge). Without an escape it steps back and
// waits: planting into a sealed pocket is how the baseline kills itself.
// Target priority mirrors chooseRouteTarget: own skill orbs first, then
// pickups, then the rival cell.

function openRouteObjective(view, intent, memory, arenaMemory, from, field, personality = null) {
  const target = chooseBlockedTarget(view, from, memory.rivalModel, personality);
  if (!target) return intent;
  const routeCrate = findRouteCrate(view, from, target);
  if (!routeCrate) return intent; // sealed by solids: the baseline decision stands
  const { crateCell, standCell } = routeCrate;

  memory.targetCell = { r: crateCell.r, c: crateCell.c };
  memory.route = pathFromField(field, from, standCell) ?? [];

  const atCrate = (from.r === standCell.r && from.c === standCell.c)
    || Math.abs(from.r - crateCell.r) + Math.abs(from.c - crateCell.c) === 1;
  if (!atCrate) {
    const step = nextStepToward(view, standCell);
    if (!step) return intent; // no safe step: the baseline decision stands
    return commitRouteStep(intent, memory, arenaMemory, step);
  }

  if (canPlantRouteBomb(view, from) && hasTemporalBombEscape(view, from)) {
    intent.plantBomb = true;
    memory.lastBombReason = "open-route";
    if (memory.lastDecision) memory.lastDecision.plantBomb = true;
    // Plant and start the first escape hop on the same frame — holding
    // still here is how the spawn-pocket dummy died on its own fuse.
    return beginEscapeFromPlant(view, intent, memory, arenaMemory);
  }

  // No proven escape (bomb limit reached, rival fire closing in, or the
  // pocket too small): step back from the crate and wait for the opening.
  return stepBackFromCrate(view, intent, memory, arenaMemory, from, crateCell);
}

// Same priority as chooseRouteTarget but over unreachable targets, ranked
// by manhattan distance — the route crate search measures the real cost.
function chooseBlockedTarget(view, from, rivalModel = null, personality = null) {
  const manhattan = (cell) => Math.abs(cell.r - from.r) + Math.abs(cell.c - from.c);
  const nearest = (cells) => cells
    .slice()
    .sort((a, b) => manhattan(a) - manhattan(b))[0] ?? null;

  const ownOrbs = view.pickups.filter(
    (pickup) => pickup.type === "skill" && pickup.ownerId === view.self.id);
  const otherPickups = view.pickups.filter(
    (pickup) => !(pickup.type === "skill" && pickup.ownerId != null));

  const orb = nearest(ownOrbs);
  if (orb) return orb;
  const pickup = nearest(otherPickups);
  const rival = nearest([predictRivalCell(rivalModel, view)]);

  // Same aggression gate as chooseRouteTarget, over manhattan distance:
  // at or below neutral the slack is zero and the pickup priority stands;
  // above it the measured advantage must still clear the threshold (B12).
  const slack = aggressionPickupSlack(aggressionOf(personality));
  if (slack > 0 && pickup && rival && manhattan(rival) <= manhattan(pickup) + slack
    && advantageEngageAllowed(view, { rivalModel }, personality)) {
    return rival;
  }
  return pickup ?? rival;
}

// One safe step that increases the distance to the crate; holds position
// when every neighbor is blocked, dangerous, or no farther from the crate.
function stepBackFromCrate(view, intent, memory, arenaMemory, from, crateCell) {
  const { cols, rows, tile } = view.meta;
  const currentDistance = Math.abs(from.r - crateCell.r) + Math.abs(from.c - crateCell.c);

  let best = null;
  let bestDistance = currentDistance;
  for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const r = from.r + dr;
    const c = from.c + dc;
    if (view.grid[r]?.[c] !== 0) continue;
    if (view.bombs.some((bomb) => !bomb.exploded && bomb.r === r && bomb.c === c
      && !bomb.passOwners?.includes(view.self.id))) continue;
    if (dangerAt(r, c, view.grid, view.bombs, view.blasts) > 0) continue;
    const distance = Math.abs(r - crateCell.r) + Math.abs(c - crateCell.c);
    if (distance > bestDistance) {
      bestDistance = distance;
      best = { r, c };
    }
  }
  if (!best) return intent; // boxed in: hold position and wait

  const [centerX, centerZ] = worldFromCell(best.r, best.c, cols, rows, tile);
  // Same axis-alignment slack as nextStepToward (NAV_ALIGN_TOLERANCE).
  const dx = Math.abs(centerX - view.self.x) <= 0.14 ? 0 : Math.sign(centerX - view.self.x);
  const dz = Math.abs(centerZ - view.self.z) <= 0.14 ? 0 : Math.sign(centerZ - view.self.z);
  return commitRouteStep(intent, memory, arenaMemory, { dx, dz });
}

// --- Temporal escape -------------------------------------------------------
//
// The baseline arena brain escapes greedily (-120 x danger per neighbor)
// and dies in corridors: every neighbor is dangerous NOW, the scoring has
// no gradient, and the bot drifts at random — measured proof: after an
// open-route plant with a PROVEN escape, the baseline wander walked the
// bot into a sealed pocket instead of the proven route (84 of 90 deaths
// in the seed-42 diagnostic were own open-route bombs). So the temporal
// escape owns EVERY danger frame (dangerAt > 0, i.e. the self cell has a
// finite deadly window), not just the urgent ones: the time-expanded plan
// from danger-timeline.mjs starts walking the proven route the moment the
// bomb lands, waits out windows on cells that stay safe, and never steps
// into a cell that will be deadly on arrival. Safe frames (danger 0) keep
// the baseline/navigation behavior — including planting, which every
// plant gate already restricts to danger-free cells.

export function escapeTemporalDanger(view, intent, memory, arenaMemory) {
  const { cols, rows, tile } = view.meta;
  const from = cellFromWorld(view.self.x, view.self.z, cols, rows, tile);
  if (dangerAt(from.r, from.c, view.grid, view.bombs, view.blasts) === 0) return intent;

  const plan = escapePlan(view, dangerTimeline(view));
  if (!plan) return intent;
  memory.targetCell = plan.refuge;
  memory.route = plan.route;
  return commitRouteStep(intent, memory, arenaMemory, escapeStepIntent(view, plan));
}

const ESCAPE_ALIGN_TOLERANCE = 0.14; // same axis slack as nextStepToward

// Converts the plan's first hop into a center-aligned intent. The raw
// cardinal step wedges on bomb/wall corners when the bot drifts off the
// cell axis (the game revokes bomb passOwners once the owner steps clear,
// run-champion-bomb-duel.js:2042-2046), so the perpendicular axis steers
// back to the hop cell center first — same alignment as nextStepToward.
// Hold plans ({0,0}) stay untouched: waiting must not drift.
function escapeStepIntent(view, plan) {
  if (plan.route.length < 2 || (plan.step.dx === 0 && plan.step.dz === 0)) return plan.step;
  const { cols, rows, tile } = view.meta;
  const next = plan.route[1];
  const [centerX, centerZ] = worldFromCell(next.r, next.c, cols, rows, tile);
  const dx = Math.abs(centerX - view.self.x) <= ESCAPE_ALIGN_TOLERANCE ? 0 : Math.sign(centerX - view.self.x);
  const dz = Math.abs(centerZ - view.self.z) <= ESCAPE_ALIGN_TOLERANCE ? 0 : Math.sign(centerZ - view.self.z);
  if (dx === 0 && dz === 0) return plan.step;
  return { dx, dz };
}

// --- Plant veto --------------------------------------------------------------
//
// The baseline arena brain plants pressure bombs on its own (aligned with
// the rival, random chance) with no escape proof at all — the seed-42
// diagnostic showed those plants walking the V1 into timing traps the
// binary danger map cannot see. Every plant intent (baseline or planner)
// is re-proven against the temporal timeline: no reachable refuge with the
// hypothetical bomb, no bomb.

export function vetoBombWithoutEscape(view, intent, memory) {
  if (!intent.plantBomb) return intent;
  const { cols, rows, tile } = view.meta;
  const from = cellFromWorld(view.self.x, view.self.z, cols, rows, tile);
  if (hasTemporalBombEscape(view, from)) return intent;
  intent.plantBomb = false;
  memory.lastBombReason = null;
  if (memory.lastDecision) memory.lastDecision.plantBomb = false;
  return intent;
}

/**
 * Same-frame leave after a plant the veto just approved: the bomb is not
 * in the WorldView yet, so escapeTemporalDanger cannot see it. Replay the
 * proven temporal plan against a hypothetical bomb and start walking off
 * the cross immediately (place, leave, stay off until the blast ends).
 */
export function beginEscapeFromPlant(view, intent, memory, arenaMemory) {
  if (!intent.plantBomb) return intent;
  const { cols, rows, tile } = view.meta;
  const from = cellFromWorld(view.self.x, view.self.z, cols, rows, tile);
  const scoped = { ...view, bombs: [...view.bombs, hypotheticalBomb(view, from)] };
  const plan = escapePlan(scoped, dangerTimeline(scoped));
  if (!plan) return intent;
  memory.objective = "escape";
  memory.targetCell = plan.refuge;
  memory.route = plan.route;
  if (memory.lastDecision) memory.lastDecision.objective = "escape";
  return commitRouteStep(intent, memory, arenaMemory, escapeStepIntent(scoped, plan));
}

// --- Wall-stall recovery ---------------------------------------------------
//
// The baseline arena brain only re-decides direction near a cell center, so
// a bot blocked mid-cell (clipped corner, fresh bomb, closing wall) pushes
// the same direction forever. The V1 watches its own progress: wanting to
// move without moving for STALL_TIME seconds forces the best safe
// alternative — written back into the arena memory so the new heading
// survives the next baseline think ticks, and held in `memory.unstickHold`
// so the route/escape planners stand down instead of wiping the recovery
// heading one frame later.

const STALL_TIME = 0.45;     // seconds pushing without progress
const STALL_PROGRESS = 0.02; // tiles per think tick that count as progress
const UNSTICK_COMMIT = 0.6;  // seconds the new heading holds in arena memory

// Named UNSTICK_* because the V1 bundle inlines this module in the same
// scope as baseline-policy.mjs, which declares its own DIRECTIONS.
const UNSTICK_DIRECTIONS = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
  { dx: 0, dz: 0 }
];

export function unstickMovement(view, intent, memory, arenaMemory) {
  const { self } = view;
  memory.unstickHold = Math.max(0, (memory.unstickHold ?? 0) - (view.dt ?? 0));
  const wantsMove = intent.dx !== 0 || intent.dz !== 0;
  const last = memory.lastPosition;
  const moved = last ? Math.hypot(self.x - last.x, self.z - last.z) : Infinity;
  memory.lastPosition = { x: self.x, z: self.z };

  if (!wantsMove || moved >= STALL_PROGRESS) {
    memory.stallTime = 0;
    return intent;
  }

  memory.stallTime += view.dt ?? 0;
  if (memory.stallTime < STALL_TIME) return intent;
  memory.stallTime = 0;

  const alternative = bestAlternative(view, intent);
  if (!alternative) return intent;

  intent.dx = alternative.dx;
  intent.dz = alternative.dz;
  memory.unstickHold = UNSTICK_COMMIT; // planners stand down while it holds
  if (arenaMemory) {
    arenaMemory.lastDx = alternative.dx;
    arenaMemory.lastDz = alternative.dz;
    arenaMemory.commit = UNSTICK_COMMIT;
  }
  return intent;
}

function bestAlternative(view, intent) {
  const { self, rival, grid, bombs, blasts, pickups, meta } = view;
  const { cols, rows, tile } = meta;
  const cell = cellFromWorld(self.x, self.z, cols, rows, tile);
  const passableIds = bombs
    .filter((bomb) => bomb.passOwners?.includes(self.id))
    .map((bomb) => bomb.id);

  let best = null;
  let bestScore = -Infinity;

  for (const choice of UNSTICK_DIRECTIONS) {
    if (choice.dx === intent.dx && choice.dz === intent.dz) continue; // the wall
    const r = cell.r + choice.dz;
    const c = cell.c + choice.dx;
    const [x, z] = worldFromCell(r, c, cols, rows, tile);
    if ((choice.dx || choice.dz) && isBlocked(x, z, grid, bombs, tile, 0.27, passableIds)) {
      continue;
    }
    const danger = dangerAt(r, c, grid, bombs, blasts);
    const distance = Math.hypot(x - rival.x, z - rival.z);
    const pickupDistance = pickups.reduce(
      (best, pickup) => Math.min(best, Math.abs(pickup.r - r) + Math.abs(pickup.c - c)), 12);
    const score = -danger * 120 - distance * 0.7 - pickupDistance * 0.95;
    if (score > bestScore) {
      bestScore = score;
      best = choice;
    }
  }

  return best; // null only when every direction (including waiting) scores -Infinity
}

// --- Wedge recovery --------------------------------------------------------
//
// A dash landing can leave the collision box (radius 0.3, the moveEntity
// rule) overlapping a solid: every later move is rejected at the
// destination check, so the bot starves frozen in place — the cycle-15
// seed-42 diagnosis found the V1 frozen against the border wall for 80+
// seconds in EVERY drawn timeout round (an escape dash through the
// last-call exception saved it from the blast and wedged it for the rest
// of the round). Walking can never undo the overlap; only another dash
// moves the body CENTER out of it (the game's sweep only checks the
// center). The recovery: zero progress for UNWEDGE_FREEZE seconds while
// the bot wants to move — or with the body box already overlapping a
// solid, whatever the intent (a wedged bot sees idle frames that would
// reset a purely intent-based watch; a deliberate wait in the open still
// counts nothing) — then steer the facing toward the cardinal direction
// whose mirrored dash landing is free, and cast the dash once the facing
// points there. Danger frames belong to the temporal escape and its dash
// gates, and a bomb-boxed bot (no free landing anywhere) simply waits for
// the blast — the recovery only fires when a dash strictly improves on
// standing still.

const UNWEDGE_FREEZE = 1.2;      // seconds wanting to move with zero progress
const UNWEDGE_AIM = 0.9;         // facing·direction dot that lets the cast fire
const UNWEDGE_MIN_TRAVEL = 0.5;  // tiles; a shorter dash changes nothing
// Mirrors of the dash/collision rules in game/run-champion-bomb-duel.js
// (castRenektonE sweep, moveEntity/isBlocked collision) — same values as
// the DASH_*/BODY_* constants in renekton-skills.mjs, renamed because the
// V1 bundle inlines both modules in one scope.
const UNWEDGE_STEP = 0.24;       // sweep increment of castRenektonE
const UNWEDGE_BOMB_STOP = 0.48;  // bomb proximity that ends the sweep
const UNWEDGE_SLICE_TILES = 2.75;
const UNWEDGE_DICE_TILES = 3.15;
const UNWEDGE_BODY_RADIUS = 0.3;
const UNWEDGE_BODY_BOMB = 0.55;
const UNWEDGE_MOVE_STEP = 0.1;   // one moveEntity step in the frozen test

const UNWEDGE_DIRECTIONS = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 }
];

export function unwedgeMovement(view, intent, memory, arenaMemory) {
  if (!view.self?.alive) return intent;
  const { self } = view;
  const last = memory.unwedgeLastPosition;
  memory.unwedgeLastPosition = { x: self.x, z: self.z };
  const moved = last ? Math.hypot(self.x - last.x, self.z - last.z) : Infinity;
  const progressed = moved >= STALL_PROGRESS;
  // The freeze watch cannot rely on the intent alone: a wedged bot sees
  // zero-intent frames whenever the baseline brain idles between unstick
  // commits, and each one would reset the watch (the measured seed-42
  // pattern). A body box already overlapping a solid IS frozen no matter
  // what the intent says this frame; a bot waiting deliberately in the open
  // (box free, no movement intent) still accumulates nothing.
  const wantsMove = intent.dx !== 0 || intent.dz !== 0;
  const physicallyFrozen = !progressed && unwedgeFrozen(view, self.x, self.z);
  memory.freezeTime = !progressed && (wantsMove || physicallyFrozen)
    ? (memory.freezeTime ?? 0) + (view.dt ?? 0)
    : 0;
  if ((memory.freezeTime ?? 0) < UNWEDGE_FREEZE) return intent;
  // Danger frames belong to the temporal escape and the pilot's gated
  // escape dash; freezing there is their problem to solve first.
  const { cols, rows, tile } = view.meta;
  const cell = cellFromWorld(self.x, self.z, cols, rows, tile);
  if (dangerAt(cell.r, cell.c, view.grid, view.bombs, view.blasts) > 0) return intent;
  if (!unwedgeSkillReady(self)) return intent;

  const direction = bestUnwedgeDirection(view);
  if (!direction) return intent; // boxed by bombs: wait for the blast

  // Facing first: the dash travels along lastDx/lastDz, which the game sets
  // from the movement INTENT even when the move itself is rejected. One
  // steered frame prepares the facing; the cast fires on the next.
  const facingLength = Math.hypot(self.lastDx ?? 0, self.lastDz ?? 0);
  const aligned = facingLength > 1e-6
    && (self.lastDx / facingLength) * direction.dx
      + (self.lastDz / facingLength) * direction.dz >= UNWEDGE_AIM;
  intent.dx = direction.dx;
  intent.dz = direction.dz;
  if (arenaMemory) {
    arenaMemory.lastDx = direction.dx;
    arenaMemory.lastDz = direction.dz;
    arenaMemory.commit = UNSTICK_COMMIT;
  }
  if (aligned) {
    intent.skill = "e";
    memory.freezeTime = 0; // one shot per freeze; progress resets it anyway
  }
  return intent;
}

// The longest dash whose landing leaves the bot able to move, among the
// four cardinal directions — or null when every landing stays frozen
// (bombs box the bot in).
function bestUnwedgeDirection(view) {
  let best = null;
  let bestTravel = 0;
  for (const direction of UNWEDGE_DIRECTIONS) {
    const landing = unwedgeDashLanding(view, direction.dx, direction.dz);
    if (!landing || landing.travel < view.meta.tile * UNWEDGE_MIN_TRAVEL) continue;
    if (unwedgeFrozen(view, landing.x, landing.z, landing.crossed)) continue;
    if (landing.travel > bestTravel) {
      bestTravel = landing.travel;
      best = direction;
    }
  }
  return best;
}

// Where a Slice (or Dice, while the recast window is open) fired along
// (dx, dz) would land: mirrors the castRenektonE sweep — the center
// advances UNWEDGE_STEP at a time, a solid cell or any live bomb ends it,
// crates break and let it through. Crossed crate cells ride along in
// `crossed`: the game destroys them during the sweep, so the landing test
// must see them as already open.
function unwedgeDashLanding(view, dx, dz) {
  const { cols, rows, tile } = view.meta;
  const { self } = view;
  const recast = (self.renektonDashRecast ?? 0) > 0;
  const maxDistance = tile * (recast ? UNWEDGE_DICE_TILES : UNWEDGE_SLICE_TILES);
  let x = self.x;
  let z = self.z;
  let travel = 0;
  const crossed = [];
  for (let distance = UNWEDGE_STEP; distance <= maxDistance; distance += UNWEDGE_STEP) {
    const nx = self.x + dx * distance;
    const nz = self.z + dz * distance;
    const landingCell = cellFromWorld(nx, nz, cols, rows, tile);
    const cellValue = view.grid[landingCell.r]?.[landingCell.c];
    if (cellValue === 1) break;
    if (cellValue === 2
      && !crossed.some((cross) => cross.r === landingCell.r && cross.c === landingCell.c)) {
      crossed.push(landingCell);
    }
    const bombBlocked = view.bombs.some((bomb) => !bomb.exploded
      && Math.abs(nx - bomb.x) < UNWEDGE_BOMB_STOP
      && Math.abs(nz - bomb.z) < UNWEDGE_BOMB_STOP);
    if (bombBlocked) break;
    x = nx;
    z = nz;
    travel = distance;
  }
  return travel > 0 ? { x, z, travel, crossed } : null;
}

// Frozen means EXACTLY what moveEntity implies: every cardinal one-step
// destination is blocked. (An overlap alone is not enough — the step that
// moves AWAY from the overlapped cell is accepted, which is also how the
// wedged position differs from a merely close wall.) Crossed crates count
// as open: the dash that produced the landing already destroyed them.
function unwedgeFrozen(view, x, z, crossed = []) {
  return UNWEDGE_DIRECTIONS.every((direction) => unwedgeMoveBlocked(
    view, x + direction.dx * UNWEDGE_MOVE_STEP, z + direction.dz * UNWEDGE_MOVE_STEP, crossed));
}

// One moveEntity destination test at radius UNWEDGE_BODY_RADIUS: the box
// corners must sit on open cells (crossed crates count as open) and no
// live bomb the self may not cross may overlap the box.
function unwedgeMoveBlocked(view, x, z, crossed = []) {
  const { cols, rows, tile } = view.meta;
  for (const [px, pz] of [
    [x - UNWEDGE_BODY_RADIUS, z - UNWEDGE_BODY_RADIUS],
    [x + UNWEDGE_BODY_RADIUS, z - UNWEDGE_BODY_RADIUS],
    [x - UNWEDGE_BODY_RADIUS, z + UNWEDGE_BODY_RADIUS],
    [x + UNWEDGE_BODY_RADIUS, z + UNWEDGE_BODY_RADIUS]
  ]) {
    const corner = cellFromWorld(px, pz, cols, rows, tile);
    const cellValue = view.grid[corner.r]?.[corner.c];
    if (cellValue === undefined || cellValue === 1) return true;
    if (cellValue === 2
      && !crossed.some((cross) => cross.r === corner.r && cross.c === corner.c)) return true;
  }
  return view.bombs.some((bomb) => !bomb.exploded
    && !bomb.passOwners?.includes(view.self.id)
    && Math.abs(x - bomb.x) < tile * UNWEDGE_BODY_BOMB + UNWEDGE_BODY_RADIUS
    && Math.abs(z - bomb.z) < tile * UNWEDGE_BODY_BOMB + UNWEDGE_BODY_RADIUS);
}

// Slice readiness from the WorldView: the kit slot unlocked, the cooldown
// over — or the recast window open, which ignores the cooldown (game rule).
function unwedgeSkillReady(self) {
  if (Array.isArray(self.skillsUnlocked) && self.skillsUnlocked[2] === false) return false;
  if ((self.renektonDashRecast ?? 0) > 0) return true;
  return (self.eCooldown ?? 0) <= 0;
}
