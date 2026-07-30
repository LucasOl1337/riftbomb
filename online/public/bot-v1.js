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
    unstickHold: 0          // seconds the unstick heading still owns the intent
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

function navigateObjective(view, intent, memory, arenaMemory) {
  memory.route = [];
  memory.targetCell = null;
  if (memory.objective === "escape") return intent;
  if (!view.self?.alive || !view.rival?.alive) return intent;

  const { cols, rows, tile } = view.meta;
  const from = cellFromWorld(view.self.x, view.self.z, cols, rows, tile);
  const field = bfsField(view.grid, view.bombs, from, view.self.id);
  const target = chooseRouteTarget(view, field);
  if (!target) return openRouteObjective(view, intent, memory, arenaMemory, from, field);

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

function chooseRouteTarget(view, field) {
  const reachable = (cell) => Number.isFinite(field.dist[cell.r]?.[cell.c]);
  const nearest = (cells) => cells
    .filter(reachable)
    .sort((a, b) => field.dist[a.r][a.c] - field.dist[b.r][b.c])[0] ?? null;

  // Skill orbs only unlock for the owner who broke the crate; rival orbs are
  // dead weight for the V1 and are ignored entirely.
  const ownOrbs = view.pickups.filter(
    (pickup) => pickup.type === "skill" && pickup.ownerId === view.self.id);
  const otherPickups = view.pickups.filter(
    (pickup) => !(pickup.type === "skill" && pickup.ownerId != null));

  return nearest(ownOrbs)
    ?? nearest(otherPickups)
    ?? nearest([cellFromWorld(view.rival.x, view.rival.z, view.meta.cols, view.meta.rows, view.meta.tile)]);
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

function openRouteObjective(view, intent, memory, arenaMemory, from, field) {
  const target = chooseBlockedTarget(view, from);
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
function chooseBlockedTarget(view, from) {
  const manhattan = (cell) => Math.abs(cell.r - from.r) + Math.abs(cell.c - from.c);
  const nearest = (cells) => cells
    .slice()
    .sort((a, b) => manhattan(a) - manhattan(b))[0] ?? null;

  const ownOrbs = view.pickups.filter(
    (pickup) => pickup.type === "skill" && pickup.ownerId === view.self.id);
  const otherPickups = view.pickups.filter(
    (pickup) => !(pickup.type === "skill" && pickup.ownerId != null));

  return nearest(ownOrbs)
    ?? nearest(otherPickups)
    ?? nearest([cellFromWorld(view.rival.x, view.rival.z, view.meta.cols, view.meta.rows, view.meta.tile)]);
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
 */


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

function createRenektonPilot({ random = Math.random } = {}) {
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

function evaluateRenektonSkill(view, memory, random = Math.random) {
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


function createV1Policy({ champion = null, profile = "rift", random = Math.random } = {}) {
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

RIFTBOMB_BOTS.createV1Policy = createV1Policy;
RIFTBOMB_BOTS.createRenektonPilot = createRenektonPilot;
})();
