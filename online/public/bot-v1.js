"use strict";
(() => {
if (typeof RIFTBOMB_BOTS === "undefined") return;
/**
 * Baseline bot policy — port of the original Game.updateBot heuristic.
 *
 * Consumes a read-only WorldView (from buildWorldView) and emits intents.
 * Keeps CPU timing state (think / commit timers) in an external memory object.
 */

const DIRECTIONS = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
  { dx: 0, dz: 0 }
];

function createBaselinePolicy({ profile = "rift", random = Math.random } = {}) {
  const memory = {
    commit: 0,
    think: 0.15 + random() * 0.2,
    lastDx: 0,
    lastDz: 1
  };

  return {
    profile,
    think(view, dt) {
      return baselineThink(view, dt, memory, random);
    },
    reset({ random: nextRandom = random } = {}) {
      memory.commit = 0;
      memory.think = 0.15 + nextRandom() * 0.2;
      memory.lastDx = 0;
      memory.lastDz = 1;
    },
    memory
  };
}

function baselineThink(view, dt, memory, random) {
  if (!view || !view.self?.alive || !view.rival?.alive) {
    return { dx: 0, dz: 0, plantBomb: false, skill: null };
  }

  const { self, rival, grid, bombs, blasts, pickups, meta } = view;
  const { cols, rows, tile, roundAge } = meta;

  memory.commit = Math.max(0, memory.commit - dt);
  memory.think -= dt;

  if (memory.think > 0) {
    return { dx: memory.lastDx, dz: memory.lastDz, plantBomb: false, skill: null };
  }

  memory.think = 0.16 + random() * 0.16;

  const cell = cellFromWorld(self.x, self.z, cols, rows, tile);
  const [cellX, cellZ] = worldFromCell(cell.r, cell.c, cols, rows, tile);
  const nearCenter = Math.hypot(self.x - cellX, self.z - cellZ) < 0.16;
  const currentDanger = dangerAt(cell.r, cell.c, grid, bombs, blasts);

  if (!nearCenter || (memory.commit > 0 && currentDanger === 0)) {
    return { dx: memory.lastDx, dz: memory.lastDz, plantBomb: false, skill: null };
  }

  const passableIds = bombs
    .filter((bomb) => bomb.passOwners?.includes(self.id))
    .map((bomb) => bomb.id);

  const choices = DIRECTIONS.filter((choice) => {
    if (!choice.dx && !choice.dz) return true;
    const r = cell.r + choice.dz;
    const c = cell.c + choice.dx;
    const [x, z] = worldFromCell(r, c, cols, rows, tile);
    return !isBlocked(x, z, grid, bombs, tile, 0.27, passableIds);
  });

  const nearestPickup = (r, c) =>
    pickups.reduce((best, pickup) =>
      Math.min(best, Math.abs(pickup.r - r) + Math.abs(pickup.c - c)), 12);

  let best = choices[0] || { dx: 0, dz: 0 };
  let bestScore = -Infinity;

  for (const choice of choices) {
    const r = cell.r + choice.dz;
    const c = cell.c + choice.dx;
    const [x, z] = worldFromCell(r, c, cols, rows, tile);
    const danger = dangerAt(r, c, grid, bombs, blasts);
    const distance = Math.hypot(x - rival.x, z - rival.z);
    const pickupDistance = nearestPickup(r, c);
    const reverse = choice.dx === -memory.lastDx && choice.dz === -memory.lastDz ? 0.35 : 0;
    const score = -danger * 120 - distance * 0.7 - pickupDistance * 0.95 - reverse + random() * 1.8;

    if (score > bestScore) {
      bestScore = score;
      best = choice;
    }
  }

  memory.lastDx = best.dx;
  memory.lastDz = best.dz;
  memory.commit = currentDanger > 0 ? 0.38 : 0.58;

  const adjacentBreakable = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) =>
    grid[cell.r + dr]?.[cell.c + dc] === 2
  );

  const rivalCell = cellFromWorld(rival.x, rival.z, cols, rows, tile);
  const aligned =
    (cell.r === rivalCell.r || cell.c === rivalCell.c) &&
    Math.hypot(self.x - rival.x, self.z - rival.z) < tile * 4.2;

  let plantBomb = false;
  if (
    roundAge > 1.4 &&
    currentDanger === 0 &&
    ((adjacentBreakable && random() < 0.18) || (aligned && random() < 0.26))
  ) {
    if (canPlantBomb(self, bombs)) {
      plantBomb = true;
      memory.commit = 0;
    }
  }

  return { dx: best.dx, dz: best.dz, plantBomb, skill: null };
}

function canPlantBomb(self, bombs) {
  const activeBombs = bombs.filter((bomb) => !bomb.exploded && bomb.ownerId === self.id).length;
  return activeBombs < self.maxBombs;
}

function cellFromWorld(x, z, cols, rows, tile) {
  return {
    c: clamp(Math.round(x / tile + (cols - 1) / 2), 0, cols - 1),
    r: clamp(Math.round(z / tile + (rows - 1) / 2), 0, rows - 1)
  };
}

function worldFromCell(r, c, cols, rows, tile) {
  return [(c - (cols - 1) / 2) * tile, (r - (rows - 1) / 2) * tile];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isBlocked(x, z, grid, bombs, tile, radius = 0.31, ignoreIds = []) {
  const points = [
    [x - radius, z - radius],
    [x + radius, z - radius],
    [x - radius, z + radius],
    [x + radius, z + radius]
  ];

  for (const [px, pz] of points) {
    const cell = cellFromWorld(px, pz, grid[0].length, grid.length, tile);
    if (grid[cell.r]?.[cell.c] !== 0) return true;
  }

  for (const bomb of bombs) {
    if (bomb.exploded || ignoreIds.includes(bomb.id)) continue;
    if (Math.abs(x - bomb.x) < tile * 0.55 + radius && Math.abs(z - bomb.z) < tile * 0.55 + radius) {
      return true;
    }
  }

  return false;
}

function dangerAt(r, c, grid, bombs, blasts) {
  if (blasts.some((blast) => blast.r === r && blast.c === c)) return 4;

  for (const bomb of bombs) {
    if (bomb.exploded) continue;
    if (bomb.r === r && bomb.c === c) return 3;
    if ((bomb.r === r || bomb.c === c) && blastPathClear(bomb, r, c, grid)) {
      return bomb.age < bomb.fuse - 1.05 ? 1 : 2;
    }
  }

  return 0;
}

function blastPathClear(bomb, r, c, grid) {
  const dr = Math.sign(r - bomb.r);
  const dc = Math.sign(c - bomb.c);
  const distance = Math.max(Math.abs(r - bomb.r), Math.abs(c - bomb.c));
  if ((dr && dc) || distance > bomb.range) return false;

  for (let i = 1; i <= distance; i++) {
    const rr = bomb.r + dr * i;
    const cc = bomb.c + dc * i;
    if (grid[rr]?.[cc] === 1) return false;
    if (grid[rr]?.[cc] === 2) return i === distance;
  }

  return true;
}

/**
 * V1 rival model — what the V1 learns ABOUT the rival across the rounds of
 * one match (cycle 10, B7).
 *
 * The model is controller memory ABOUT the opponent (D9), not WorldView
 * data: it lives in the V1 memory as `memory.rivalModel`, is observed once
 * per think from the WorldView, and — unlike every other memory field —
 * is NOT cleared by resetV1Memory: round resets keep the habits, only a
 * new policy (new match) starts from zero.
 *
 * What it records:
 *   - Heat map: how long the rival occupies each cell. Every think adds
 *     `dt` to the rival's current cell and every cell decays with a half
 *     life (RIVAL_HEAT_HALF_LIFE), so the map always describes the RECENT
 *     match instead of accumulating stale round-1 habits forever.
 *   - Escape routes: when a live bomb appears NEAR the rival (manhattan
 *     at most RIVAL_NEAR_BOMB_CELLS, any owner's — the V1's own bombs
 *     teach where the rival runs too) with at least RIVAL_MIN_TRACK_FUSE
 *     of fuse left, the model tracks the rival for RIVAL_ESCAPE_WINDOW
 *     seconds and records his displacement from the start cell as a
 *     relative offset ("dr,dc" -> decaying weight, RIVAL_HABIT_HALF_LIFE).
 *     The window is deliberately shorter than the 2s intuition: at the
 *     game's ~3.45 units/s a 2s dodge covers 5+ cells and overruns
 *     RIVAL_MAX_ESCAPE_OFFSET, so longer tracks would discard exactly the
 *     real dodges. A rival who never moved records nothing: standing
 *     still is not a usable escape route (the heat map captures it), and
 *     a track cut by the explosion counts only after RIVAL_MIN_TRACK_TIME
 *     — half a dodge is noise, not a habit. Habits decay slower than
 *     heat: escape preferences are stable traits.
 *   - Bomb habit: every rival-owned plant is counted with its cell
 *     (decaying bombHeat), whether it touched a crate, and whether it was
 *     aligned with the V1 at plant time.
 *
 * How it predicts (predictRivalCell):
 *   1. Threatened rival + known escape habit -> the rival's current cell
 *      plus his favorite escape offset (he is about to run there).
 *   2. Otherwise a velocity lead: current position + the EMA velocity over
 *      RIVAL_PREDICT_HORIZON seconds, snapped to a walkable cell (half lead
 *      as fallback). A blocked lead falls back to the hottest walkable
 *      cell in the movement direction, then to the current cell.
 *   3. No observations at all -> the rival's current cell, exactly the
 *      pre-model behavior (regression guard).
 *
 * Pure functions over the WorldView plus the model; the bot still only
 * emits intents — game/ validates and applies.
 */


// Named RIVAL_* because the V1 bundle inlines this module in the same
// scope as baseline-policy.mjs and the other V1 modules.
const RIVAL_HEAT_HALF_LIFE = 20;    // seconds for a cell-occupation weight to halve
const RIVAL_HABIT_HALF_LIFE = 45;   // seconds for an escape-offset weight to halve
const RIVAL_ESCAPE_WINDOW = 1.2;    // seconds tracked after a bomb lands near the rival
const RIVAL_NEAR_BOMB_CELLS = 2;    // manhattan distance that counts as "near the rival"
const RIVAL_MIN_TRACK_FUSE = 0.8;   // remaining fuse needed to open a track
const RIVAL_MIN_TRACK_TIME = 0.5;   // seconds a blast-cut track must run to count
const RIVAL_MAX_ESCAPE_OFFSET = 4;  // cells; larger displacements are teleports, not dodges
const RIVAL_PREDICT_HORIZON = 1.0;  // seconds of velocity lead when intercepting
const RIVAL_VELOCITY_BLEND = 0.3;   // EMA weight of each think's instantaneous velocity
const RIVAL_MAX_SPEED = 12;         // world units/s; faster snaps are respawn teleports
const RIVAL_PRESSURE_RANGE = 3;     // manhattan distance where a cut-escape plant applies
const RIVAL_BOMB_FUSE = 2.35;       // mirrors placeBomb in game/run-champion-bomb-duel.js

function createRivalModel() {
  return {
    heat: null,            // rows x cols occupation seconds (decaying), built on first observe
    bombHeat: null,        // rows x cols rival plant counts (decaying)
    lastPosition: null,    // last observed rival position { x, z }
    velocity: { x: 0, z: 0 }, // EMA world velocity, units/s
    escapeTracks: [],      // active tracks: { bombId, startR, startC, elapsed }
    seenBombs: new Map(),  // bomb id -> ownerId, pruned when the bomb leaves the view
    escapeOffsets: new Map(), // "dr,dc" -> decaying weight
    escapeSamples: 0,      // completed escape tracks (never decays: "has data" flag)
    plants: 0,             // rival bombs seen
    plantsNearCrate: 0,    // rival plants touching a crate
    plantsAligned: 0       // rival plants sharing a row/column with the V1
  };
}

/**
 * One observation tick. Called once per think with the current WorldView.
 * Frames without a live rival (his death, round transitions) freeze the
 * model — no decay, no samples — so a 4-second death does not erase the
 * habits the previous minute taught.
 */
function observeRival(view, model) {
  if (!view?.rival?.alive) return model;
  const dt = view.dt ?? 0;
  if (dt <= 0) return model;

  const { cols, rows, tile } = view.meta;
  if (!model.heat) {
    model.heat = Array.from({ length: rows }, () => Array(cols).fill(0));
    model.bombHeat = Array.from({ length: rows }, () => Array(cols).fill(0));
  }

  decayGrid(model.heat, dt, RIVAL_HEAT_HALF_LIFE);
  decayGrid(model.bombHeat, dt, RIVAL_HABIT_HALF_LIFE);
  const habitDecay = Math.pow(0.5, dt / RIVAL_HABIT_HALF_LIFE);
  for (const [key, weight] of model.escapeOffsets) {
    model.escapeOffsets.set(key, weight * habitDecay);
  }

  const rivalCell = cellFromWorld(view.rival.x, view.rival.z, cols, rows, tile);
  model.heat[rivalCell.r][rivalCell.c] += dt;

  observeVelocity(view, model, dt);
  observeBombHabits(view, model);
  observeEscapeRoutes(view, model, rivalCell, dt);
  return model;
}

function decayGrid(grid, dt, halfLife) {
  const factor = Math.pow(0.5, dt / halfLife);
  for (const row of grid) {
    for (let c = 0; c < row.length; c += 1) row[c] *= factor;
  }
}

function observeVelocity(view, model, dt) {
  const { rival } = view;
  const last = model.lastPosition;
  model.lastPosition = { x: rival.x, z: rival.z };
  if (!last) return;
  const ix = (rival.x - last.x) / dt;
  const iz = (rival.z - last.z) / dt;
  if (Math.hypot(ix, iz) > RIVAL_MAX_SPEED) {
    // Respawn/teleport snap: the old velocity would aim the interception
    // at a corridor the rival is no longer using.
    model.velocity = { x: 0, z: 0 };
    return;
  }
  model.velocity.x += (ix - model.velocity.x) * RIVAL_VELOCITY_BLEND;
  model.velocity.z += (iz - model.velocity.z) * RIVAL_VELOCITY_BLEND;
}

function observeBombHabits(view, model) {
  const selfCell = cellFromWorld(view.self.x, view.self.z, view.meta.cols, view.meta.rows, view.meta.tile);
  const liveIds = new Set();
  for (const bomb of view.bombs) {
    if (bomb.exploded) continue;
    liveIds.add(bomb.id);
    if (model.seenBombs.has(bomb.id)) continue;
    model.seenBombs.set(bomb.id, bomb.ownerId);
    if (bomb.ownerId !== view.rival.id) continue;
    model.plants += 1;
    if (model.bombHeat[bomb.r]?.[bomb.c] != null) model.bombHeat[bomb.r][bomb.c] += 1;
    if (touchesCrate(view.grid, bomb.r, bomb.c)) model.plantsNearCrate += 1;
    if (bomb.r === selfCell.r || bomb.c === selfCell.c) model.plantsAligned += 1;
  }
  for (const id of model.seenBombs.keys()) {
    if (!liveIds.has(id)) model.seenBombs.delete(id);
  }
}

function touchesCrate(grid, r, c) {
  return grid[r + 1]?.[c] === 2 || grid[r - 1]?.[c] === 2
    || grid[r]?.[c + 1] === 2 || grid[r]?.[c - 1] === 2;
}

function observeEscapeRoutes(view, model, rivalCell, dt) {
  const liveBombs = new Map();
  for (const bomb of view.bombs) {
    if (!bomb.exploded) liveBombs.set(bomb.id, bomb);
  }
  const remaining = [];
  for (const track of model.escapeTracks) {
    track.elapsed += dt;
    const bomb = liveBombs.get(track.bombId);
    if (bomb && track.elapsed < RIVAL_ESCAPE_WINDOW) {
      remaining.push(track);
      continue;
    }
    // Close reasons: the window elapsed (full dodge) or the bomb went off
    // mid-track. A blast-cut track only counts after RIVAL_MIN_TRACK_TIME:
    // less than that is half a dodge, and a rival who never moved leaves
    // a zero offset that teaches nothing.
    if (!bomb && track.elapsed < RIVAL_MIN_TRACK_TIME) continue;
    const dr = rivalCell.r - track.startR;
    const dc = rivalCell.c - track.startC;
    if (!dr && !dc) continue;
    if (Math.abs(dr) + Math.abs(dc) > RIVAL_MAX_ESCAPE_OFFSET) continue;
    const key = `${dr},${dc}`;
    model.escapeOffsets.set(key, (model.escapeOffsets.get(key) ?? 0) + 1);
    model.escapeSamples += 1;
  }
  model.escapeTracks = remaining;

  // Open a track when a live bomb lands near the rival with enough fuse
  // left for a meaningful dodge window.
  for (const bomb of liveBombs.values()) {
    if (model.escapeTracks.some((track) => track.bombId === bomb.id)) continue;
    if ((bomb.fuse ?? RIVAL_BOMB_FUSE) - (bomb.age ?? 0) < RIVAL_MIN_TRACK_FUSE) continue;
    const distance = Math.abs(bomb.r - rivalCell.r) + Math.abs(bomb.c - rivalCell.c);
    if (distance > RIVAL_NEAR_BOMB_CELLS) continue;
    model.escapeTracks.push({ bombId: bomb.id, startR: rivalCell.r, startC: rivalCell.c, elapsed: 0 });
  }
}

/**
 * The rival's escape habits, strongest first: relative offsets ("dr,dc"
 * from the threatened cell) with their decayed weights.
 */
function favoriteEscapeCells(model, limit = 3) {
  if (!model) return [];
  return [...model.escapeOffsets.entries()]
    .map(([key, weight]) => {
      const [dr, dc] = key.split(",").map(Number);
      return { dr, dc, weight };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

/** The most occupied cell of the recent match (null before any observe). */
function hottestRivalCell(model) {
  if (!model?.heat) return null;
  let best = null;
  let bestWeight = 0;
  for (let r = 0; r < model.heat.length; r += 1) {
    for (let c = 0; c < model.heat[r].length; c += 1) {
      if (model.heat[r][c] > bestWeight) {
        bestWeight = model.heat[r][c];
        best = { r, c };
      }
    }
  }
  return best;
}

/** Aggregate bomb habit, for diagnostics and future tuning. */
function rivalBombHabit(model) {
  const plants = model?.plants ?? 0;
  return {
    plants,
    nearCrateRatio: plants ? model.plantsNearCrate / plants : 0,
    alignedRatio: plants ? model.plantsAligned / plants : 0
  };
}

/**
 * Where the rival will be, not where he is. Falls back to his current
 * cell whenever the model has nothing to say (null model included), which
 * preserves the pre-model chase behavior exactly.
 */
function predictRivalCell(model, view) {
  const { cols, rows, tile } = view.meta;
  const current = cellFromWorld(view.rival.x, view.rival.z, cols, rows, tile);
  if (!model) return current;
  const walkable = (r, c) => view.grid[r]?.[c] === 0;

  // A bomb already threatens the rival and the model knows his dodge:
  // aim where he runs, not where he stands.
  if (model.escapeSamples > 0) {
    const threatened = view.bombs.some((bomb) => !bomb.exploded
      && dangerAt(current.r, current.c, view.grid, [bomb], []) > 0);
    if (threatened) {
      const [favorite] = favoriteEscapeCells(model, 1);
      if (favorite && walkable(current.r + favorite.dr, current.c + favorite.dc)) {
        return { r: current.r + favorite.dr, c: current.c + favorite.dc };
      }
    }
  }

  // Velocity lead: intercept ahead of his current heading. A blocked lead
  // tries half the horizon, then the hottest walkable cell still ahead of
  // him — the heat map breaks the tie toward his habits.
  const speed = Math.hypot(model.velocity.x, model.velocity.z);
  if (speed * RIVAL_PREDICT_HORIZON < tile * 0.5) return current;
  for (const scale of [1, 0.5]) {
    const lead = cellFromWorld(
      view.rival.x + model.velocity.x * RIVAL_PREDICT_HORIZON * scale,
      view.rival.z + model.velocity.z * RIVAL_PREDICT_HORIZON * scale,
      cols, rows, tile);
    if (walkable(lead.r, lead.c)) return lead;
  }
  const dirZ = Math.sign(model.velocity.z);
  const dirX = Math.sign(model.velocity.x);
  let best = null;
  let bestWeight = 0;
  for (let dr = -2; dr <= 2; dr += 1) {
    for (let dc = -2; dc <= 2; dc += 1) {
      if (!dr && !dc) continue;
      if (dr * dirZ + dc * dirX <= 0) continue; // behind him: not an interception
      const r = current.r + dr;
      const c = current.c + dc;
      if (!walkable(r, c)) continue;
      const weight = model.heat?.[r]?.[c] ?? 0;
      if (weight > bestWeight) {
        bestWeight = weight;
        best = { r, c };
      }
    }
  }
  return best ?? current;
}

/**
 * True when a bomb planted on `from` would trap the rival by the model:
 * its blast must threaten his current cell AND cover the destination of
 * his favorite escape habit — wherever he dodges, the lane is fire.
 * Without recorded habits it returns false, so the plant behavior before
 * the first observation is unchanged.
 */
function bombCutsRivalEscape(view, model, from) {
  if (!model || model.escapeSamples === 0) return false;
  if (!view.rival?.alive) return false;
  const { cols, rows, tile } = view.meta;
  const rivalCell = cellFromWorld(view.rival.x, view.rival.z, cols, rows, tile);
  if (Math.abs(rivalCell.r - from.r) + Math.abs(rivalCell.c - from.c) > RIVAL_PRESSURE_RANGE) {
    return false;
  }
  const [favorite] = favoriteEscapeCells(model, 1);
  if (!favorite || (!favorite.dr && !favorite.dc)) return false;

  const hypothetical = {
    id: -1,
    ownerId: view.self.id,
    r: from.r,
    c: from.c,
    age: 0,
    fuse: RIVAL_BOMB_FUSE,
    range: view.self.range ?? 2,
    exploded: false,
    passOwners: [view.self.id]
  };
  const bombs = [...view.bombs, hypothetical];
  const escapeCell = { r: rivalCell.r + favorite.dr, c: rivalCell.c + favorite.dc };
  return dangerAt(rivalCell.r, rivalCell.c, view.grid, bombs, view.blasts) > 0
    && dangerAt(escapeCell.r, escapeCell.c, view.grid, bombs, view.blasts) > 0;
}

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

const AGGRESSION_DEFAULT = 0.5;

// Tiles of path-distance slack the predicted rival cell gains over a
// pickup at full aggression: at 1.0 the hunt outranks any pickup up to
// AGGRESSION_PICKUP_SLACK tiles closer.
const AGGRESSION_PICKUP_SLACK = 8;

/** Clamped aggression weight; the neutral default when unset/invalid. */
function aggressionOf(personality = null) {
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
function aggressionPickupSlack(aggression) {
  return Math.max(0, aggression - AGGRESSION_DEFAULT) * 2 * AGGRESSION_PICKUP_SLACK;
}

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


function createV1Memory() {
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

function resetV1Memory(memory) {
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

/**
 * V1 temporal danger perception — WHEN each cell turns deadly, not just
 * whether it is dangerous right now.
 *
 * Values verified against the real Match rules (game/run-champion-bomb-duel.js):
 *   - Blast lifetime: blasts spawn with `life: 0.58` and are culled once
 *     `age >= life` (explodeBomb, run-champion-bomb-duel.js:2449; update,
 *     run-champion-bomb-duel.js:2703-2704).
 *   - Fuse: bombs are planted with `fuse: 2.35` (placeBomb,
 *     run-champion-bomb-duel.js:731) and explode when `age >= fuse`
 *     (updateBombs, run-champion-bomb-duel.js:2412-2424).
 *   - Chain detonation: a blast cell holding another live bomb sets
 *     `other.age = other.fuse` (explodeBomb, run-champion-bomb-duel.js:2455).
 *     The chained bomb only enters the pending list on the NEXT updateBombs
 *     pass, so it really explodes one frame (~1/60s) after the blast
 *     reaches it. The timeline models that frame (DANGER_CHAIN_FRAME), so
 *     the predicted danger never starts later than the real one.
 *   - Blast coverage mirrors blastPathClear in baseline-policy.mjs (same
 *     rule as the Match's own blastPathClear): the bomb cell is covered,
 *     solids stop the ray, a crate is hit but shields everything behind it.
 *
 * Data shape: dangerTimeline(view) returns a per-cell envelope
 * `{ deadlyFrom, deadlyUntil }` in seconds from "now" (this perception
 * tick). A cell with no future danger keeps `deadlyFrom = Infinity` (its
 * `deadlyUntil` stays -Infinity: no window at all).
 * Overlapping windows from several bombs/blasts merge into ONE envelope
 * (earliest from, latest until): the merge can fill a short safe gap
 * between two explosions but never hides a deadly interval — the bot only
 * trusts "safe" when no window covers it.
 *
 * Pure functions over the WorldView; the bot still only emits intents.
 */


// Named DANGER_* because the V1 bundle inlines this module in the same
// scope as baseline-policy.mjs and the other V1 modules.
const DANGER_DIRECTIONS = [
  { dr: 0, dc: 1 },
  { dr: 0, dc: -1 },
  { dr: 1, dc: 0 },
  { dr: -1, dc: 0 }
];

const DANGER_BLAST_LIFE = 0.58;    // run-champion-bomb-duel.js:2449 (blast.life)
const DANGER_BOMB_FUSE = 2.35;     // run-champion-bomb-duel.js:731 (placeBomb fuse)
const DANGER_CHAIN_FRAME = 1 / 60; // one updateBombs pass: run-champion-bomb-duel.js:2455 + 2412-2424
const DANGER_STEP_MARGIN = 0.1;    // alignment + think-latency budget on crossing estimates
const DANGER_CELL_TIME = 0.45;            // fallback seconds per cell when the view carries no speed

/**
 * Seconds the self needs to cross one cell: tile/speed from the WorldView
 * (game: 3.45 units/s over 1.32 tiles ≈ 0.38 s/cell), DANGER_CELL_TIME
 * when the view carries no usable speed.
 */
function dangerSecondsPerCell(view) {
  const speed = Number(view.self?.speed);
  return speed > 0 ? view.meta.tile / speed : DANGER_CELL_TIME;
}

// Mirrors blastPathClear in bot-opponent/baseline-policy.mjs (private
// there): true when the bomb's blast reaches (r, c) — the bomb's own cell
// included, solids stop the ray, a crate is hit but shields what is behind.
function dangerBlastPathClear(bomb, r, c, grid) {
  const dr = Math.sign(r - bomb.r);
  const dc = Math.sign(c - bomb.c);
  const distance = Math.max(Math.abs(r - bomb.r), Math.abs(c - bomb.c));
  if ((dr && dc) || distance > bomb.range) return false;

  for (let i = 1; i <= distance; i += 1) {
    const rr = bomb.r + dr * i;
    const cc = bomb.c + dc * i;
    if (grid[rr]?.[cc] === 1) return false;
    if (grid[rr]?.[cc] === 2) return i === distance;
  }
  return true;
}

// Walkable like the navigation BFS: grid 0 and no live bomb on the cell,
// except bombs the self may still cross (passOwners).
function dangerWalkable(view, r, c) {
  if (view.grid[r]?.[c] !== 0) return false;
  for (const bomb of view.bombs) {
    if (bomb.exploded) continue;
    if (bomb.r !== r || bomb.c !== c) continue;
    if (bomb.passOwners?.includes(view.self.id)) continue;
    return false;
  }
  return true;
}

/**
 * Per-cell deadly envelope for the whole arena.
 *
 * @returns {{ rows: number, cols: number, cells: { deadlyFrom: number, deadlyUntil: number }[][] }}
 */
function dangerTimeline(view) {
  const { grid, bombs, blasts } = view;
  const rows = grid.length;
  const cols = grid[0].length;
  const cells = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ deadlyFrom: Infinity, deadlyUntil: -Infinity })));

  const mark = (r, c, from, until) => {
    const cell = cells[r]?.[c];
    if (!cell) return;
    cell.deadlyFrom = Math.min(cell.deadlyFrom, Math.max(0, from));
    cell.deadlyUntil = Math.max(cell.deadlyUntil, until);
  };

  // Active blasts are deadly NOW until the rest of their life.
  for (const blast of blasts) {
    const life = Number.isFinite(blast.life) ? blast.life : DANGER_BLAST_LIFE;
    const age = Number.isFinite(blast.age) ? blast.age : 0;
    const remaining = life - age;
    if (remaining <= 0) continue;
    mark(blast.r, blast.c, 0, remaining);
  }

  const live = bombs.filter((bomb) => !bomb.exploded);

  // Effective explosion time per bomb: its own fuse, or the arrival of an
  // earlier blast that chain-detonates it (plus the one frame the real
  // updateBombs needs to pick it up). Relax to a fixed point; times only
  // shrink, so `live.length` rounds always settle.
  const explodeAt = live.map(
    (bomb) => Math.max(0, (bomb.fuse ?? DANGER_BOMB_FUSE) - (bomb.age ?? 0)));
  for (let round = 0; round < live.length; round += 1) {
    let changed = false;
    for (let a = 0; a < live.length; a += 1) {
      for (let b = 0; b < live.length; b += 1) {
        if (a === b) continue;
        const chained = explodeAt[a] + DANGER_CHAIN_FRAME;
        if (chained < explodeAt[b]
          && dangerBlastPathClear(live[a], live[b].r, live[b].c, grid)) {
          explodeAt[b] = chained;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  for (let i = 0; i < live.length; i += 1) {
    const bomb = live[i];
    const t = explodeAt[i];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (dangerBlastPathClear(bomb, r, c, grid)) mark(r, c, t, t + DANGER_BLAST_LIFE);
      }
    }
  }

  return { rows, cols, cells };
}

/** True when the cell sits inside its deadly window at time `t`. */
function isDeadlyAt(timeline, r, c, t) {
  const cell = timeline.cells[r]?.[c];
  if (!cell) return true; // outside the arena is never a refuge
  return t >= cell.deadlyFrom && t < cell.deadlyUntil;
}

/**
 * Seconds from `t` until the cell turns deadly: 0 when it already is,
 * Infinity when no window covers the future (never deadly, or the only
 * window already passed).
 */
function safeWindowAfter(timeline, r, c, t) {
  const cell = timeline.cells[r]?.[c];
  if (!cell) return 0;
  if (t < cell.deadlyFrom) return cell.deadlyFrom - t;
  if (t >= cell.deadlyUntil) return Infinity; // the only window already passed
  return 0; // inside the deadly window
}

/**
 * True when a bot entering the cell at `arrive` and needing until `leave`
 * to be out again never touches the deadly window. Waiting the window out
 * is NOT considered here — escapePlan handles that.
 */
function crossingSurvivable(timeline, r, c, arrive, leave) {
  const cell = timeline.cells[r]?.[c];
  if (!cell) return false;
  return leave <= cell.deadlyFrom || arrive >= cell.deadlyUntil;
}

// A cell stays safe to occupy over the whole [from, until] span only when
// the span ends before its window starts, or starts after the window ended.
function staysSafeDuring(cell, from, until) {
  return until <= cell.deadlyFrom || from >= cell.deadlyUntil;
}

/**
 * Time-expanded escape plan from the self cell.
 *
 * Dijkstra over (cell, earliest arrival): every step costs one cell
 * crossing (tile/speed) and is only valid when the neighbor stays
 * non-deadly for the whole crossing plus DANGER_STEP_MARGIN. When the
 * neighbor is mid-window the bot may WAIT on the current cell — feasible
 * only while the current cell itself stays safe — and step in right after
 * the window closes. A refuge is a cell safe forever after arrival (never
 * deadly, or its only window already passed); the earliest-arrival refuge
 * wins.
 *
 * Fallbacks, so the bot never freezes in a loop of nulls:
 *   - "Least worst": when no refuge is reachable, the plan walks to the
 *     reachable cell with the LARGEST safe window after arrival
 *     (`reachedRefuge: false`).
 *   - "Hold": when the plan's first move only becomes safe later, the plan
 *     holds position (step {0,0} plus `hold` seconds) instead of stepping
 *     into a closing cell. Waiting on the current cell is also what the
 *     plan returns when it stays safe longer than every neighbor.
 *
 * @returns {{ route: {r,c}[], refuge: {r,c}, reachedRefuge: boolean, hold: number, step: {dx,dz} } | null}
 */
function escapePlan(view, timeline = dangerTimeline(view)) {
  const { cols, rows } = view.meta;
  const from = cellFromWorld(view.self.x, view.self.z, cols, rows, view.meta.tile);
  const cellTime = dangerSecondsPerCell(view);

  const arrival = Array.from({ length: rows }, () => Array(cols).fill(Infinity));
  const parent = Array.from({ length: rows }, () => Array(cols).fill(null));
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  arrival[from.r][from.c] = 0;

  let refuge = null;
  for (;;) {
    // Pop the unvisited cell with the earliest arrival (grid is tiny).
    let u = null;
    let earliest = Infinity;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (!visited[r][c] && arrival[r][c] < earliest) {
          earliest = arrival[r][c];
          u = { r, c };
        }
      }
    }
    if (!u) break;
    visited[u.r][u.c] = true;
    if (safeWindowAfter(timeline, u.r, u.c, arrival[u.r][u.c]) === Infinity) {
      refuge = u;
      break;
    }

    for (const step of DANGER_DIRECTIONS) {
      const r = u.r + step.dr;
      const c = u.c + step.dc;
      if (r < 0 || c < 0 || r >= rows || c >= cols || visited[r][c]) continue;
      if (!dangerWalkable(view, r, c)) continue;

      const cell = timeline.cells[r][c];
      let enter = arrival[u.r][u.c] + cellTime;
      if (!crossingSurvivable(timeline, r, c, enter, enter + cellTime + DANGER_STEP_MARGIN)) {
        // The neighbor is closing: wait its window out on u, but only
        // while u itself stays safe.
        if (!Number.isFinite(cell.deadlyUntil)) continue;
        enter = cell.deadlyUntil;
        const depart = enter - cellTime;
        if (depart < arrival[u.r][u.c]
          || !staysSafeDuring(timeline.cells[u.r][u.c], arrival[u.r][u.c], depart)) {
          continue;
        }
      }
      if (enter < arrival[r][c]) {
        arrival[r][c] = enter;
        parent[r][c] = u;
      }
    }
  }

  // Least-worst fallback: no refuge reachable — take the reachable cell
  // with the most time left (ties: the earliest arrival).
  let target = refuge;
  if (!target) {
    let bestWindow = -Infinity;
    let bestArrival = Infinity;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (!Number.isFinite(arrival[r][c])) continue;
        const window = safeWindowAfter(timeline, r, c, arrival[r][c]);
        if (window > bestWindow || (window === bestWindow && arrival[r][c] < bestArrival)) {
          bestWindow = window;
          bestArrival = arrival[r][c];
          target = { r, c };
        }
      }
    }
  }
  if (!target) return null; // no walkable cell at all (the arena always has one)

  const route = [];
  let cursor = target;
  while (cursor) {
    route.unshift({ r: cursor.r, c: cursor.c });
    if (cursor.r === from.r && cursor.c === from.c) break;
    cursor = parent[cursor.r][cursor.c];
  }

  let hold = 0;
  let step;
  if (route.length < 2) {
    // The safest reachable cell is the current one: stay.
    step = { dx: 0, dz: 0 };
    hold = safeWindowAfter(timeline, from.r, from.c, 0);
  } else {
    const next = route[1];
    const depart = arrival[next.r][next.c] - cellTime;
    if (depart > 0.02) {
      step = { dx: 0, dz: 0 }; // the first move is only safe later: wait it out
      hold = depart;
    } else {
      step = { dx: Math.sign(next.c - from.c), dz: Math.sign(next.r - from.r) };
    }
  }

  return { route, refuge: { r: target.r, c: target.c }, reachedRefuge: Boolean(refuge), hold, step };
}

/**
 * "Least worst" move for navigation stalls: among staying put and the
 * walkable neighbors, pick the cell with the largest safe window (current
 * cell judged at t=0, neighbors at their arrival time) and step toward
 * it — {0,0} when staying wins. Never returns null, so the caller cannot
 * freeze in a loop of nulls when every routed step crosses a deadly window.
 */
function safestNeighborStep(view, timeline = dangerTimeline(view)) {
  const { cols, rows } = view.meta;
  const from = cellFromWorld(view.self.x, view.self.z, cols, rows, view.meta.tile);
  const cellTime = dangerSecondsPerCell(view);

  let bestWindow = safeWindowAfter(timeline, from.r, from.c, 0);
  const step = { dx: 0, dz: 0 };
  for (const direction of DANGER_DIRECTIONS) {
    const r = from.r + direction.dr;
    const c = from.c + direction.dc;
    if (!dangerWalkable(view, r, c)) continue;
    const window = safeWindowAfter(timeline, r, c, cellTime);
    if (window > bestWindow) {
      bestWindow = window;
      step.dx = direction.dc;
      step.dz = direction.dr;
    }
  }
  return step;
}

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


// Named ADV_* because the V1 bundle inlines this module in the same scope
// as baseline-policy.mjs and the other V1 modules.
const ADV_BASE = 0.5;           // score of a perfectly even fight
const ADV_HEALTH_WEIGHT = 0.25; // per full health-ratio gap
const ADV_FURY_WEIGHT = 0.10;   // at ADV_FURY_EMPOWER or more
const ADV_FURY_EMPOWER = 50;    // Fury for empowered casts (game rule)
const ADV_KIT_WEIGHT = 0.05;    // per unlocked-skill difference
const ADV_KIT_MAX_DIFF = 2;     // skills the gap saturates at
const ADV_CORNER_WEIGHT = 0.10; // rival with zero safe neighbors
const ADV_THREAT_WEIGHT = 0.15; // rival cell already deadly
const ADV_THREAT_WINDOW = 2.35; // seconds; mirrors the bomb fuse
const ADV_DOMINUS_WEIGHT = 0.10; // self Dominus active

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
const ADV_THRESHOLD_BASE = 0.55;
const ADV_THRESHOLD_SLOPE = 0.5;

/**
 * The advantage an engage demands at this aggression: linear from 0.80
 * (fully passive) through 0.55 (neutral) down to 0.30 (fully aggressive).
 */
function advantageThreshold(aggression) {
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
function advantageEngageAllowed(view, memory, personality) {
  if (personality === null || personality === undefined) return true;
  return advantageScore(view, memory) >= advantageThreshold(personality.aggression);
}

/**
 * Composed advantage in [0, 1]: ADV_BASE plus the documented signals,
 * clamped. Pure over the WorldView (plus the optional rival model).
 */
function advantageScore(view, memory = null) {
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

/**
 * V1 arena navigation — BFS pathfinding over arena cells.
 *
 * The baseline arena brain scores directions greedily and walks straight
 * into walls when the goal sits behind a corridor; this module gives the V1
 * real routes. Pure functions over the WorldView shape (grid, bombs, meta)
 * so every piece is testable without a Match.
 *
 * Blocking rules: a cell is walkable when `grid === 0` and no live bomb sits
 * on it — except bombs whose `passOwners` include the self (the bot may
 * still cross a bomb it just planted). Crates (`grid === 2`) block the BFS;
 * `open-route.mjs` decides which crate to bomb on purpose.
 */

// Single line on purpose: the V1 bundle strips imports with a one-line regex.

// Named NAV_* because the V1 bundle inlines this module in the same scope
// as baseline-policy.mjs, which declares its own DIRECTIONS.
const NAV_DIRECTIONS = [
  { dr: 0, dc: 1 },
  { dr: 0, dc: -1 },
  { dr: 1, dc: 0 },
  { dr: -1, dc: 0 }
];

// World-unit slack around a cell axis: within it the bot does not drift
// sideways, so it walks straight down corridor centers.
const NAV_ALIGN_TOLERANCE = 0.14;

/**
 * Breadth-first field from one cell: per-cell step distance and parent
 * pointer. Unreachable cells keep dist Infinity and parent null.
 *
 * @returns {{ dist: number[][], parent: (object|null)[][] }}
 */
function bfsField(grid, bombs, from, selfId = null) {
  const rows = grid.length;
  const cols = grid[0].length;
  const dist = Array.from({ length: rows }, () => Array(cols).fill(Infinity));
  const parent = Array.from({ length: rows }, () => Array(cols).fill(null));
  if (grid[from.r]?.[from.c] === undefined) return { dist, parent };

  dist[from.r][from.c] = 0;
  const queue = [from];
  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head];
    for (const step of NAV_DIRECTIONS) {
      const r = cell.r + step.dr;
      const c = cell.c + step.dc;
      if (dist[r]?.[c] !== Infinity) continue; // out of bounds or visited
      if (!isWalkable(grid, bombs, r, c, selfId)) continue;
      dist[r][c] = dist[cell.r][cell.c] + 1;
      parent[r][c] = cell;
      queue.push({ r, c });
    }
  }
  return { dist, parent };
}

function isWalkable(grid, bombs, r, c, selfId) {
  if (grid[r]?.[c] !== 0) return false;
  for (const bomb of bombs) {
    if (bomb.exploded) continue;
    if (bomb.r !== r || bomb.c !== c) continue;
    if (selfId != null && bomb.passOwners?.includes(selfId)) continue;
    return false;
  }
  return true;
}

/** Reconstructs the cell list from `from` to `to`, or null when unreachable. */
function pathFromField(field, from, to) {
  if (!Number.isFinite(field.dist[to.r]?.[to.c])) return null;
  const path = [];
  let cell = to;
  while (cell) {
    path.unshift({ r: cell.r, c: cell.c });
    if (cell.r === from.r && cell.c === from.c) break;
    cell = field.parent[cell.r][cell.c];
  }
  return path;
}

/**
 * Shortest walkable path from `from` to `to` as a cell list including both
 * ends, or null when no route exists.
 */
function findPath(grid, bombs, from, to, selfId = null) {
  return pathFromField(bfsField(grid, bombs, from, selfId), from, to);
}

/**
 * Movement intent that walks the self from its real world position toward
 * the center of the next path cell on the way to `targetCell`.
 *
 * Returns null when there is no route, the target is already reached, or
 * the step is already aligned (no movement needed) — the caller then keeps
 * the baseline decision.
 *
 * The danger guard is TEMPORAL, not binary: the step is only refused when
 * the next cell's deadly window overlaps the crossing — reaching its
 * center takes ~one cell time, leaving it ~two (plus DANGER_STEP_MARGIN).
 * A fresh bomb (danger 1, fuse far away) no longer paralyzes the route:
 * with the window still seconds away the bot crosses in time. When the
 * crossing WOULD be deadly the bot does not freeze on a null either — the
 * fallback is safestNeighborStep: hold on the current cell when it stays
 * safe the longest, otherwise sidestep to the neighbor with the most time
 * left (the "least worst" cell), so pursuit never walks into a closing
 * corridor nor stalls in a loop of nulls.
 */
function nextStepToward(view, targetCell) {
  const { cols, rows, tile } = view.meta;
  const { self } = view;
  const from = cellFromWorld(self.x, self.z, cols, rows, tile);
  const path = findPath(view.grid, view.bombs, from, targetCell, self.id);
  if (!path || path.length < 2) return null;

  const next = path[1];
  const timeline = dangerTimeline(view);
  const cellTime = dangerSecondsPerCell(view);
  if (!crossingSurvivable(timeline, next.r, next.c, cellTime, 2 * cellTime + DANGER_STEP_MARGIN)) {
    return safestNeighborStep(view, timeline);
  }

  const [centerX, centerZ] = worldFromCell(next.r, next.c, cols, rows, tile);
  const dx = Math.abs(centerX - self.x) <= NAV_ALIGN_TOLERANCE ? 0 : Math.sign(centerX - self.x);
  const dz = Math.abs(centerZ - self.z) <= NAV_ALIGN_TOLERANCE ? 0 : Math.sign(centerZ - self.z);
  if (dx === 0 && dz === 0) return null;
  return { dx, dz };
}

/**
 * V1 route opening — purposeful crate bombing.
 *
 * The navigation BFS treats crates (`grid === 2`) as walls, so pickups,
 * skill orbs and the rival often sit behind a crate barrier and the round
 * stalls into a timeout draw. The baseline only breaks crates by accident
 * (a low random chance when adjacent). This module finds the ONE crate
 * that opens the route to the current target and decides when it is safe
 * to bomb it:
 *
 *   - findRouteCrate: double BFS — a walkable field from the self and a
 *     crate-passable field from the target; the route crate is the crate
 *     minimizing dist(self → stand) + dist(target → crate), i.e. the
 *     cheapest crate to remove on the way to the target.
 *   - hasBombEscape: simulates the hypothetical bomb on the self cell and
 *     proves a reachable danger-free cell exists within the fuse; without
 *     a proven escape the caller steps back and waits instead of planting.
 *
 * Pure functions over the WorldView; the bot still only emits intents —
 * game/ validates and applies the bomb.
 */


// Named ROUTE_* because the V1 bundle inlines this module in the same
// scope as baseline-policy.mjs and the other V1 modules.
const ROUTE_DIRECTIONS = [
  { dr: 0, dc: 1 },
  { dr: 0, dc: -1 },
  { dr: 1, dc: 0 },
  { dr: -1, dc: 0 }
];

const ROUTE_BOMB_FUSE = 2.35;    // mirrors placeBomb in game/run-champion-bomb-duel.js
const ROUTE_MIN_ROUND_AGE = 1.4; // mirrors the baseline plant gate
const ROUTE_CELL_TIME = 0.45;    // fallback seconds per cell when the view carries no speed
const ROUTE_ESCAPE_SLACK = 0.35; // alignment + think-latency budget on top of walking time

/**
 * Seconds the self needs to cross one cell. Derived from the real speed
 * (game: 3.45 world units/s over 1.32 tiles ≈ 0.38 s/cell) whenever the
 * WorldView carries `self.speed`; ROUTE_CELL_TIME otherwise.
 */
function secondsPerCell(view) {
  const speed = Number(view.self?.speed);
  return speed > 0 ? view.meta.tile / speed : ROUTE_CELL_TIME;
}

/**
 * Planning-layer BFS from the target where crates are passable (cost 1)
 * and bombs are ignored — it measures how many cells and crate layers
 * separate the target from each cell, not a walkable route.
 */
function cratePassableField(grid, from) {
  const rows = grid.length;
  const cols = grid[0].length;
  const dist = Array.from({ length: rows }, () => Array(cols).fill(Infinity));
  if (grid[from.r]?.[from.c] === undefined) return dist;

  dist[from.r][from.c] = 0;
  const queue = [from];
  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head];
    for (const step of ROUTE_DIRECTIONS) {
      const r = cell.r + step.dr;
      const c = cell.c + step.dc;
      if (dist[r]?.[c] !== Infinity) continue; // out of bounds or visited
      if (grid[r][c] === 1) continue;          // solids stay sealed
      dist[r][c] = dist[cell.r][cell.c] + 1;
      queue.push({ r, c });
    }
  }
  return dist;
}

/**
 * The crate whose removal cheapest-connects the self to `targetCell`.
 *
 * For every crate reachable from the target through the crate layer, the
 * stand cell is its free neighbor closest to the self (by walkable BFS
 * distance); the winning crate minimizes stand distance + target distance.
 * Chains of crates resolve iteratively: after each explosion the planner
 * re-runs and picks the next crate of the chain.
 *
 * @returns {{ crateCell: { r: number, c: number }, standCell: { r: number, c: number } } | null}
 */
function findRouteCrate(view, from, targetCell) {
  const { grid, bombs } = view;
  const distSelf = bfsField(grid, bombs, from, view.self.id).dist;
  const distTarget = cratePassableField(grid, targetCell);

  let best = null;
  let bestScore = Infinity;
  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < grid[0].length; c += 1) {
      if (grid[r][c] !== 2) continue;
      const targetDistance = distTarget[r][c];
      if (!Number.isFinite(targetDistance)) continue;

      let stand = null;
      let standDistance = Infinity;
      for (const step of ROUTE_DIRECTIONS) {
        const nr = r + step.dr;
        const nc = c + step.dc;
        const distance = distSelf[nr]?.[nc];
        if (!Number.isFinite(distance)) continue;
        // Tie-break toward the target side so the bot faces the crate.
        if (distance < standDistance
          || (distance === standDistance && stand
            && distTarget[nr][nc] < distTarget[stand.r][stand.c])) {
          stand = { r: nr, c: nc };
          standDistance = distance;
        }
      }
      if (!stand) continue;

      const score = standDistance + targetDistance;
      if (score < bestScore) {
        bestScore = score;
        best = { crateCell: { r, c }, standCell: stand };
      }
    }
  }
  return best;
}

/**
 * Same plant gates the baseline respects: round started, current cell
 * safe, and a free bomb slot.
 */
function canPlantRouteBomb(view, cell) {
  if ((view.meta.roundAge ?? 0) <= ROUTE_MIN_ROUND_AGE) return false;
  if (dangerAt(cell.r, cell.c, view.grid, view.bombs, view.blasts) > 0) return false;
  const active = view.bombs.filter(
    (bomb) => !bomb.exploded && bomb.ownerId === view.self.id).length;
  return active < (view.self.maxBombs ?? 1);
}

/**
 * Proves the self survives a bomb planted on `bombCell`: with the
 * hypothetical bomb added to the danger map, some reachable cell must be
 * danger-free AND reachable in strictly less than the fuse (walking time
 * plus ROUTE_ESCAPE_SLACK of alignment/think budget). The hypothetical
 * bomb is passable by its owner, exactly like placeBomb's passOwners.
 */
function hasBombEscape(view, bombCell) {
  const hypothetical = hypotheticalBomb(view, bombCell);
  const bombs = [...view.bombs, hypothetical];
  const { dist } = bfsField(view.grid, bombs, bombCell, view.self.id);
  const cellTime = secondsPerCell(view);

  for (let r = 0; r < view.grid.length; r += 1) {
    for (let c = 0; c < view.grid[0].length; c += 1) {
      if (!Number.isFinite(dist[r][c])) continue;
      if (dangerAt(r, c, view.grid, bombs, view.blasts) > 0) continue;
      if (dist[r][c] * cellTime + ROUTE_ESCAPE_SLACK < ROUTE_BOMB_FUSE) return true;
    }
  }
  return false;
}

function hypotheticalBomb(view, bombCell) {
  return {
    id: -1,
    ownerId: view.self.id,
    r: bombCell.r,
    c: bombCell.c,
    age: 0,
    fuse: ROUTE_BOMB_FUSE,
    range: view.self.range ?? 2,
    exploded: false,
    passOwners: [view.self.id]
  };
}

/**
 * Temporal escape proof for a bomb planted on the self cell: with the
 * hypothetical bomb added, the time-expanded escapePlan must still reach a
 * refuge (a cell safe forever). Unlike the binary hasBombEscape — which
 * only checks that a danger-free cell is reachable within the fuse — this
 * sees the TIMING of every window along the way: a plant whose only exit
 * crosses a lane during its blast is vetoed. The escape envelope merges
 * overlapping windows, so a marginal gap-threading escape is refused too;
 * a skipped plant costs far less than a self-kill.
 */
function hasTemporalBombEscape(view, bombCell) {
  const scoped = { ...view, bombs: [...view.bombs, hypotheticalBomb(view, bombCell)] };
  const plan = escapePlan(scoped, dangerTimeline(scoped));
  return Boolean(plan && plan.reachedRefuge);
}

/**
 * V1 arena planning — classifies the current objective and records
 * decisions in the V1 memory.
 *
 * V1.0 keeps the baseline policy as the arena brain (movement + bombs);
 * this module is the seam where V1 planning grows without touching the
 * baseline port.
 */


function planArenaActions(view, intent, memory) {
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

function navigateObjective(view, intent, memory, arenaMemory, personality = null) {
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
    intent.dx = 0;
    intent.dz = 0;
    intent.plantBomb = true;
    memory.lastBombReason = "open-route";
    if (memory.lastDecision) {
      memory.lastDecision.dx = 0;
      memory.lastDecision.dz = 0;
      memory.lastDecision.plantBomb = true;
    }
    return intent;
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

function escapeTemporalDanger(view, intent, memory, arenaMemory) {
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

function vetoBombWithoutEscape(view, intent, memory) {
  if (!intent.plantBomb) return intent;
  const { cols, rows, tile } = view.meta;
  const from = cellFromWorld(view.self.x, view.self.z, cols, rows, tile);
  if (hasTemporalBombEscape(view, from)) return intent;
  intent.plantBomb = false;
  memory.lastBombReason = null;
  if (memory.lastDecision) memory.lastDecision.plantBomb = false;
  return intent;
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

function unstickMovement(view, intent, memory, arenaMemory) {
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

function unwedgeMovement(view, intent, memory, arenaMemory) {
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

/**
 * Renekton tactical memory — only what the pilot remembers about the
 * kit, never Match state. Fury, cooldowns, health and recast windows
 * belong to the Match and arrive through the WorldView.
 */

function createRenektonMemory() {
  return {
    comboStep: 0,          // where the current combo stands (0 none, 1 E, 2 W, 3 Q)
    pendingDice: false,    // Slice landed; wants the E recast ("Dice")
    exitCell: null,        // planned escape cell after an engage { r, c }
    lastSkill: null,       // { slot, reason, at, effects } last ask; effects = combo snapshot for rollback
    skillHesitation: 0,    // seconds before another skill may be asked
    comboUntil: 0,         // roundAge when the unfinished combo expires
    comboUlted: false,     // Dominus already spent on the current combo
    aimPending: null       // { slot, until, holds } directional cast held for facing
  };
}

function resetRenektonMemory(memory) {
  memory.comboStep = 0;
  memory.pendingDice = false;
  memory.exitCell = null;
  memory.lastSkill = null;
  memory.skillHesitation = 0;
  memory.comboUntil = 0;
  memory.comboUlted = false;
  memory.aimPending = null;
}

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
 *
 * Landing check (cycle 13): an aligned facing is still not enough — the
 * game's dash sweep only checks the body CENTER, so a corridor dash can
 * land with the collision box overlapping a solid and freeze the bot
 * until its own bomb kills it (the measured seed-42 regression). An
 * aligned escape dash also demands a landing that leaves the body free
 * (dashLandingFree, mirroring the game's sweep and collision); a wedged
 * landing holds the cast like a misaligned facing. The blind "no known
 * safe direction" dash stays ungated: a frozen landing outside the blast
 * still beats standing inside it.
 *
 * Landing policy per branch (cycle 14 — the gate now covers every dash):
 * - Escape: gated; the last-call exceptions (`closing` under
 *   ESCAPE_LAST_CALL, and "none" — no known safe direction) still accept a
 *   wedged landing, because the alternative is standing inside the blast.
 * - Engage (`close-distance`): always gated, no last-call case. The engage
 *   starts from a safe cell with no timer, so holding costs nothing — the
 *   bot just walks to melee. Note the dash carries PAST the rival (the
 *   rival never blocks the game's sweep), so the planned landing can sit
 *   behind the target.
 * - Offensive Dice (`dice-through`/`dice-finish`): the landing is always
 *   gated, even with the window closing — `recastClosing` overrides the
 *   facing only. An expired window leaves the bot on its safe cell; a
 *   wedged landing may freeze it in the open next to the rival, so the
 *   window is left to rot. The exit Dice (`dice-exit`) stays ungated: it
 *   dashes back toward the cell the engage started from, a spot the bot
 *   itself just occupied.
 * The asymmetry is principled: a bad landing is only accepted when the
 * alternative is worse than a possible freeze.
 *
 * Personality (cycle 11, B8): the optional `personality.aggression`
 * weight scales ONLY the branch-6 engage reach (0.8x–1.2x of
 * ENGAGE_REACH, exact at the neutral 0.5). Escape, survive and combo
 * branches never read it.
 *
 * Conditioned engage (cycle 12): WITH a personality the branch-6 engage
 * also demands a measured advantage (advantage.mjs) that clears the
 * temperament threshold — blind aggression loses the mirror (cycle 11:
 * 0.8 -> 2V x 8D). Without a personality the gate is open and the
 * trigger is bit-identical to the pre-cycle-12 behavior.
 */


const MELEE_REACH = 1.6;    // tiles — Q/W want the rival adjacent
const ENGAGE_REACH = 4.5;   // tiles — E engage window at neutral aggression
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
// Mirror of the dash/collision rules in game/run-champion-bomb-duel.js, so
// the escape dash can foresee where it lands (castRenektonE sweep) and
// whether the landing leaves the body able to move (moveEntity collision).
const DASH_STEP = 0.24;        // sweep increment of castRenektonE
const DASH_BOMB_STOP = 0.48;   // bomb proximity that ends the sweep
const DASH_SLICE_TILES = 2.75; // Slice max reach in tiles
const DASH_DICE_TILES = 3.15;  // Dice (recast) max reach in tiles
const BODY_RADIUS = 0.3;       // movement collision radius (moveEntity)
const BODY_BOMB_BLOCK = 0.55;  // bomb block factor in tiles (isBlocked)

function createRenektonPilot({ random = Math.random, personality = null } = {}) {
  const memory = createRenektonMemory();
  return {
    id: "renekton",
    memory,
    evaluateSkill(view) {
      return evaluateRenektonSkill(view, memory, random, personality);
    },
    reset() {
      resetRenektonMemory(memory);
    }
  };
}

function evaluateRenektonSkill(view, memory, random = Math.random, personality = null) {
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
  // Aggression (B8) stretches only the E engage trigger (branch 6): 0.8x at
  // 0, exactly ENGAGE_REACH at the neutral 0.5, 1.2x at 1. The defensive
  // Dominus reach and every escape branch keep the base constants.
  const engageReach = ENGAGE_REACH * (0.8 + 0.4 * aggressionOf(personality));

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
  //    The aligned facing alone is NOT enough: the dash must also land with
  //    the body box free (dashLandingFree), otherwise the cast freezes the
  //    bot against a solid and the bomb it escapes kills it — the hold path
  //    below lets the temporal escape walk instead, exactly like a
  //    misaligned facing.
  if (danger > 0 && skillReady(self, "e")) {
    const timeline = dangerTimeline(view);
    const closing = safeWindowAfter(timeline, cell.r, cell.c, 0) < ESCAPE_LAST_CALL;
    const aligned = escapeFacingAligned(view, cell, timeline);
    if (closing || aligned === "none" || (aligned === true && dashLandingFree(view, recastOpen))) {
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
        // Landing gate (cycle 14): the closing exception covers the FACING
        // only, never the landing. An expired window leaves the bot standing
        // on its safe cell; a wedged Dice freezes it in the open next to the
        // rival (the cycle-13 residual deaths). Let the window rot instead.
        if (!dashLandingFree(view, true)) return null;
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
  //    The reach scales with aggression (engageReach above), and WITH a
  //    personality the measured advantage must clear the temperament
  //    threshold (cycle 12 — the gate is evaluated last and skipped without
  //    a personality, keeping the pre-cycle-12 trigger bit-identical).
  const aligned = cell.r === rivalCell.r || cell.c === rivalCell.c;
  if (
    !recastOpen && memory.comboStep === 0 && aligned && danger === 0
    && distance <= engageReach && skillReady(self, "e")
    && advantageEngageAllowed(view, memory, personality)
  ) {
    const held = holdForFacing("e", AIM_ENGAGE, rival.x, rival.z);
    if (held !== false) return null; // held: walk a frame; exhausted: skip
    // Landing gate (cycle 14): the dash carries PAST the rival — the rival
    // never blocks the game's sweep — so the planned landing can sit behind
    // the target, wedged against a solid. The engage has no clock (safe
    // cell, no window to lose), so a wedged landing holds the cast like an
    // aim miss: navigation simply walks to melee instead.
    if (!dashLandingFree(view, false)) return null;
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
 * Escape-dash landing safety: the game's castRenektonE sweep only checks
 * the body CENTER against cells, so a dash fired along a corridor stops one
 * DASH_STEP short of a solid — with the collision box (BODY_RADIUS, checked
 * by moveEntity on every later step) left overlapping that solid. Every
 * candidate move from such a landing is still blocked: the bot freezes in
 * place until the fuse ends (cycle-13 diagnosis: 96/96 seed-42 round losses
 * were own open-route bombs killing the bot frozen right after the escape
 * dash). The dash is only worth its facing when the landing leaves the body
 * free; a wedged landing holds the cast and lets the temporal escape walk.
 * Unknown facing (partial views, tests) never blocks, exactly like
 * facingAligned.
 */
function dashLandingFree(view, recast) {
  const landing = sliceDashLanding(view, recast);
  if (!landing) return true;
  return !dashBodyBlocked(view, landing.x, landing.z);
}

/**
 * Where the dash would land: mirrors castRenektonE in
 * game/run-champion-bomb-duel.js — the sweep advances DASH_STEP at a time
 * along the facing, a solid cell or any live bomb (the game ignores
 * passOwners here) ends it, crates break and let it through, and the
 * landing is the last point reached. Null when the facing is unknown.
 */
function sliceDashLanding(view, recast) {
  const { cols, rows, tile } = view.meta;
  const { self } = view;
  const { lastDx, lastDz } = self;
  if (typeof lastDx !== "number" || typeof lastDz !== "number") return null;
  const length = Math.max(0.001, Math.hypot(lastDx, lastDz)); // game rule
  const dirX = lastDx / length;
  const dirZ = lastDz / length;
  const maxDistance = tile * (recast ? DASH_DICE_TILES : DASH_SLICE_TILES);
  let x = self.x;
  let z = self.z;
  for (let distance = DASH_STEP; distance <= maxDistance; distance += DASH_STEP) {
    const nx = self.x + dirX * distance;
    const nz = self.z + dirZ * distance;
    const cell = cellFromWorld(nx, nz, cols, rows, tile);
    if (view.grid[cell.r]?.[cell.c] === 1) break;
    const bombBlocked = view.bombs.some((bomb) => !bomb.exploded
      && Math.abs(nx - bomb.x) < DASH_BOMB_STOP
      && Math.abs(nz - bomb.z) < DASH_BOMB_STOP);
    if (bombBlocked) break;
    x = nx;
    z = nz;
  }
  return { x, z };
}

/**
 * True when the body box at (x, z) collides: mirrors the game's isBlocked
 * (moveEntity, radius BODY_RADIUS) — the four box corners must sit on open
 * cells and no live bomb the self may not cross may overlap the box.
 */
function dashBodyBlocked(view, x, z) {
  const { cols, rows, tile } = view.meta;
  for (const [px, pz] of [
    [x - BODY_RADIUS, z - BODY_RADIUS], [x + BODY_RADIUS, z - BODY_RADIUS],
    [x - BODY_RADIUS, z + BODY_RADIUS], [x + BODY_RADIUS, z + BODY_RADIUS]
  ]) {
    const cell = cellFromWorld(px, pz, cols, rows, tile);
    if (view.grid[cell.r]?.[cell.c] !== 0) return true;
  }
  return view.bombs.some((bomb) => !bomb.exploded
    && !bomb.passOwners?.includes(view.self.id)
    && Math.abs(x - bomb.x) < tile * BODY_BOMB_BLOCK + BODY_RADIUS
    && Math.abs(z - bomb.z) < tile * BODY_BOMB_BLOCK + BODY_RADIUS);
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


function createV1Policy({ champion = null, profile = "rift", random = Math.random, personality = null } = {}) {
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
      // a refuge; the escape step then owns the frame as usual.
      vetoBombWithoutEscape(view, intent, memory);
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

RIFTBOMB_BOTS.createV1Policy = createV1Policy;
RIFTBOMB_BOTS.createRenektonPilot = createRenektonPilot;
})();
