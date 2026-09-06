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

import { dangerAt } from "../baseline-policy.mjs";
import { dangerTimeline, escapePlan } from "./danger-timeline.mjs";
import { bfsField } from "./navigate-arena.mjs";

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
export function findRouteCrate(view, from, targetCell) {
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
export function canPlantRouteBomb(view, cell) {
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
export function hasBombEscape(view, bombCell) {
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

export function hypotheticalBomb(view, bombCell) {
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
export function hasTemporalBombEscape(view, bombCell) {
  const scoped = { ...view, bombs: [...view.bombs, hypotheticalBomb(view, bombCell)] };
  const plan = escapePlan(scoped, dangerTimeline(scoped));
  return Boolean(plan && plan.reachedRefuge);
}
