/**
 * Unit tests for the shipped cinematic arena-bomb explosion path.
 * Drives real RIFTBOMB_BOMB_APPEARANCE.drawExplosion + Game.explodeBomb
 * (not a reimplementation).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const gameDirectory = path.dirname(fileURLToPath(import.meta.url));

async function loadBombAppearanceAsync() {
  const source = await readFile(path.join(gameDirectory, "arena-appearance", "draw-black-bomb.js"), "utf8");
  const context = vm.createContext({ Math, console });
  // Classic script uses top-level const; re-export onto the context object for the test harness.
  vm.runInContext(`${source}\n;globalThis.RIFTBOMB_BOMB_APPEARANCE = RIFTBOMB_BOMB_APPEARANCE;`, context);
  assert.ok(context.RIFTBOMB_BOMB_APPEARANCE?.drawExplosion, "shipped appearance must export drawExplosion");
  return context.RIFTBOMB_BOMB_APPEARANCE;
}

function createDrawRecorder() {
  const calls = [];
  const bursts = [];
  const record = (mesh, position, scale, color, material, emissive, rotation = 0, alpha = 1) => {
    calls.push({
      mesh,
      position: position ? [...position] : null,
      scale: scale ? [...scale] : null,
      color: color ? [...color] : null,
      material,
      emissive,
      rotation,
      alpha
    });
  };
  return {
    calls,
    bursts,
    draw: record,
    drawMesh(_mesh, position, scale, color, material, emissive, rotation, alpha) {
      record("mesh", position, scale, color, material, emissive, rotation, alpha);
    },
    drawExplosionBurst(x, z, dr, dc, phase, life, tile, core, seed, time) {
      bursts.push({ x, z, dr, dc, phase, life, tile, core, seed, time });
    }
  };
}

function luminance(rgb) {
  if (!rgb || rgb.length < 3) return 0;
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function isFireColor(rgb) {
  if (!rgb || rgb.length < 3) return false;
  const [r, g, b] = rgb;
  // V3 + NO_RED_RIM_V1: hot orange / mid fire / dark amber (not pure blood red).
  if (r >= 0.85 && g >= 0.55 && b <= 0.9 && g <= 0.95) return true; // microflash white only
  if (r >= 0.32 && g <= 0.5 && b <= 0.14 && r >= g * 1.2 && g >= 0.05) return true; // amber/orange
  return false;
}

function isDarkMetal(rgb) {
  if (!rgb || rgb.length < 3) return false;
  return luminance(rgb) < 0.2 && rgb[0] < 0.25 && rgb[1] < 0.25 && rgb[2] < 0.28;
}

test("drawExplosion is 100% GPU particles — no mesh rectangles (PARTICLES_ONLY_V1)", async () => {
  const appearance = await loadBombAppearanceAsync();
  const source = await readFile(path.join(gameDirectory, "arena-appearance", "draw-black-bomb.js"), "utf8");
  assert.match(source, /PARTICLES_ONLY_V1/);
  assert.match(source, /drawExplosionBurst/);
  assert.match(source, /NO_RED_RIM_V1/);
  const explosionFn = source.slice(source.indexOf("function drawExplosion"));
  assert.doesNotMatch(explosionFn, /draw\("cube"/);
  assert.doesNotMatch(explosionFn, /draw\("sphere"/);
  assert.doesNotMatch(explosionFn, /drawFireBar|drawFxPlate|drawCorridorSparks/);
  assert.doesNotMatch(explosionFn, /,\s*BOMB_MAP\s*\)/);

  const tile = 1.32;
  const phases = [0.05, 0.18, 0.35, 0.55, 0.78];

  for (const phase of phases) {
    const recorder = createDrawRecorder();
    appearance.drawExplosion(
      recorder,
      { r: 5, c: 6, core: true, age: phase * 0.72, life: 0.72, source: 1, ownerId: 1, dr: 0, dc: 0 },
      0, 0, 1.2, 0.4, tile
    );
    assert.equal(recorder.bursts.length, 1, `phase ${phase} must emit the GPU particle burst`);
    assert.equal(recorder.bursts[0].core, true, "core blast must use the four-axis burst");
    assert.ok(Math.abs(recorder.bursts[0].phase - phase) < 0.001, "burst receives the blast phase");
    assert.ok(recorder.bursts[0].life >= 0.7, "burst receives the blast life");
    // Zero mesh draws — particles only.
    assert.equal(recorder.calls.length, 0, `phase ${phase}: no cube/sphere/plate mesh draws`);
  }

  const armRecorder = createDrawRecorder();
  appearance.drawExplosion(
    armRecorder,
    { r: 5, c: 7, core: false, dr: 0, dc: 1, step: 1, age: 0.2 * 0.72, life: 0.72, source: 1, ownerId: 1 },
    tile, 0, 1.0, 0.3, tile
  );
  assert.equal(armRecorder.bursts.length, 1, "arm cell must emit the GPU particle burst");
  assert.equal(armRecorder.bursts[0].core, false, "arm burst stays single-axis");
  assert.ok(armRecorder.bursts[0].dr === 0 && armRecorder.bursts[0].dc === 1,
    "arm burst receives the corridor direction");
  assert.equal(armRecorder.calls.length, 0, "arm cell must not draw mesh heat beds or plates");
});

async function loadGameClass() {
  const rulesSource = await readFile(path.join(gameDirectory, "run-champion-bomb-duel.js"), "utf8");
  const combatSource = await readFile(path.join(gameDirectory, "apply-combat-rules.js"), "utf8").catch(() => "");
  const context = vm.createContext({
    console,
    Math,
    performance: { now: () => 0 },
    setTimeout,
    clearTimeout,
    Renderer: {
      colors: {
        whiteGold: [1, 0.94, 0.72],
        gold: [1, 0.75, 0.2],
        ember: [1, 0.35, 0.05],
        katCrimson: [0.8, 0.1, 0.15],
        arenaStone: [0.3, 0.3, 0.32]
      }
    },
    RIFTBOMB_BOTS: undefined,
    globalThis: {}
  });
  context.globalThis = context;
  // Combat installer is optional for explodeBomb particle path
  if (combatSource.includes("installRiftbombCombatRules")) {
    try {
      vm.runInContext(combatSource, context);
    } catch {
      /* explodeBomb still works without full combat install if damage is stubbed */
    }
  }
  vm.runInContext(`
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const lerp = (a, b, t) => a + (b - a) * t;
    const TAU = Math.PI * 2;
    ${rulesSource}
    globalThis.GameForTest = Game;
  `, context);
  return context.GameForTest;
}

test("explodeBomb emits multi-layer fire/smoke particles on the real match path", async () => {
  const Game = await loadGameClass();
  const particleCalls = [];
  const sfxCalls = [];
  let shockCalls = 0;
  const renderer = {
    mobilePerf: false,
    shocks: [],
    addShock() { shockCalls += 1; },
    addImpact(strength = 1) {
      this.cameraShake = Math.max(this.cameraShake || 0, strength * 0.44);
      this.hitPulse = Math.max(this.hitPulse || 0, strength);
    },
    cameraShake: 0,
    hitPulse: 0
  };
  const sfx = {
    emitGameEvent() { return false; },
    effect() {},
    explosion(...args) { sfxCalls.push(args); }
  };
  const presentation = {
    prepareRound() {},
    announce() {},
    update() {},
    selectChampion() {}
  };

  const game = new Game(renderer, sfx, presentation);
  game.mode = "playing";
  // Open center cells so the blast can expand a bit
  for (let r = 1; r < game.rows - 1; r++) {
    for (let c = 1; c < game.cols - 1; c++) {
      game.grid[r][c] = 0;
    }
  }
  game.damageAtCells = () => {};
  const realDestroyBreakable = game.destroyBreakable.bind(game);
  game.destroyBreakable = () => false;
  game.playExplosionAt = (...args) => sfxCalls.push(["playExplosionAt", ...args]);

  const originalCorridor = game.spawnCorridorParticles.bind(game);
  game.spawnCorridorParticles = (x, y, z, color, count, life, size, dr, dc, core) => {
    particleCalls.push({ x, y, z, color, count, life, size, dr, dc, core });
    return originalCorridor(x, y, z, color, count, life, size, dr, dc, core);
  };

  const [bx, bz] = game.worldFromCell(5, 6);
  const bomb = {
    id: 99,
    r: 5,
    c: 6,
    x: bx,
    z: bz,
    age: 2.35,
    fuse: 2.35,
    range: 2,
    ownerId: 1,
    exploded: false
  };
  game.bombs = [bomb];
  game.explodeBomb(bomb);

  assert.equal(bomb.exploded, true);
  assert.ok(game.blasts.length >= 1, "blast cells must spawn");
  assert.ok(game.blasts.some((blast) => blast.core), "core blast cell required");
  assert.ok(game.blasts.some((blast) => !blast.core && (blast.dr || blast.dc)), "arm cells carry corridor direction");
  assert.ok(particleCalls.length >= 5, "core detonation must issue multi-layer corridor particle bursts");
  assert.equal(shockCalls, 0, "bomb detonation must not spawn the circular post-process shock ring");
  assert.ok(renderer.cameraShake > 0 || renderer.hitPulse > 0, "bomb still kicks the camera without the ring");

  // Crate cells broken by the same blast must also stay ring-free (this was the
  // residual gold halo still visible after the bomb path itself was fixed).
  shockCalls = 0;
  renderer.cameraShake = 0;
  renderer.hitPulse = 0;
  game.grid[5][7] = 2;
  game.destroyBreakable = realDestroyBreakable;
  game.rollCrateDrop = () => {};
  assert.equal(game.destroyBreakable(5, 7, [1, 0, 0], 1), true);
  assert.equal(shockCalls, 0, "crate break must not spawn the circular post-process shock ring");
  assert.ok(renderer.cameraShake > 0 || renderer.hitPulse > 0, "crate break still kicks the camera");

  const colors = particleCalls.map((call) => call.color);
  const hasHot = colors.some((c) => Array.isArray(c) && c[0] >= 0.9 && c[1] <= 0.5 && c[2] <= 0.12);
  const hasMid = colors.some((c) => Array.isArray(c) && c[0] >= 0.55 && c[1] <= 0.35 && c[2] <= 0.1 && c[1] >= 0.1);
  const hasSmoke = colors.some((c) => Array.isArray(c) && c[0] <= 0.15 && c[1] <= 0.15 && c[2] <= 0.15);
  // NO_RED_RIM_V1: no pure deep-red particle layer (g nearly 0, high r).
  const hasBloodRed = colors.some((c) => Array.isArray(c) && c[0] >= 0.45 && c[1] <= 0.08 && c[2] <= 0.04);
  assert.ok(hasHot, "hot orange particle layer required");
  assert.ok(hasMid, "mid amber/fire particle layer required");
  assert.ok(hasSmoke, "smoke particle layer required");
  assert.equal(hasBloodRed, false, "explosion particles must not use pure deep-red rim colors");
  assert.ok(particleCalls.some((call) => call.core === true), "core uses corridor-locked particle spawn");
  const coreCounts = particleCalls.filter((call) => call.core).reduce((s, c) => s + c.count, 0);
  assert.ok(coreCounts >= 100, "core corridor particles are dense");
  assert.ok(game.particles.length > 40, "real spawnCorridorParticles must enqueue many particles");
  assert.ok(game.blasts.every((b) => b.life >= 0.7), "blast life extended for multi-frame morph");

  // Velocities must stay near cardinal axes (not isotropic radial).
  const offAxis = game.particles.filter((p) => {
    const ax = Math.abs(p.vx);
    const az = Math.abs(p.vz);
    const major = Math.max(ax, az);
    const minor = Math.min(ax, az);
    return major > 0.2 && minor / major > 0.65;
  });
  assert.ok(offAxis.length / Math.max(1, game.particles.length) < 0.35, "most sparks stay corridor-aligned");
});

test("blast hitbox cells match visual cells for the full blast life (HITBOX_VISUAL_MATCH_V1)", async () => {
  const Game = await loadGameClass();
  const renderer = {
    mobilePerf: false,
    addShock() {},
    addImpact() {},
    cameraShake: 0,
    hitPulse: 0
  };
  const game = new Game(renderer, {
    emitGameEvent() { return false; },
    effect() {},
    explosion() {}
  }, {
    prepareRound() {},
    announce() {},
    update() {},
    selectChampion() {},
    finish() {}
  });
  game.mode = "playing";
  for (let r = 1; r < game.rows - 1; r++) {
    for (let c = 1; c < game.cols - 1; c++) game.grid[r][c] = 0;
  }
  game.destroyBreakable = () => false;
  game.playExplosionAt = () => {};

  // Open lane: bomb at (5,6) range 2 east reaches (5,7)(5,8)
  const [bx, bz] = game.worldFromCell(5, 6);
  const bomb = {
    id: 7, r: 5, c: 6, x: bx, z: bz,
    age: 2.35, fuse: 2.35, range: 2, ownerId: 1, exploded: false
  };
  game.bombs = [bomb];
  game.players = [
    { id: 1, name: "P1", alive: true, x: bx, z: bz, invulnerable: 0, dashing: 0, shield: 0, health: 100 },
    {
      id: 2, name: "P2", alive: true,
      // Safe cell at detonation (off the cross), then walks into a live arm.
      ...(() => {
        const [x, z] = game.worldFromCell(3, 3);
        return { x, z };
      })(),
      invulnerable: 0, dashing: 0, shield: 0, health: 100
    }
  ];
  game.hitContestant = function (player) {
    player.alive = false;
    player.health = 0;
  };

  game.explodeBomb(bomb);
  assert.equal(game.players[0].alive, false, "occupant of core cell dies at detonation");
  assert.equal(game.players[1].alive, true, "player outside blast is safe at detonation");
  assert.ok(game.blasts.some((b) => b.r === 5 && b.c === 7), "arm cell is a visual blast");
  assert.ok(game.blasts.every((b) => b.life === 0.72), "visual life is the hitbox window");

  // Mid-life: walk into an arm cell that is still drawing fire.
  const [armX, armZ] = game.worldFromCell(5, 7);
  game.players[1].x = armX;
  game.players[1].z = armZ;
  game.players[1].alive = true;
  game.players[1].health = 100;
  game.applyActiveBlastDamage();
  assert.equal(game.players[1].alive, false, "walking into live blast cell kills (visual==hitbox)");

  // After blasts expire, same cell is safe.
  game.blasts = [];
  game.players[1].alive = true;
  game.players[1].health = 100;
  game.players[1].x = armX;
  game.players[1].z = armZ;
  game.applyActiveBlastDamage();
  assert.equal(game.players[1].alive, true, "no damage when blasts are gone from the board");
});

test("GPU burst particles are clamped to the blast cell footprint", async () => {
  const renderer = await readFile(path.join(gameDirectory, "draw-bomber-rift.js"), "utf8");
  assert.match(renderer, /HITBOX_VISUAL_MATCH_V1/);
  assert.match(renderer, /half = uTile \* 0\.49/);
  assert.match(renderer, /clamp\(pos\.x, uOrigin\.x - half, uOrigin\.x \+ half\)/);
  assert.match(renderer, /sheetAlong = \(r1 - 0\.5\) \* 0\.96/);
  assert.doesNotMatch(renderer, /sheetAlong = \(r1 - 0\.5\) \* 1\.04/);
});

test("GPU burst fire ramp bans pure deep-red cool tails (NO_RED_RIM_V1)", async () => {
  const renderer = await readFile(path.join(gameDirectory, "draw-bomber-rift.js"), "utf8");
  assert.match(renderer, /NO_RED_RIM_V1/);
  assert.match(renderer, /0\.55,\s*0\.14,\s*0\.02/, "cool fire end must be dark amber");
  assert.doesNotMatch(
    renderer,
    /mix\(vec3\(0\.42,\s*0\.05,\s*0\.008\)/,
    "legacy deep-red cool tail must stay gone"
  );
  assert.match(renderer, /body\.r = min\(body\.r, body\.g \* 2\.35/, "fragment must clamp red fringe");
});

test("live renderer still routes blasts through RIFTBOMB_BOMB_APPEARANCE.drawExplosion", async () => {
  const renderer = await readFile(path.join(gameDirectory, "draw-bomber-rift.js"), "utf8");
  const duel = await readFile(path.join(gameDirectory, "run-champion-bomb-duel.js"), "utf8");
  const document = await readFile(path.join(gameDirectory, "play-riftbomb.html"), "utf8");
  const frames = await readFile(path.join(gameDirectory, "arena-appearance", "load-explosion-frames.js"), "utf8");
  assert.match(renderer, /RIFTBOMB_BOMB_APPEARANCE\.drawExplosion\(this, blast/);
  assert.match(renderer, /EXPLOSION_GPU_BURST_V1/);
  assert.match(renderer, /drawExplosionBurst/);
  assert.match(renderer, /Renderer\.burstVertex/);
  assert.match(renderer, /gl\.POINTS/);
  assert.match(renderer, /ensureExplosionTextures/);
  assert.match(renderer, /fxPlate|buildFxPlate/);
  assert.match(renderer, /explosionRoleTextures|sequence/);
  assert.match(renderer, /uMapId > 7\.5 && uMapId < 8\.5/);
  assert.doesNotMatch(renderer, /teamGlow|blueSide.*bomb|landRing/);
  assert.match(document, /load-explosion-frames\.js/);
  assert.match(frames, /CINEMATIC_EXPLOSION_IMAGINE_V1/);
  assert.match(frames, /CORRIDOR_CROSS_V3|CORRIDOR_CROSS_V2|CORRIDOR_CROSS_V1/);
  assert.match(frames, /armCorridor|coreCross|armPeak|corePeak/);
  assert.match(frames, /data:image\/webp;base64,/);
  assert.ok((frames.match(/data:image\/webp;base64,/g) || []).length >= 8);
  assert.match(duel, /Dense corridor-locked sparks|spawnCorridorParticles|NO_RED_RIM_V1/);
  assert.match(duel, /NO_RED_RIM_V1/);
  assert.match(duel, /spawnCorridorParticles\(x, 0\.34, z, \[1, 0\.38, 0\.05\]/);
  assert.doesNotMatch(duel, /spawnCorridorParticles\([^)]*\[0\.55, 0\.06, 0\.01\]/);
  assert.match(duel, /life: 0\.72/);
  assert.match(duel, /dr: 0, dc: 0, step: 0|core: true, dr: 0, dc: 0/);
});
