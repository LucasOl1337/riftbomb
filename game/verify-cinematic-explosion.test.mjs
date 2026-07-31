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
  // V3 palette: hot orange / mid fire / deep red / ember dark (not pale yellow bulk).
  if (r >= 0.85 && g >= 0.55 && b <= 0.9 && g <= 0.95) return true; // microflash white only
  if (r >= 0.45 && g <= 0.45 && b <= 0.12 && r >= g * 1.4) return true; // orange/red fire
  return false;
}

function isDarkMetal(rgb) {
  if (!rgb || rgb.length < 3) return false;
  return luminance(rgb) < 0.2 && rgb[0] < 0.25 && rgb[1] < 0.25 && rgb[2] < 0.28;
}

test("drawExplosion paints multi-phase fire layers without full black bomb shells", async () => {
  const appearance = await loadBombAppearanceAsync();
  const source = await readFile(path.join(gameDirectory, "arena-appearance", "draw-black-bomb.js"), "utf8");
  assert.match(source, /CINEMATIC_EXPLOSION_IMAGINE_V1|CINEMATIC_EXPLOSION_V3/);
  assert.match(source, /CORRIDOR_CROSS_V3|CORRIDOR_CROSS_V2|CORRIDOR_CROSS_V1/);
  assert.match(source, /drawFxPlate|drawFireBar|drawCorridorArm|pickMorph/i);
  assert.match(source, /cardinal|corridor|Bomberman|mapId 8/i);
  assert.match(source, /sparkN|drawCorridorSparks|multi-frame/i);
  assert.match(source, /HOT_ORANGE|MID_FIRE|DEEP_RED/);
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
      { r: 5, c: 6, core: true, age: phase * 0.72, life: 0.72, source: 1, ownerId: 1, dr: 0, dc: 0 },
      0, 0, 1.2, 0.4, tile
    );
    assert.ok(recorder.calls.length >= 6, `core phase ${phase} must issue draw layers`);
    // EXPLOSION_PARTICLE_HERO_V1: the GPU burst field runs every phase, core mode.
    assert.equal(recorder.bursts.length, 1, `phase ${phase} must emit the GPU particle burst`);
    assert.equal(recorder.bursts[0].core, true, "core blast must use the four-axis burst");
    assert.ok(Math.abs(recorder.bursts[0].phase - phase) < 0.001, "burst receives the blast phase");
    assert.ok(recorder.bursts[0].life >= 0.7, "burst receives the blast life");

    const fireDraws = recorder.calls.filter((call) => isFireColor(call.color) && call.emissive >= 1);
    coreTotals.fireDraws += fireDraws.length;
    // V2: geometric cross uses elongated cubes, not a shock torus.
    coreTotals.shock += recorder.calls.filter((call) =>
      (call.mesh === "cube" || call.mesh === "crystal") && isFireColor(call.color)
    ).length;
    coreTotals.sparks += recorder.calls.filter((call) =>
      call.mesh === "sphere" && isFireColor(call.color) && call.scale && Math.max(...call.scale) < 0.12
    ).length;
    coreTotals.smoke += recorder.calls.filter((call) =>
      call.color && luminance(call.color) < 0.25 && (call.emissive || 0) < 0.1 && call.scale && Math.max(...call.scale) > 0.15
    ).length;

    // CORE_NO_STICKER_V1: the core cell must not draw plate/bar sticker geometry.
    const coreBars = recorder.calls.filter((call) => {
      if (call.mesh !== "cube" || !isFireColor(call.color) || !call.scale) return false;
      const [sx, , sz] = call.scale;
      return Math.max(sx, sz) / Math.max(0.001, Math.min(sx, sz)) >= 1.6;
    });
    assert.equal(coreBars.length, 0, `phase ${phase}: core must not draw heat bed bars (sticker)`);
    // Anti-blocky guard: no large high-alpha fire cubes (that was the sticker look).
    const blocky = recorder.calls.filter((call) =>
      call.mesh === "cube" && isFireColor(call.color)
      && (call.alpha ?? 1) > 0.6 && call.scale && Math.max(...call.scale) >= 0.3
    );
    assert.equal(blocky.length, 0, `phase ${phase} must not draw large opaque fire cubes`);

    // Cardinal sparks offset from origin at peak fire phases
    if (phase >= 0.12 && phase <= 0.55) {
      const offsetFire = recorder.calls.filter((call) => {
        if (!isFireColor(call.color)) return false;
        const [px, , pz] = call.position || [0, 0, 0];
        return Math.hypot(px, pz) > tile * 0.08;
      });
      assert.ok(offsetFire.length >= 4, `phase ${phase} needs cardinal arm fire volumes`);
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

  assert.ok(coreTotals.arms >= 12, "cardinal sparks must appear across fire peak phases");
  assert.ok(coreTotals.sparks >= 8, "dense cardinal sparks must appear");

  // Arm cell path: elongated corridor beam along blast direction
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
  // Arm cells keep the faint elongated heat bed for corridor readability.
  const armBeds = armRecorder.calls.filter((call) => {
    if (call.mesh !== "cube" || !isFireColor(call.color) || !call.scale) return false;
    const [sx, , sz] = call.scale;
    return Math.max(sx, sz) / Math.max(0.001, Math.min(sx, sz)) >= 1.6;
  });
  assert.ok(armBeds.length >= 2, "arm cells must draw the faint corridor heat bed");
  assert.ok(
    armBeds.every((call) => (call.alpha ?? 1) <= 0.35),
    "arm heat bed must stay faint (alpha <= 0.35)"
  );
  const armFire = armRecorder.calls.filter((call) => isFireColor(call.color));
  assert.ok(armFire.length >= 6, "arm cells must draw corridor fire layers");
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

  const colors = particleCalls.map((call) => call.color);
  const hasHot = colors.some((c) => Array.isArray(c) && c[0] >= 0.9 && c[1] <= 0.45 && c[2] <= 0.1);
  const hasMid = colors.some((c) => Array.isArray(c) && c[0] >= 0.8 && c[1] <= 0.3 && c[2] <= 0.08);
  const hasSmoke = colors.some((c) => Array.isArray(c) && c[0] <= 0.15 && c[1] <= 0.15 && c[2] <= 0.15);
  assert.ok(hasHot, "hot orange particle layer required");
  assert.ok(hasMid, "mid fire particle layer required");
  assert.ok(hasSmoke, "smoke particle layer required");
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
  assert.match(duel, /Dense corridor-locked sparks|spawnCorridorParticles/);
  assert.match(duel, /spawnCorridorParticles\(x, 0\.34, z, \[1, 0\.34, 0\.04\]/);
  assert.match(duel, /life: 0\.72/);
  assert.match(duel, /dr: 0, dc: 0, step: 0|core: true, dr: 0, dc: 0/);
});
