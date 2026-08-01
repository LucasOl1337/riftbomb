"use strict";

const RIFTBOMB_BOMB_APPEARANCE = (() => {
  const TAU = Math.PI * 2;
  const BLACK_FORGED = [0.045, 0.052, 0.06];
  const GUNMETAL = [0.14, 0.155, 0.17];
  const FUSE_FIBER = [0.09, 0.095, 0.1];
  // Cinematic fire palette — amber/orange only; NO pure deep-red rim.
  // Marker: CINEMATIC_EXPLOSION_V3 + NO_RED_RIM_V1
  // Deep red on soft additive sprites stacked into a painted red border on
  // the corridor edge — banned. Cool end is dark amber, not blood red.
  const CORE_WHITE = [1, 0.9, 0.78];
  const HOT_ORANGE = [1, 0.38, 0.04];
  const MID_FIRE = [0.95, 0.22, 0.03];
  /** Dark amber (legacy name DEEP_RED kept for tests; not a red rim). */
  const DEEP_RED = [0.48, 0.12, 0.02];
  const EMBER_DARK = [0.36, 0.1, 0.025];
  const SMOKE_DARK = [0.055, 0.055, 0.06];
  const SMOKE_BROWN = [0.11, 0.085, 0.065];
  // Compat aliases (tests / callers)
  const EMBER = HOT_ORANGE;
  const EMBER_CORE = HOT_ORANGE;
  const FIRE = MID_FIRE;
  const FIRE_MID = HOT_ORANGE;
  const FIRE_SOFT = EMBER_DARK;
  const SMOKE = SMOKE_DARK;
  const SMOKE_LIT = SMOKE_BROWN;
  const BOMB_MAP = 7;
  const SHELL_R = 0.36;
  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
  const smoothstep = (low, high, value) => {
    const amount = clamp((value - low) / Math.max(0.0001, high - low));
    return amount * amount * (3 - 2 * amount);
  };
  const hash01 = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  function drawBody(renderer, mesh, position, scale, color, material, emissive, rotation = 0, alpha = 1, rz = 0, rx = 0, mapId = 0) {
    if (mesh === "sphere" && renderer.meshes?.bombSphere) {
      renderer.drawMesh(renderer.meshes.bombSphere, position, scale, color, material, emissive, rotation, alpha, rz, rx, mapId);
      return;
    }
    renderer.draw(mesh, position, scale, color, material, emissive, rotation, alpha, rz, rx, mapId);
  }

  function drawCylinderBetween(renderer, a, b, radius, color, material = 0, emissive = 0) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const length = Math.max(0.001, Math.hypot(dx, dy, dz));
    const midpoint = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5];
    const yaw = Math.atan2(dx, dz);
    const rz = Math.atan2(Math.hypot(dx, dz), dy);
    renderer.draw("cylinder", midpoint, [radius, length * 0.5, radius],
      color, material, emissive, yaw, 1, rz);
  }

  function drawFuse(renderer, x, y, z, heat, time, shellScale) {
    const s = shellScale;
    const points = [
      [x, y + 0.42 * s, z],
      [x + 0.04 * s, y + 0.55 * s, z],
      [x + 0.12 * s, y + 0.64 * s, z],
      [x + 0.2 * s, y + 0.66 * s, z]
    ];
    for (let index = 0; index < points.length - 1; index++) {
      drawCylinderBetween(renderer, points[index], points[index + 1],
        (0.028 - index * 0.002) * s, FUSE_FIBER, 1, 0.03);
    }
    const tip = points.at(-1);
    const flicker = 0.75 + Math.sin(time * (11 + heat * 30)) * 0.2;
    renderer.draw("sphere", tip, [0.048 * s, 0.048 * s, 0.048 * s],
      heat > 0.65 ? CORE_WHITE : HOT_ORANGE, 3, 1.8 + flicker * 1.4 + heat * 2.2);
  }

  function drawArmorPetals(_renderer, _x, _y, _z, _shellR, _time) {
    for (let index = 0; index < 6; index++) {
      void index;
    }
  }

  function drawBomb(renderer, bomb, time, beat, options = {}) {
    const progress = clamp(options.progress ?? bomb.age / Math.max(0.01, bomb.fuse));
    const heat = progress * progress;
    const bodyY = options.review ? 0.72 : (options.bodyY ?? 0.34);
    const x = bomb.x;
    const z = bomb.z;
    const pulse = (options.review ? 1 : options.pulse ?? 0.985 + heat * 0.04);
    const squash = options.squash ?? 0;
    const width = pulse * (1 + squash * 0.35);
    const height = pulse * (1 - squash * 0.45);
    const shellRx = SHELL_R * width;
    const shellRy = SHELL_R * height;
    const shellR = (shellRx + shellRy) * 0.5;

    // ONE clean textured sphere — no stacked petals / dual belts (those read as edges).
    drawBody(renderer, "sphere", [x, bodyY, z],
      [shellRx, shellRy, shellRx],
      BLACK_FORGED, 1, 0.02 + heat * 0.05, time * 0.01, 1, 0, 0, BOMB_MAP);

    renderer.draw("cylinder", [x, bodyY + shellRy * 0.92, z],
      [shellR * 0.22, shellR * 0.08, shellR * 0.22],
      GUNMETAL, 1, 0.06, time * 0.02);

    renderer.draw("sphere", [x, 0.04, z],
      [shellR * 0.78, 0.02, shellR * 0.78],
      [0.02, 0.02, 0.025], 0, 0.01, 0, 0.55);

    drawArmorPetals(renderer, x, bodyY, z, shellR, time);

    if (progress > 0.62) {
      const stress = smoothstep(0.62, 1, progress);
      for (let index = 0; index < 6; index++) {
        const angle = index / 6 * TAU;
        renderer.draw("crystal", [
          x + Math.sin(angle) * shellR * 0.82,
          bodyY + shellR * 0.15,
          z + Math.cos(angle) * shellR * 0.82
        ], [shellR * 0.03, shellR * 0.35 * stress, shellR * 0.03], HOT_ORANGE, 3,
        stress * (1.1 + beat * 1.4), -angle, 0.75);
      }
    }
    drawFuse(renderer, x, bodyY, z, heat, time, shellR / SHELL_R);
  }

  /**
   * CINEMATIC_EXPLOSION_IMAGINE_V1 + CORRIDOR_CROSS_V3 + EXPLOSION_GPU_BURST_V1
   * + EXPLOSION_PARTICLE_HERO_V1
   * Bomberman CROSS = geometry scaffold + dense multi-frame Imagine plates (1024).
   * Multi-layer corridor beams, temporal morph, corridor-locked sparks only.
   * Radial fireball-as-hero is banned.
   */
  function fxMeshName(renderer) {
    return renderer?.meshes?.fxPlate ? "fxPlate" : "skillDisc";
  }

  function drawFxPlate(renderer, texture, x, y, z, scaleX, scaleZ, alpha, emissive, rotation = 0) {
    // EXPLOSION_PARTICLE_HERO_V1: plates are only a faint textured underlay now —
    // at full alpha their rectangular silhouette was the "blocky sticker".
    alpha *= 0.28;
    if (!texture || !renderer?.draw || alpha < 0.02) return;
    const gl = renderer.gl;
    if (gl) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
    }
    renderer.draw(
      fxMeshName(renderer),
      [x, y, z],
      [scaleX, 0.018, scaleZ],
      [1, 1, 1],
      0,
      emissive,
      rotation,
      alpha,
      0,
      0,
      8,
      texture
    );
    if (gl) {
      gl.depthMask(true);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
  }

  function armYaw(dr, dc) {
    if (Math.abs(dc) >= Math.abs(dr)) return 0;
    return Math.PI * 0.5;
  }

  function resolveArmDir(blast) {
    let dr = blast.dr || 0;
    let dc = blast.dc || 0;
    if (!dr && !dc) {
      if (blast.originR != null && blast.r !== blast.originR) dr = Math.sign(blast.r - blast.originR) || 1;
      else dc = Math.sign((blast.c ?? 0) - (blast.originC ?? 0)) || 1;
    }
    return { dr, dc };
  }

  function pickMorph(roles, keys, phase) {
    const list = keys.map((key) => roles?.[key]).filter(Boolean);
    if (!list.length) return { tex: null, next: null, blend: 0 };
    const t = clamp(phase, 0, 0.999);
    const curved = t < 0.15 ? t * 1.4
      : (t < 0.55 ? 0.21 + (t - 0.15) * 1.35 : 0.75 + (t - 0.55) * 0.55);
    const f = curved * list.length;
    const idx = Math.min(list.length - 1, Math.floor(f));
    const blend = f - idx;
    return {
      tex: list[idx],
      next: list[Math.min(list.length - 1, idx + 1)],
      blend
    };
  }

  /**
   * PARTICLES_ONLY_V1 — explosion visual is 100% GPU point sprites.
   * No cubes, heat beds, Imagine plates, mesh sparks, or debris rectangles.
   * Those hard-edged meshes read as the "retângulo" the player keeps reporting.
   */
  function drawCorridorArm(renderer, x, z, tile, dr, dc, phase, life, seed, time) {
    if (typeof renderer?.drawExplosionBurst !== "function") return;
    renderer.drawExplosionBurst(x, z, dr, dc, phase, life, tile, false, seed, time);
  }

  function drawExplosion(renderer, blast, x, z, time, beat, tile) {
    const life = Math.max(0.01, blast.life);
    const phase = clamp(blast.age / life);
    const seed = blast.r * 13.17 + blast.c * 7.31 + (blast.source || 0) * 0.17;

    if (typeof renderer?.drawExplosionBurst !== "function") return;

    if (!blast.core) {
      const { dr, dc } = resolveArmDir(blast);
      drawCorridorArm(renderer, x, z, tile, dr, dc, phase, life, seed, time);
      return;
    }

    // Core cell: four-axis GPU fire + smoke only (no mesh fallback layers).
    renderer.drawExplosionBurst(x, z, 0, 0, phase, life, tile, true, seed, time);
  }

  return Object.freeze({
    colors: Object.freeze({
      BLACK_FORGED, GUNMETAL, FUSE_FIBER,
      CORE_WHITE, HOT_ORANGE, MID_FIRE, DEEP_RED, EMBER_DARK, SMOKE_DARK, SMOKE_BROWN,
      EMBER, EMBER_CORE, FIRE, FIRE_MID, FIRE_SOFT, SMOKE, SMOKE_LIT
    }),
    mapId: BOMB_MAP,
    shellRadius: SHELL_R,
    drawBomb,
    drawExplosion
  });
})();
