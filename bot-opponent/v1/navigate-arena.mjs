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

import { cellFromWorld, worldFromCell } from "../baseline-policy.mjs";
// Single line on purpose: the V1 bundle strips imports with a one-line regex.
import { DANGER_STEP_MARGIN, crossingSurvivable, dangerSecondsPerCell, dangerTimeline, safestNeighborStep } from "./danger-timeline.mjs";

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
export function bfsField(grid, bombs, from, selfId = null) {
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
export function pathFromField(field, from, to) {
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
export function findPath(grid, bombs, from, to, selfId = null) {
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
export function nextStepToward(view, targetCell) {
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
