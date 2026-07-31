"use strict";

const RIFTBOMB_BOMB_APPEARANCE = (() => {
  const TAU = Math.PI * 2;
  const BLACK_FORGED = [0.045, 0.052, 0.06];
  const GUNMETAL = [0.14, 0.155, 0.17];
  const FUSE_FIBER = [0.09, 0.095, 0.1];
  // Cinematic fire palette — saturated, dark smoke; white only for microflash.
  // Marker: CINEMATIC_EXPLOSION_V3
  const CORE_WHITE = [1, 0.9, 0.78];
  const HOT_ORANGE = [1, 0.32, 0.03];
  const MID_FIRE = [0.92, 0.16, 0.015];
  const DEEP_RED = [0.52, 0.05, 0.01];
  const EMBER_DARK = [0.32, 0.07, 0.02];
  const SMOKE_DARK = [0.055, 0.055, 0.06];
  const SMOKE_BROWN = [0.11, 0.085, 0.065];
  // Compat aliases (tests / callers)
  const EMBER = HOT_ORANGE;
  const EMBER_CORE = HOT_ORANGE;
  const FIRE = MID_FIRE;
  const FIRE_MID = HOT_ORANGE;
  const FIRE_SOFT = DEEP_RED;
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
   * Bomberman CROSS = geometry scaffold + dense multi-frame Imagine plates (1024).
   * Multi-layer corridor beams, temporal morph, corridor-locked sparks only.
   * Radial fireball-as-hero is banned.
   */
  function fxMeshName(renderer) {
    return renderer?.meshes?.fxPlate ? "fxPlate" : "skillDisc";
  }

  function drawFxPlate(renderer, texture, x, y, z, scaleX, scaleZ, alpha, emissive, rotation = 0) {
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

  function drawFireBar(renderer, x, z, alongWorldX, halfLen, halfWidth, y, rise, alpha, em, phase, seed) {
    if (alpha < 0.04) return;
    const hx = alongWorldX ? halfLen : halfWidth;
    const hz = alongWorldX ? halfWidth : halfLen;
    const flicker = 0.9 + Math.sin(seed * 11 + phase * 18) * 0.1;
    renderer.draw("cube", [x, y, z],
      [hx, rise * 0.5, hz],
      DEEP_RED, 4, em * 0.7 * flicker, 0, alpha * 0.8);
    renderer.draw("cube", [x, y + rise * 0.07, z],
      [hx * 0.82, rise * 0.68, hz * 0.74],
      MID_FIRE, 4, em * flicker, 0, alpha);
    renderer.draw("cube", [x, y + rise * 0.12, z],
      [hx * 0.5, rise * 0.58, hz * 0.42],
      HOT_ORANGE, 4, em * 1.2 * flicker, 0, alpha * 0.95);
    renderer.draw("cube", [x, y + rise * 0.16, z],
      [hx * 0.22, rise * 0.4, hz * 0.2],
      CORE_WHITE, 4, em * 1.55 * flicker, 0, alpha * (0.45 + flicker * 0.25));
    const tipN = 10;
    for (let i = 0; i < tipN; i++) {
      const u = (i + 0.5) / tipN - 0.5;
      const wobble = Math.sin(phase * 22 + seed + i * 1.7) * halfWidth * 0.35;
      const ox = alongWorldX ? u * halfLen * 1.85 : wobble + (hash01(seed + i) - 0.5) * halfWidth * 0.5;
      const oz = alongWorldX ? wobble + (hash01(seed + i * 3) - 0.5) * halfWidth * 0.5 : u * halfLen * 1.85;
      const tipA = alpha * (0.5 + (1 - Math.abs(u) * 1.2) * 0.45);
      if (tipA < 0.05) continue;
      const h = rise * (0.55 + (1 - Math.abs(u)) * 0.7 + hash01(seed + i * 5) * 0.25);
      renderer.draw("crystal",
        [x + ox, y + rise * 0.45 + h * 0.25, z + oz],
        [halfWidth * (0.22 + (i % 3) * 0.06), h, halfWidth * (0.22 + (i % 3) * 0.06)],
        i % 3 === 0 ? HOT_ORANGE : (i % 3 === 1 ? MID_FIRE : DEEP_RED),
        3, em * (1.05 + (i % 2) * 0.15), seed + i + phase * 4, tipA);
    }
  }

  function drawCorridorSparks(renderer, x, z, alongWorldX, tile, halfWidth, phase, energy, seed, time, count) {
    const pSparks = smoothstep(0.02, 0.15, phase) * (1 - smoothstep(0.55, 0.95, phase));
    for (let index = 0; index < count; index++) {
      const u = (index / Math.max(1, count - 1) - 0.5) * tile * 1.05;
      const side = (hash01(seed + index) - 0.5) * halfWidth * 2.2;
      const px = alongWorldX ? x + u : x + side;
      const pz = alongWorldX ? z + side : z + u;
      const a = pSparks * energy * (0.55 + hash01(seed + index * 7) * 0.45);
      if (a < 0.04) continue;
      const sr = 0.012 + (index % 5) * 0.006;
      const col = index % 4 === 0 ? CORE_WHITE
        : (index % 4 === 1 ? HOT_ORANGE : (index % 4 === 2 ? MID_FIRE : DEEP_RED));
      renderer.draw("sphere",
        [px, 0.12 + hash01(seed + index * 2) * 0.32 * (1 - phase * 0.4), pz],
        [sr, sr, sr], col, 3, 1.25 * a, -time * 7 - index, a);
    }
  }

  function drawCorridorArm(renderer, roles, x, z, tile, dr, dc, phase, energy, pPeak, pFlash, seed, time, life = 0.72) {
    const alongWorldX = Math.abs(dc) >= Math.abs(dr);
    const halfLen = tile * (0.58 + pPeak * 0.05 + pFlash * 0.04);
    const halfWidth = tile * (0.24 + pPeak * 0.07 + pFlash * 0.04);
    const y = 0.09 + pFlash * 0.03;
    const rise = tile * (0.2 + pPeak * 0.1 + pFlash * 0.06);
    const alpha = (0.9 + pPeak * 0.1) * energy;
    const em = 1.2 + pPeak * 1.0 + pFlash * 0.55;
    const yaw = armYaw(dr, dc);

    drawFireBar(renderer, x, z, alongWorldX, halfLen, halfWidth, y, rise, alpha, em, phase, seed);

    const morph = pickMorph(roles, ["armCorridor", "armPeak", "armCorridor", "crossLate"], phase);
    if (morph.tex) {
      drawFxPlate(renderer, morph.tex, x, y + rise * 0.28, z,
        halfLen * 1.05, halfWidth * 1.45, alpha * 0.82, em * 0.95, yaw);
      if (morph.next && morph.blend > 0.08) {
        drawFxPlate(renderer, morph.next, x, y + rise * 0.32, z,
          halfLen * (1.02 + morph.blend * 0.06), halfWidth * (1.4 + morph.blend * 0.08),
          alpha * morph.blend * 0.7, em * 0.9, yaw + 0.01);
      }
      drawFxPlate(renderer, morph.tex, x, y + rise * 0.42, z,
        halfLen * 0.92, halfWidth * 1.1, alpha * 0.45 * (1 - phase * 0.3), em * 0.8, yaw + seed * 0.02);
    }

    drawCorridorSparks(renderer, x, z, alongWorldX, tile, halfWidth, phase, energy, seed, time, 16);
    drawCorridorSparks(renderer, x, z, alongWorldX, tile * 0.9, halfWidth * 0.7, phase, energy * 0.7, seed + 9, time, 10);

    // EXPLOSION_GPU_BURST_V1: dense smoke + fire point field along this corridor.
    if (typeof renderer?.drawExplosionBurst === "function") {
      renderer.drawExplosionBurst(x, z, dr, dc, phase, life, tile, false, seed, time);
    }
  }

  function drawExplosion(renderer, blast, x, z, time, beat, tile) {
    const life = Math.max(0.01, blast.life);
    const phase = clamp(blast.age / life);
    const energy = 1 - phase;
    const seed = blast.r * 13.17 + blast.c * 7.31 + (blast.source || 0) * 0.17;
    const pFlash = 1 - smoothstep(0.0, 0.1, phase);
    const pPeak = smoothstep(0.05, 0.22, phase) * (1 - smoothstep(0.38, 0.85, phase));
    const pSparks = smoothstep(0.02, 0.15, phase) * (1 - smoothstep(0.55, 0.95, phase));
    const pSmoke = smoothstep(0.45, 0.65, phase) * (1 - smoothstep(0.85, 1, phase));

    const roles = renderer?.explosionRoleTextures || {};
    const plateY = 0.08 + pFlash * 0.03;
    const plateAlpha = (0.82 + pPeak * 0.18) * energy;
    const plateEm = 0.95 + pPeak * 0.75 + pFlash * 0.45;

    if (!blast.core) {
      const { dr, dc } = resolveArmDir(blast);
      drawCorridorArm(renderer, roles, x, z, tile, dr, dc, phase, energy, pPeak, pFlash, seed, time, life);
      return;
    }

    const barHalfLen = tile * (0.54 + pPeak * 0.07 + pFlash * 0.05);
    const barHalfWidth = tile * (0.22 + pPeak * 0.06);
    const rise = tile * (0.22 + pPeak * 0.12 + pFlash * 0.07);
    const alpha = (0.92 + pPeak * 0.08) * energy;
    const em = 1.35 + pPeak * 0.95 + pFlash * 0.6;

    drawFireBar(renderer, x, z, true, barHalfLen, barHalfWidth, plateY, rise, alpha, em, phase, seed);
    drawFireBar(renderer, x, z, false, barHalfLen, barHalfWidth, plateY + 0.012, rise * 0.98, alpha, em, phase, seed + 1.7);

    // EXPLOSION_GPU_BURST_V1: dense smoke + fire point field on the four axes.
    if (typeof renderer?.drawExplosionBurst === "function") {
      renderer.drawExplosionBurst(x, z, 0, 0, phase, life, tile, true, seed, time);
    }

    renderer.draw("cube", [x, plateY + rise * 0.18, z],
      [tile * 0.24, rise * 0.75, tile * 0.24],
      HOT_ORANGE, 4, em * 1.4, time * 2, alpha);
    renderer.draw("cube", [x, plateY + rise * 0.26, z],
      [tile * 0.14, rise * 0.5, tile * 0.14],
      CORE_WHITE, 4, em * 1.75, 0, alpha * (0.55 + pFlash * 0.4));

    const coreMorph = pickMorph(roles,
      ["ignition", "coreCross", "corePeak", "crossMid", "crossLate", "smoke"], phase);
    if (coreMorph.tex) {
      const coreHalf = tile * (0.52 + pPeak * 0.08 + pFlash * 0.05);
      drawFxPlate(renderer, coreMorph.tex, x, plateY + rise * 0.38, z,
        coreHalf, coreHalf, plateAlpha * 0.85, plateEm, 0);
      if (coreMorph.next && coreMorph.blend > 0.06) {
        drawFxPlate(renderer, coreMorph.next, x, plateY + rise * 0.42, z,
          coreHalf * (1.03 + coreMorph.blend * 0.05), coreHalf * (1.03 + coreMorph.blend * 0.05),
          plateAlpha * coreMorph.blend * 0.75, plateEm * 0.95, 0.02);
      }
      if (phase < 0.7) {
        drawFxPlate(renderer, coreMorph.tex, x, plateY + rise * 0.48, z,
          coreHalf * 0.62, coreHalf * 0.62, plateAlpha * 0.4 * (1 - pSmoke), plateEm * 0.85, Math.PI * 0.25);
      }
    }

    const armMorph = pickMorph(roles, ["armCorridor", "armPeak", "armCorridor"], phase);
    const stubDirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    if (armMorph.tex) {
      for (const [dr, dc] of stubDirs) {
        const yaw = armYaw(dr, dc);
        const ox = dc * tile * 0.4;
        const oz = dr * tile * 0.4;
        drawFxPlate(renderer, armMorph.tex, x + ox, plateY + rise * 0.3, z + oz,
          tile * 0.42, tile * 0.28, plateAlpha * 0.75, plateEm * 0.95, yaw);
        if (armMorph.next && armMorph.blend > 0.1) {
          drawFxPlate(renderer, armMorph.next, x + ox, plateY + rise * 0.34, z + oz,
            tile * 0.4, tile * 0.26, plateAlpha * armMorph.blend * 0.55, plateEm * 0.85, yaw);
        }
      }
    }

    const sparkN = 36;
    for (let index = 0; index < sparkN; index++) {
      const cardinal = stubDirs[index % 4];
      const along = (0.1 + phase * tile * 0.95) * (0.45 + (index % 6) * 0.12);
      const side = (hash01(seed + index) - 0.5) * tile * 0.16;
      const px = x + cardinal[1] * along + cardinal[0] * side;
      const pz = z + cardinal[0] * along + cardinal[1] * side;
      const sy = 0.1 + Math.sin(phase * Math.PI + index * 0.35) * (0.22 + (index % 5) * 0.05);
      const a = pSparks * energy * (0.5 + hash01(seed + index * 3) * 0.5);
      if (a < 0.04) continue;
      const sr = 0.011 + (index % 5) * 0.005;
      const col = index % 4 === 0 ? CORE_WHITE
        : (index % 4 === 1 ? HOT_ORANGE : (index % 4 === 2 ? MID_FIRE : DEEP_RED));
      renderer.draw("sphere", [px, sy, pz], [sr, sr, sr],
        col, 3, (1.15 + beat * 0.25) * a, -time * 6 - index, a);
    }

    for (let index = 0; index < 10; index++) {
      const [dr, dc] = stubDirs[index % 4];
      const fly = smoothstep(0.04, 0.55, phase);
      const dist = fly * tile * (0.55 + (index % 5) * 0.12);
      const fy = 0.12 + Math.sin(fly * Math.PI + index) * (0.3 + (index % 3) * 0.08);
      const a = (1 - smoothstep(0.4, 0.9, phase)) * energy * 0.85;
      if (a < 0.05) continue;
      const side = (hash01(seed + index * 4) - 0.5) * tile * 0.1;
      renderer.draw("cube",
        [x + dc * dist + dr * side, fy, z + dr * dist + dc * side],
        [0.04, 0.014, 0.055],
        index % 2 ? GUNMETAL : EMBER_DARK, 1, 0.04,
        phase * 12 + index, a, phase * 5, phase * 7);
    }

    if (pSmoke > 0.05) {
      for (let index = 0; index < 6; index++) {
        const [dr, dc] = stubDirs[index % 4];
        const d = tile * (0.2 + index * 0.08);
        renderer.draw("cube",
          [x + dc * d, 0.2 + index * 0.04, z + dr * d],
          [tile * 0.18, tile * 0.08, tile * 0.12],
          SMOKE_DARK, 0, 0.02, index, pSmoke * energy * 0.45);
      }
    }
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
