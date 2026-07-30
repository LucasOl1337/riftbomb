"use strict";

const RIFTBOMB_BOMB_APPEARANCE = (() => {
  const TAU = Math.PI * 2;
  const BLACK_FORGED = [0.031, 0.043, 0.055];
  const SATIN_ARMOR = [0.082, 0.102, 0.122];
  const GUNMETAL = [0.105, 0.123, 0.142];
  const FUSE_FIBER = [0.078, 0.082, 0.09];
  const EMBER = [1, 0.416, 0];
  const EMBER_CORE = [1, 0.961, 0.761];
  const FIRE = [1, 0.16, 0.018];
  const SMOKE = [0.045, 0.052, 0.06];
  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
  const smoothstep = (low, high, value) => {
    const amount = clamp((value - low) / Math.max(0.0001, high - low));
    return amount * amount * (3 - 2 * amount);
  };

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

  function drawFuse(renderer, x, y, z, heat, time) {
    const points = [
      [x, y + 0.53, z],
      [x + 0.02, y + 0.65, z],
      [x + 0.09, y + 0.76, z],
      [x + 0.19, y + 0.83, z],
      [x + 0.29, y + 0.84, z]
    ];
    for (let index = 0; index < points.length - 1; index++) {
      drawCylinderBetween(renderer, points[index], points[index + 1],
        0.035 - index * 0.002, FUSE_FIBER, 1, 0.03);
      const braid = points[index];
      renderer.draw("torus", braid, [0.044, 0.014, 0.044], GUNMETAL, 1, 0.04,
        time * 0.35 + index * 0.9, 0.72, 0, Math.PI * 0.5);
    }
    const tip = points.at(-1);
    const flicker = 0.72 + Math.sin(time * (9 + heat * 27)) * 0.18;
    renderer.draw("crystal", tip, [0.055, 0.072, 0.055],
      heat > 0.72 ? EMBER_CORE : EMBER, 3, 2.8 + flicker * 2.2 + heat * 4, -time * 4);
  }

  function drawArmorPetals(renderer, x, y, z, scale, time) {
    for (let index = 0; index < 6; index++) {
      const angle = index / 6 * TAU;
      const radial = 0.16 * scale;
      renderer.draw(
        "sphere",
        [x + Math.sin(angle) * radial, y + 0.015, z + Math.cos(angle) * radial],
        [0.215 * scale, 0.345 * scale, 0.37 * scale],
        index % 2 ? BLACK_FORGED : SATIN_ARMOR,
        1,
        0.055,
        angle + time * 0.025,
        1,
        0,
        0.08 * Math.sin(angle)
      );
    }
  }

  function drawFasteners(renderer, x, y, z, scale, time) {
    for (let index = 0; index < 4; index++) {
      const angle = index / 4 * TAU;
      renderer.draw("sphere", [
        x + Math.sin(angle) * 0.39 * scale,
        y + 0.04,
        z + Math.cos(angle) * 0.39 * scale
      ], [0.036, 0.036, 0.024], GUNMETAL, 1, 0.035, angle + time * 0.02);
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
    const width = pulse * (1 + squash * 0.55);
    const height = pulse * (1 - squash * 0.7);

    renderer.draw("sphere", [x, bodyY, z], [0.375 * width, 0.38 * height, 0.375 * width],
      BLACK_FORGED, 1, 0.035, time * 0.025);
    drawArmorPetals(renderer, x, bodyY, z, 0.96 * width, time);
    renderer.draw("torus", [x, bodyY, z], [0.35 * width, 0.035, 0.35 * width],
      GUNMETAL, 1, 0.035, time * 0.025, 0.94, 0, Math.PI * 0.5);
    drawFasteners(renderer, x, bodyY, z, width, time);
    renderer.draw("cylinder", [x, bodyY - 0.405 * height, z], [0.27, 0.045, 0.27],
      GUNMETAL, 1, 0.04, time * 0.02);
    renderer.draw("cylinder", [x, bodyY + 0.405 * height, z], [0.155, 0.052, 0.155],
      SATIN_ARMOR, 1, 0.08, -time * 0.02);
    renderer.draw("cylinder", [x, bodyY + 0.49 * height, z], [0.11, 0.04, 0.11],
      BLACK_FORGED, 1, 0.05, time * 0.02);

    // Heat stays in the seams and fuse so the shell remains recognizably black.
    if (progress > 0.58) {
      const stress = smoothstep(0.58, 1, progress);
      for (let index = 0; index < 6; index++) {
        const angle = index / 6 * TAU;
        renderer.draw("crystal", [
          x + Math.sin(angle) * 0.34,
          bodyY + 0.12,
          z + Math.cos(angle) * 0.34
        ], [0.018, 0.19 * stress, 0.018], EMBER, 3,
        stress * (1.5 + beat * 2.2), -angle, 0.8);
      }
    }
    drawFuse(renderer, x, bodyY, z, heat, time);
  }

  function drawExplosion(renderer, blast, x, z, time, beat, tile) {
    const phase = clamp(blast.age / Math.max(0.01, blast.life));
    const energy = 1 - phase;
    const ignition = 1 - smoothstep(0.03, 0.24, phase);
    const smoke = smoothstep(0.16, 0.72, phase) * (1 - smoothstep(0.76, 1, phase));
    const seed = blast.r * 13.17 + blast.c * 7.31;
    const rise = Math.sin(phase * Math.PI) * 0.42;

    renderer.draw("cube", [x, 0.08 + rise * 0.16, z],
      [tile * (0.3 + energy * 0.14), 0.045 + energy * 0.075, tile * (0.3 + energy * 0.14)],
      ignition > 0.34 ? EMBER_CORE : FIRE, 3, 1.1 + energy * 2.7, time + seed);
    renderer.draw("crystal", [x, 0.3 + rise, z],
      [0.11 + energy * 0.15, 0.28 + energy * 0.57, 0.11 + energy * 0.15],
      ignition > 0.32 ? EMBER_CORE : EMBER, 3, 1.35 + energy * 3, time * 5 + seed);

    if (blast.core) {
      const shockRadius = 0.3 + phase * tile * 2.65;
      renderer.draw("torus", [x, 0.055, z], [shockRadius, 0.035, shockRadius],
        EMBER, 4, energy * energy * 2.1, time, 0.52 * energy, 0, Math.PI * 0.5);

      // The six authored armor petals continue into the detonation as debris.
      for (let index = 0; index < 6; index++) {
        const angle = index / 6 * TAU + seed * 0.03;
        const distance = phase * tile * (0.8 + index * 0.07);
        const fragmentY = 0.28 + Math.sin(phase * Math.PI) * (0.7 + index * 0.055);
        renderer.draw("cube", [
          x + Math.sin(angle) * distance,
          fragmentY,
          z + Math.cos(angle) * distance
        ], [0.115, 0.035, 0.18], index % 2 ? GUNMETAL : SATIN_ARMOR,
        1, 0.06 + ignition * 0.25, angle + phase * 8, energy, phase * 4, phase * 6);
      }
    }

    for (let index = 0; index < 7; index++) {
      const angle = index / 7 * TAU + seed;
      const radius = (0.18 + phase * tile * 0.72) * (0.75 + (index % 3) * 0.12);
      const emberY = 0.2 + Math.sin(phase * Math.PI) * (0.55 + index * 0.045);
      renderer.draw("crystal", [
        x + Math.sin(angle) * radius,
        emberY,
        z + Math.cos(angle) * radius
      ], [0.025, 0.055 + energy * 0.08, 0.025], index % 3 ? EMBER : EMBER_CORE,
      3, energy * (1.2 + beat * 0.8), -time * 4 - index, energy);
    }

    if (blast.core && smoke > 0.01) {
      for (let index = 0; index < 3; index++) {
        const angle = seed + index / 3 * TAU;
        const radius = phase * 0.28;
        renderer.draw("sphere", [
          x + Math.sin(angle) * radius,
          0.44 + phase * (0.65 + index * 0.13),
          z + Math.cos(angle) * radius
        ], [0.22 + phase * 0.22, 0.18 + phase * 0.25, 0.22 + phase * 0.22],
        SMOKE, 1, 0.02, angle, smoke * 0.72);
      }
    }
  }

  return Object.freeze({
    colors: Object.freeze({
      BLACK_FORGED, SATIN_ARMOR, GUNMETAL, FUSE_FIBER, EMBER, EMBER_CORE, FIRE, SMOKE
    }),
    drawBomb,
    drawExplosion
  });
})();
