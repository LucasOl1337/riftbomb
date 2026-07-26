/**
 * Step 1 of perception — arena shell only.
 *
 * What this includes: cols, rows, tile, and a COPY of grid[r][c].
 * What this does NOT include yet: players, bombs, time, kit, random.
 *
 * Why first: every later sense (danger, path, bomb) needs a stable grid
 * that the bot cannot mutate back into the Match.
 */

/** Cell meanings used by the Match today. */
export const CELL = Object.freeze({
  OPEN: 0,
  SOLID: 1,
  BREAKABLE: 2
});

/**
 * @param {{ cols: number, rows: number, tile: number, grid: number[][] }} match
 * @returns {{ cols: number, rows: number, tile: number, grid: number[][] }}
 */
export function senseArena(match) {
  if (!match || !Array.isArray(match.grid)) {
    throw new TypeError("senseArena expects a match-like object with grid");
  }
  const cols = match.cols;
  const rows = match.rows;
  const tile = match.tile;
  if (!Number.isFinite(cols) || !Number.isFinite(rows) || !Number.isFinite(tile)) {
    throw new TypeError("senseArena expects finite cols, rows, tile");
  }
  if (match.grid.length !== rows) {
    throw new RangeError(`senseArena: grid has ${match.grid.length} rows, expected ${rows}`);
  }

  const grid = new Array(rows);
  for (let r = 0; r < rows; r += 1) {
    const row = match.grid[r];
    if (!Array.isArray(row) || row.length !== cols) {
      throw new RangeError(`senseArena: row ${r} width mismatch`);
    }
    grid[r] = row.slice();
  }

  return { cols, rows, tile, grid };
}
