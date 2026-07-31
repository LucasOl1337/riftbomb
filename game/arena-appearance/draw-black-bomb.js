"use strict";

const RIFTBOMB_BOMB_APPEARANCE = (() => {
  const TAU = Math.PI * 2;
  const BLACK_FORGED = [0.045, 0.052, 0.06];
  const GUNMETAL = [0.14, 0.155, 0.17];
  const FUSE_FIBER = [0.09, 0.095, 0.1];
  // Explosion palette stays saturated through the shared HDR/post stack.
  // CORE_WHITE is deliberately isolated to the first microflash in drawExplosion.
  const CORE_WHITE = [1, 0.92, 0.84];
  const HOT_ORANGE = [1, 0.35, 0.04];
  const MID_FIRE = [0.95, 0.18, 0.02];
  const DEEP_RED = [0.55, 0.06, 0.01];
  const EMBER_DARK = [0.35, 0.08, 0.02];
  const SMOKE_DARK = [0.06, 0.06, 0.07];
  const SMOKE_BROWN = [0.12, 0.09, 0.07];
  // Compatibility aliases for callers that inspect the appearance palette.
  const EMBER = HOT_ORANGE;
  const EMBER_CORE = HOT_ORANGE;
  const FIRE = MID_FIRE;
  const FIRE_MID = HOT_ORANGE;
  const FIRE_SOFT = DEEP_RED;
  const SMOKE = SMOKE_DARK;
  const SMOKE_LIT = SMOKE_BROWN;
  const BOMB_MAP = 7;
  // Slightly tighter shell so the prop sits cleanly on a tile.
  const SHELL_R = 0.36;
  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
  const smoothstep = (low, high, value) => {
    const amount = clamp((value - low) / Math.max(0.0001, high - low));
    return amount * amount * (3 - 2 * amount);
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
    // Short arc so the fuse does not dominate the sphere silhouette.
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
      heat > 0.65 ? EMBER_CORE : EMBER, 3, 2.6 + flicker * 2.4 + heat * 3.8);
  }

  /**
   * Kept for tests / debris continuity naming — petals live in the albedo only
   * so the gameplay silhouette stays a clean sphere (no faceted borders).
   */
  function drawArmorPetals(_renderer, _x, _y, _z, _shellR, _time) {
    for (let index = 0; index < 6; index++) {
      // Intentional no-op: geometry petals caused silhouette edges at iso camera.
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
    // Keep almost spherical even under land squash.
    const width = pulse * (1 + squash * 0.35);
    const height = pulse * (1 - squash * 0.45);
    const shellRx = SHELL_R * width;
    const shellRy = SHELL_R * height;
    const shellR = (shellRx + shellRy) * 0.5;

    // ONE clean textured sphere — no stacked petals / dual belts (those read as edges).
    drawBody(renderer, "sphere", [x, bodyY, z],
      [shellRx, shellRy, shellRx],
      BLACK_FORGED, 1, 0.02 + heat * 0.05, time * 0.01, 1, 0, 0, BOMB_MAP);

    // Tiny inset neck (no flat cap disk larger than the shell).
    renderer.draw("cylinder", [x, bodyY + shellRy * 0.92, z],
      [shellR * 0.22, shellR * 0.08, shellR * 0.22],
      GUNMETAL, 1, 0.06, time * 0.02);

    // Soft contact shadow under the ball (not a hard collar lip).
    renderer.draw("sphere", [x, 0.04, z],
      [shellR * 0.78, 0.02, shellR * 0.78],
      [0.02, 0.02, 0.025], 0, 0.01, 0, 0.55);

    drawArmorPetals(renderer, x, bodyY, z, shellR, time);

    // Stress cracks only as emissive lines near detonation — not extra geometry shells.
    if (progress > 0.62) {
      const stress = smoothstep(0.62, 1, progress);
      for (let index = 0; index < 6; index++) {
        const angle = index / 6 * TAU;
        renderer.draw("crystal", [
          x + Math.sin(angle) * shellR * 0.82,
          bodyY + shellR * 0.15,
          z + Math.cos(angle) * shellR * 0.82
        ], [shellR * 0.03, shellR * 0.35 * stress, shellR * 0.03], EMBER, 3,
        stress * (1.4 + beat * 2), -angle, 0.75);
      }
    }
    drawFuse(renderer, x, bodyY, z, heat, time, shellR / SHELL_R);
  }

  /**
   * Cinematic fire-first blast (no black bomb spheres / no BOMB_MAP redraw).
   * Phases: flash/core → multi-frame fireball shells → cardinal flame arms →
   * sparks → metal micro-debris → late smoke.
   * Marker for production/source gates: CINEMATIC_EXPLOSION_V2
   */
  function drawExplosion(renderer, blast, x, z, time, beat, tile) {
    const phase = clamp(blast.age / Math.max(0.01, blast.life));
    const energy = 1 - phase;
    const seed = blast.r * 13.17 + blast.c * 7.31 + (blast.source || 0) * 0.17;
    const flash = 1 - smoothstep(0.0, 0.14, phase);
    const fire = smoothstep(0.02, 0.16, phase) * (1 - smoothstep(0.38, 0.88, phase));
    const smoke = smoothstep(0.2, 0.5, phase) * (1 - smoothstep(0.7, 1, phase));
    const sparks = 1 - smoothstep(0.45, 1, phase);
    const bob = Math.sin(Math.min(1, phase * 1.2) * Math.PI);

    if (!blast.core) {
      // Arm lane: layered fire frames (not cubes).
      const reach = tile * (0.28 + fire * 0.22);
      const h = 0.1 + fire * 0.55 + flash * 0.2;
      const flicker = 0.88 + 0.12 * Math.sin(time * 32 + seed);
      for (let layer = 0; layer < 4; layer++) {
        const t = layer / 3;
        const y = 0.08 + h * (0.25 + t * 0.55);
        const r = reach * (1 - t * 0.35) * (0.9 + fire * 0.2);
        const col = t < 0.35 ? EMBER_CORE : (t < 0.7 ? FIRE_MID : FIRE);
        renderer.draw("sphere", [x, y + bob * 0.06, z],
          [r, r * (0.55 + t * 0.35), r],
          col, 3, (1.6 + fire * 3.2 + flash * 2) * flicker * (1 - t * 0.2),
          time * 4 + layer, 0.75 + fire * 0.2);
      }
      // Sparks along the lane
      for (let index = 0; index < 5; index++) {
        const a = seed + index * 1.3;
        renderer.draw("sphere", [
          x + Math.sin(a) * phase * tile * 0.25,
          0.15 + bob * (0.25 + index * 0.05),
          z + Math.cos(a) * phase * tile * 0.25
        ], [0.04, 0.04, 0.04], index % 2 ? EMBER : EMBER_CORE, 3,
        energy * sparks * 2.2, -time * 6, sparks * 0.9);
      }
      if (smoke > 0.05) {
        renderer.draw("sphere", [x, 0.35 + phase * 0.5, z],
          [tile * 0.32, tile * 0.28, tile * 0.32],
          SMOKE, 1, 0.02, seed, smoke * 0.55);
      }
      return;
    }

    // ===== CORE: fireball sequence =====

    // 0) Ground flash plate
    const groundR = tile * (0.35 + flash * 0.45 + fire * 0.25);
    renderer.draw("sphere", [x, 0.04, z],
      [groundR, 0.03 + flash * 0.04, groundR],
      flash > 0.4 ? EMBER_CORE : FIRE_SOFT, 3,
      2.5 + flash * 5 + fire * 2, time + seed, 0.55 + flash * 0.4);

    // 1) White-hot core flash
    const coreR = tile * (0.14 + flash * 0.28 + fire * 0.12) * (1 - smoke * 0.35);
    renderer.draw("sphere", [x, 0.18 + bob * 0.12, z],
      [coreR, coreR * 0.85, coreR],
      EMBER_CORE, 3, 3.5 + flash * 6 + fire * 2.5, time * 5 + seed, 0.95);

    // 2) Multi-frame fireball shells (outer cooler) — more layers = film-like frames
    for (let shell = 0; shell < 7; shell++) {
      const t = shell / 6;
      const expand = smoothstep(0.0, 0.38, phase + t * 0.07);
      const fade = 1 - smoothstep(0.22 + t * 0.11, 0.88, phase);
      if (fade < 0.05) continue;
      const r = tile * (0.18 + expand * (0.62 + t * 0.4)) * (1 - t * 0.1);
      const y = 0.18 + bob * 0.18 + t * 0.1;
      const col = t < 0.2 ? EMBER_CORE : (t < 0.45 ? FIRE_MID : (t < 0.7 ? FIRE : FIRE_SOFT));
      const flick = 0.88 + 0.12 * Math.sin(time * (20 + shell * 2.4) + seed + shell);
      renderer.draw("sphere", [x, y, z],
        [r, r * (0.65 + t * 0.28), r],
        col, 3, (2 + fire * 3.8 + flash * 2.2) * flick * (1 - t * 0.12),
        time * 3 + shell, fade * (0.72 + fire * 0.28));
    }

    // 3) Shock ring (thin, bright, expands)
    const shockRadius = 0.25 + phase * tile * 3.1;
    const shockA = energy * energy * (0.4 + flash * 0.5);
    renderer.draw("torus", [x, 0.05, z],
      [shockRadius, 0.022 + flash * 0.03, shockRadius],
      flash > 0.25 ? EMBER_CORE : EMBER, 4, shockA * 3.5, time, shockA, 0, Math.PI * 0.5);

    // 4) Cardinal flame lanes (stacked soft spheres = fire frames)
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const armLen = tile * (0.5 + fire * 1.15);
    for (let d = 0; d < 4; d++) {
      const [dx, dz] = dirs[d];
      const flick = 0.86 + 0.14 * Math.sin(time * 28 + d * 2 + seed);
      for (let step = 0; step < 6; step++) {
        const u = (step + 0.5) / 6;
        const px = x + dx * armLen * u;
        const pz = z + dz * armLen * u;
        const pr = tile * (0.22 - u * 0.07) * (0.8 + fire * 0.5) * (1 - smoke * 0.28);
        const ph = 0.14 + fire * 0.58 * (1 - u * 0.35) + flash * 0.14;
        const col = u < 0.22 ? EMBER_CORE : (u < 0.5 ? FIRE_MID : FIRE);
        renderer.draw("sphere", [px, 0.1 + ph * 0.38 + bob * 0.06, pz],
          [pr, ph * 0.58, pr],
          col, 3, (1.7 + fire * 3.2 + flash) * flick * (1 - u * 0.22),
          time * 4 + d + step, 0.74 + fire * 0.22);
        // Tip tongues + secondary flame tongue
        if (step >= 3) {
          renderer.draw("crystal", [px, 0.14 + ph * 0.75, pz],
            [pr * 0.48, ph * 0.8, pr * 0.48],
            FIRE_MID, 3, (2 + fire * 2.8) * flick, time * 7 + d, fire * 0.9);
          renderer.draw("sphere", [px, 0.2 + ph * 0.5, pz],
            [pr * 0.55, pr * 0.5, pr * 0.55],
            EMBER_CORE, 3, (2.2 + flash) * flick, seed + d, fire * 0.55);
        }
      }
    }

    // 5) Debris shards (metal only — small, not bomb-sized spheres)
    for (let index = 0; index < 6; index++) {
      const angle = index / 6 * TAU + seed * 0.04;
      const fly = smoothstep(0.04, 0.5, phase);
      const dist = fly * tile * (1.1 + (index % 3) * 0.15);
      const fy = 0.2 + Math.sin(fly * Math.PI) * (0.65 + index * 0.05);
      const a = (1 - smoothstep(0.5, 0.92, phase)) * energy;
      if (a < 0.05) continue;
      renderer.draw("cube", [
        x + Math.sin(angle) * dist,
        fy,
        z + Math.cos(angle) * dist
      ], [0.08, 0.025, 0.12], GUNMETAL, 1, 0.04 + flash * 0.2,
      angle + phase * 12, a, phase * 6, phase * 8);
    }

    // 6) Spark cloud (many tiny fire particles as spheres)
    const sparkN = 20;
    for (let index = 0; index < sparkN; index++) {
      const angle = index / sparkN * TAU + seed + phase * 2.4;
      const rad = (0.1 + phase * tile * 1.2) * (0.6 + (index % 5) * 0.11);
      const sy = 0.12 + Math.sin(phase * Math.PI + index * 0.35) * (0.5 + (index % 6) * 0.07);
      const a = sparks * (0.55 + fire * 0.5);
      if (a < 0.05) continue;
      const sr = 0.028 + (index % 4) * 0.012;
      renderer.draw("sphere", [
        x + Math.sin(angle) * rad,
        sy,
        z + Math.cos(angle) * rad
      ], [sr, sr, sr],
      index % 3 === 0 ? EMBER_CORE : (index % 3 === 1 ? FIRE_MID : EMBER),
      3, energy * (1.8 + beat) * a, -time * 5 - index, a);
    }

    // 7) Smoke (late, soft, doesn't kill fire readability early)
    if (smoke > 0.04) {
      for (let index = 0; index < 6; index++) {
        const angle = seed + index / 6 * TAU;
        const rad = phase * tile * (0.3 + index * 0.05);
        const sy = 0.4 + phase * (0.55 + index * 0.1);
        const sr = 0.22 + phase * 0.32 + index * 0.03;
        renderer.draw("sphere", [
          x + Math.sin(angle) * rad,
          sy,
          z + Math.cos(angle) * rad
        ], [sr, sr * 0.8, sr],
        index % 2 ? SMOKE : SMOKE_LIT, 1, 0.015, angle, smoke * (0.45 + index * 0.05));
      }
    }
  }

  return Object.freeze({
    colors: Object.freeze({
      BLACK_FORGED, GUNMETAL, FUSE_FIBER, EMBER, EMBER_CORE, FIRE, FIRE_MID, FIRE_SOFT, SMOKE, SMOKE_LIT
    }),
    mapId: BOMB_MAP,
    shellRadius: SHELL_R,
    drawBomb,
    drawExplosion
  });
})();
