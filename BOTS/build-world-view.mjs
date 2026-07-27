/**
 * Step 2 of perception — build a read-only snapshot (WorldView) of the Match.
 *
 * What this includes (P0):
 *   - meta: arena size, match phase, clock, score, self/rival ids
 *   - grid: copy of the arena cells
 *   - self / rival: essential contestant state (no CPU memory)
 *   - bombs, blasts, pickups: arrays copied from the Match
 *   - dt: length of this perception tick
 *
 * What this does NOT include:
 *   - renderer, music, presentation, particles, skillTrails
 *   - hidden powerup plan inside crates
 *   - CPU internal fields (aiDx, aiDz, aiCommit, aiThink)
 *   - full kit-world data (P1)
 */

import { senseArena } from "./sense-arena.mjs";

const CPU_MEMORY_KEYS = new Set(["aiDx", "aiDz", "aiCommit", "aiThink"]);

/**
 * @param {{ mode: string, paused: boolean, roundLocked: boolean, players: object[], round?: number, roundAge?: number, roundTime?: number, roundWins?: number[], matchTarget?: number, roundDecisionTimer?: number, cols: number, rows: number, tile: number, grid: number[][], bombs: object[], blasts: object[], pickups: object[] }} match
 * @param {number} dt
 * @param {number} [selfId=2]
 * @returns {object | null}
 */
export function buildWorldView(match, dt, selfId = 2) {
  if (!canThink(match, selfId)) return null;

  const selfIndex = match.players.findIndex((player) => player.id === selfId);
  const self = match.players[selfIndex];
  const rival = match.players.find((player) => player.id !== selfId);

  const { grid } = senseArena(match);

  return Object.freeze({
    meta: Object.freeze({
      cols: match.cols,
      rows: match.rows,
      tile: match.tile,
      mode: match.mode,
      paused: match.paused,
      roundLocked: match.roundLocked,
      round: match.round,
      roundAge: match.roundAge,
      roundTime: match.roundTime,
      roundWins: match.roundWins.slice(),
      matchTarget: match.matchTarget,
      roundDecisionTimer: match.roundDecisionTimer,
      selfId,
      rivalId: rival?.id ?? null
    }),
    grid,
    self: copyContestant(self),
    rival: rival ? copyContestant(rival) : null,
    bombs: match.bombs.map(copyBomb),
    blasts: match.blasts.map(Object.freeze),
    pickups: match.pickups.map(Object.freeze),
    dt
  });
}

/**
 * @param {{ mode: string, paused: boolean, roundLocked: boolean, players: object[] }} match
 * @param {number} [selfId=2]
 * @returns {boolean}
 */
export function canThink(match, selfId = 2) {
  if (!match) return false;
  if (match.mode !== "playing" || match.paused || match.roundLocked) return false;
  const self = match.players?.find((player) => player.id === selfId);
  if (!self || !self.alive) return false;
  return true;
}

function copyContestant(player) {
  const copy = {};
  for (const [key, value] of Object.entries(player)) {
    if (CPU_MEMORY_KEYS.has(key)) continue;
    copy[key] = value;
  }
  return Object.freeze(copy);
}

function copyBomb(bomb) {
  return Object.freeze({
    ...bomb,
    passOwners: bomb.passOwners ? Array.from(bomb.passOwners) : []
  });
}
