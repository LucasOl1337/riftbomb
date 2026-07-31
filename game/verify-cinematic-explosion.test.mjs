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
    draw: record,
    drawMesh(_mesh, position, scale, color, material, emissive, rotation, alpha) {
      record("mesh", position, scale, color, material, emissive, rotation, alpha);
    }
  };
}

function luminance(rgb) {
  if (!rgb || rgb.length < 3) return 0;
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function isFireColor(rgb) {
  if (!rgb || rgb.length < 3) return false;
  // White-hot, orange, or red-orange fire bands used by the shipped palette.
  const [r, g, b] = rgb;
  if (r >= 0.85 && g >= 0.55 && b <= 0.85) return true; // white-gold / soft fire
  if (r >= 0.85 && g >= 0.15 && g <= 0.85 && b <= 0.35) return true; // ember / mid / fire
  return false;
}

function isDarkMetal(rgb) {
  if (!rgb || rgb.length < 3) return false;
  return luminance(rgb) < 0.2 && rgb[0] < 0.25 && rgb[1] < 0.25 && rgb[2] < 0.28;
}

test("drawExplosion paints multi-phase fire layers without full black bomb shells", async () => {
  const appearance = await loadBombAppearanceAsync();
  const source = await readFile(path.join(gameDirectory, "arena-appearance", "draw-black-bomb.js"), "utf8");
  assert.match(source, /CINEMATIC_EXPLOSION_V2/);
  assert.match(source, /fireball shells|Multi-frame fireball/i);
  assert.match(source, /Cardinal flame lanes/i);
  assert.match(source, /Spark cloud/i);
  // drawExplosion body must not call with BOMB_MAP as a mapId argument.
  const explosionFn = source.slice(source.indexOf("function drawExplosion"));
  assert.doesNotMatch(explosionFn, /,\s*BOMB_MAP\s*\)/);
  assert.doesNotMatch(explosionFn, /mapId\s*=\s*BOMB_MAP/);

  const tile = 1.32;
  const phases = [0.05, 0.18, 0.35, 0.55, 0.78];
  const coreTotals = { fireDraws: 0, shock: 0, arms: 0, sparks: 0, smoke: 0, largeDarkSpheres: 0 };

  for (const phase of phases) {
    const recorder = createDrawRecorder();
    appearance.drawExplosion(
      recorder,
      { r: 5, c: 6, core: true, age: phase * 0.58, life: 0.58, source: 1, ownerId: 1 },
      0, 0, 1.2, 0.4, tile
    );
    assert.ok(recorder.calls.length >= 12, `core phase ${phase} must issue many draw layers`);

    const fireDraws = recorder.calls.filter((call) => isFireColor(call.color) && call.emissive >= 1);
    coreTotals.fireDraws += fireDraws.length;
    coreTotals.shock += recorder.calls.filter((call) => call.mesh === "torus" && isFireColor(call.color)).length;
    coreTotals.sparks += recorder.calls.filter((call) =>
      call.mesh === "sphere" && isFireColor(call.color) && call.scale && Math.max(...call.scale) < 0.12
    ).length;
    coreTotals.smoke += recorder.calls.filter((call) =>
      call.color && luminance(call.color) < 0.25 && (call.emissive || 0) < 0.1 && call.scale && Math.max(...call.scale) > 0.15
    ).length;

    // Cardinal arms: fire draws offset on +X/-X/+Z/-Z at peak fire phases
    if (phase >= 0.12 && phase <= 0.55) {
      const offsetFire = fireDraws.filter((call) => {
        const [px, , pz] = call.position || [0, 0, 0];
        return Math.hypot(px, pz) > tile * 0.15;
      });
      assert.ok(offsetFire.length >= 8, `phase ${phase} needs cardinal arm fire volumes`);
      coreTotals.arms += offsetFire.length;
    }

    // No bomb-sized solid dark shells (smoke is dark but translucent / soft).
    const largeDarkSpheres = recorder.calls.filter((call) => {
      if (call.mesh !== "sphere" && call.mesh !== "mesh") return false;
      if (!isDarkMetal(call.color)) return false;
      const maxScale = call.scale ? Math.max(...call.scale) : 0;
      const minScale = call.scale ? Math.min(...call.scale) : 0;
      const spherical = maxScale > 0 && minScale / maxScale > 0.72;
      const solid = (call.alpha ?? 1) > 0.85;
      return maxScale >= 0.28 && spherical && solid && (call.emissive || 0) < 0.35;
    });
    coreTotals.largeDarkSpheres += largeDarkSpheres.length;
    assert.equal(largeDarkSpheres.length, 0, `phase ${phase} must not redraw full black bomb shells`);
  }

  assert.ok(coreTotals.fireDraws >= 40, "multi-phase core must accumulate many fire draws");
  assert.ok(coreTotals.shock >= 1, "shock ring must appear in the sequence");
  assert.ok(coreTotals.arms >= 16, "cardinal arms must appear across fire peak phases");
  assert.ok(coreTotals.sparks >= 8, "spark cloud must appear");

  // Arm cell path: fire lane only, still multi-layer
  const armRecorder = createDrawRecorder();
  appearance.drawExplosion(
    armRecorder,
    { r: 5, c: 7, core: false, age: 0.2 * 0.58, life: 0.58, source: 1, ownerId: 1 },
    tile, 0, 1.0, 0.3, tile
  );
  const armFire = armRecorder.calls.filter((call) => isFireColor(call.color));
  assert.ok(armFire.length >= 4, "arm cells must draw multi-layer fire frames");
  assert.equal(
    armRecorder.calls.filter((call) => isDarkMetal(call.color) && call.scale && Math.max(...call.scale) >= 0.28).length,
    0,
    "arm cells must not draw bomb shells"
  );
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
  const renderer = {
    mobilePerf: false,
    addShock() {},
    cameraShake: 0
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
  game.destroyBreakable = () => false;
  game.playExplosionAt = (...args) => sfxCalls.push(["playExplosionAt", ...args]);

  const originalSpawn = game.spawnParticles.bind(game);
  game.spawnParticles = (x, y, z, color, count, life, size) => {
    particleCalls.push({ x, y, z, color, count, life, size });
    return originalSpawn(x, y, z, color, count, life, size);
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
  assert.ok(particleCalls.length >= 4, "core detonation must issue multi-layer particle bursts");

  const colors = particleCalls.map((call) => call.color);
  const hasWhiteGold = colors.some((c) => Array.isArray(c) && c[0] >= 0.9 && c[1] >= 0.7);
  const hasEmber = colors.some((c) => Array.isArray(c) && c[0] >= 0.8 && c[1] <= 0.6);
  const hasGold = colors.some((c) => Array.isArray(c) && c[0] >= 0.8 && c[1] >= 0.5 && c[1] <= 0.9);
  const hasSmoke = colors.some((c) => Array.isArray(c) && c[0] <= 0.2 && c[1] <= 0.2 && c[2] <= 0.2);
  assert.ok(hasWhiteGold, "white-hot core particle layer required");
  assert.ok(hasEmber, "ember particle layer required");
  assert.ok(hasGold, "gold/fire mid particle layer required");
  assert.ok(hasSmoke, "smoke particle layer required");

  const coreBurstCount = particleCalls
    .filter((call) => Math.hypot(call.x - bx, call.z - bz) < 0.01)
    .reduce((sum, call) => sum + call.count, 0);
  assert.ok(coreBurstCount >= 36 + 42 + 28 + 18 - 5, "core must request dense multi-layer counts");
  assert.ok(game.particles.length > 20, "real spawnParticles must enqueue particles on the match array");
});

test("live renderer still routes blasts through RIFTBOMB_BOMB_APPEARANCE.drawExplosion", async () => {
  const renderer = await readFile(path.join(gameDirectory, "draw-bomber-rift.js"), "utf8");
  const duel = await readFile(path.join(gameDirectory, "run-champion-bomb-duel.js"), "utf8");
  assert.match(renderer, /RIFTBOMB_BOMB_APPEARANCE\.drawExplosion\(this, blast/);
  assert.match(duel, /Multi-layer fire particle bursts/);
  assert.match(duel, /spawnParticles\(x, 0\.38, z, Renderer\.colors\.whiteGold/);
  assert.match(duel, /spawnParticles\(x, 0\.28, z, Renderer\.colors\.ember/);
  assert.match(duel, /spawnParticles\(x, 0\.48, z, \[0\.12, 0\.12, 0\.13\]/);
});
