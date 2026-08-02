/**
 * V1 temporal danger perception — WHEN each cell turns deadly, not just
 * whether it is dangerous right now.
 *
 * Values verified against the real Match rules (game/run-champion-bomb-duel.js):
 *   - Blast lifetime: blasts spawn with `life: 0.5` and are culled once
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

import { cellFromWorld } from "../baseline-policy.mjs";

// Named DANGER_* because the V1 bundle inlines this module in the same
// scope as baseline-policy.mjs and the other V1 modules.
const DANGER_DIRECTIONS = [
  { dr: 0, dc: 1 },
  { dr: 0, dc: -1 },
  { dr: 1, dc: 0 },
  { dr: -1, dc: 0 }
];

export const DANGER_BLAST_LIFE = 0.5;     // run-champion-bomb-duel.js explodeBomb (blast.life)
export const DANGER_BOMB_FUSE = 2.35;     // run-champion-bomb-duel.js:731 (placeBomb fuse)
export const DANGER_CHAIN_FRAME = 1 / 60; // one updateBombs pass: run-champion-bomb-duel.js:2455 + 2412-2424
export const DANGER_STEP_MARGIN = 0.1;    // alignment + think-latency budget on crossing estimates
const DANGER_CELL_TIME = 0.45;            // fallback seconds per cell when the view carries no speed

/**
 * Seconds the self needs to cross one cell: tile/speed from the WorldView
 * (game: 3.45 units/s over 1.32 tiles ≈ 0.38 s/cell), DANGER_CELL_TIME
 * when the view carries no usable speed.
 */
export function dangerSecondsPerCell(view) {
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
export function dangerTimeline(view) {
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
export function isDeadlyAt(timeline, r, c, t) {
  const cell = timeline.cells[r]?.[c];
  if (!cell) return true; // outside the arena is never a refuge
  return t >= cell.deadlyFrom && t < cell.deadlyUntil;
}

/**
 * Seconds from `t` until the cell turns deadly: 0 when it already is,
 * Infinity when no window covers the future (never deadly, or the only
 * window already passed).
 */
export function safeWindowAfter(timeline, r, c, t) {
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
export function crossingSurvivable(timeline, r, c, arrive, leave) {
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
export function escapePlan(view, timeline = dangerTimeline(view)) {
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
export function safestNeighborStep(view, timeline = dangerTimeline(view)) {
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
