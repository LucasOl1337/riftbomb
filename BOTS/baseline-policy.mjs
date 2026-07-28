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

export function createBaselinePolicy({ profile = "rift", random = Math.random } = {}) {
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
