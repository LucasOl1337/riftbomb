import assert from "node:assert/strict";
import { test } from "node:test";
import { CELL, senseArena } from "./sense-arena.mjs";

function stubMatch() {
  return {
    cols: 3,
    rows: 2,
    tile: 1.32,
    grid: [
      [CELL.SOLID, CELL.OPEN, CELL.BREAKABLE],
      [CELL.OPEN, CELL.SOLID, CELL.OPEN]
    ]
  };
}

test("senseArena copies the dead arena shell", () => {
  const match = stubMatch();
  const view = senseArena(match);

  assert.equal(view.cols, 3);
  assert.equal(view.rows, 2);
  assert.equal(view.tile, 1.32);
  assert.deepEqual(view.grid, match.grid);
});

test("senseArena grid is a copy — bot cannot write back into the Match", () => {
  const match = stubMatch();
  const view = senseArena(match);

  view.grid[0][1] = CELL.SOLID;
  assert.equal(match.grid[0][1], CELL.OPEN, "match grid must stay untouched");
});

test("senseArena rejects a broken grid shape", () => {
  assert.throws(
    () => senseArena({ cols: 2, rows: 2, tile: 1, grid: [[0]] }),
    /rows|width/i
  );
});
