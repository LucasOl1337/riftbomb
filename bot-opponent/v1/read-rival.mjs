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

import { cellFromWorld, dangerAt } from "../baseline-policy.mjs";

// Named RIVAL_* because the V1 bundle inlines this module in the same
// scope as baseline-policy.mjs and the other V1 modules.
export const RIVAL_HEAT_HALF_LIFE = 20;    // seconds for a cell-occupation weight to halve
export const RIVAL_HABIT_HALF_LIFE = 45;   // seconds for an escape-offset weight to halve
export const RIVAL_ESCAPE_WINDOW = 1.2;    // seconds tracked after a bomb lands near the rival
export const RIVAL_NEAR_BOMB_CELLS = 2;    // manhattan distance that counts as "near the rival"
export const RIVAL_MIN_TRACK_FUSE = 0.8;   // remaining fuse needed to open a track
export const RIVAL_MIN_TRACK_TIME = 0.5;   // seconds a blast-cut track must run to count
export const RIVAL_MAX_ESCAPE_OFFSET = 4;  // cells; larger displacements are teleports, not dodges
export const RIVAL_PREDICT_HORIZON = 1.0;  // seconds of velocity lead when intercepting
export const RIVAL_VELOCITY_BLEND = 0.3;   // EMA weight of each think's instantaneous velocity
export const RIVAL_MAX_SPEED = 12;         // world units/s; faster snaps are respawn teleports
export const RIVAL_PRESSURE_RANGE = 3;     // manhattan distance where a cut-escape plant applies
export const RIVAL_BOMB_FUSE = 2.35;       // mirrors placeBomb in game/run-champion-bomb-duel.js

export function createRivalModel() {
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
export function observeRival(view, model) {
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
export function favoriteEscapeCells(model, limit = 3) {
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
export function hottestRivalCell(model) {
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
export function rivalBombHabit(model) {
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
export function predictRivalCell(model, view) {
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
export function bombCutsRivalEscape(view, model, from) {
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
