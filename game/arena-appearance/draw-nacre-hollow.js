"use strict";

/**
 * Geometry-only art direction for Nacre Hollow.
 *
 * Gameplay owns the grid and collisions. This module only replaces the visual
 * interpretation of those cells, so breakable shell growths still behave like
 * crates and carved pillars still behave like hard blocks.
 */
const RIFTBOMB_NACRE_APPEARANCE = Object.freeze((() => {
  const pearl = [0.38, 0.36, 0.33];
  const pearlLight = [0.52, 0.48, 0.42];
  const pearlRose = [0.4, 0.3, 0.32];
  const pearlViolet = [0.29, 0.29, 0.35];
  const deepStone = [0.035, 0.095, 0.105];
  const baseStone = [0.16, 0.2, 0.19];
  const cyan = [0.075, 0.38, 0.39];

  function isTheme(theme) {
    return theme?.floor === "floorClearing";
  }

  function buildGrowthMesh(mobile = false) {
    const vertices = [];
    const lobes = mobile ? 5 : 8;
    const rings = mobile ? 5 : 7;
    const segments = mobile ? 8 : 12;
    const centers = [
      [0, 0.08, 0, 0.72, 0.5, 0.64], [-0.48, 0, 0.06, 0.48, 0.34, 0.44],
      [0.42, -0.02, 0.18, 0.5, 0.38, 0.46], [-0.2, 0.12, -0.42, 0.46, 0.42, 0.5],
      [0.27, 0.16, -0.32, 0.42, 0.46, 0.4], [-0.52, -0.08, -0.34, 0.34, 0.28, 0.36],
      [0.58, -0.08, -0.28, 0.32, 0.3, 0.34], [0.06, 0.28, 0.22, 0.34, 0.4, 0.32]
    ];
    const point = (lobe, ring, segment) => {
      const [cx, cy, cz, sx, sy, sz] = centers[lobe];
      const v = ring / rings;
      const phi = v * Math.PI;
      const theta = segment / segments * Math.PI * 2;
      const ripple = 1 + 0.09 * Math.sin(theta * 3 + lobe * 1.7) * Math.sin(phi);
      return [
        cx + Math.sin(phi) * Math.cos(theta) * sx * ripple,
        cy + Math.cos(phi) * sy + sy,
        cz + Math.sin(phi) * Math.sin(theta) * sz * ripple
      ];
    };
    const emit = (a, b, c, center) => {
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      let n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      const midpoint = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      if (n[0] * (midpoint[0] - center[0]) + n[1] * (midpoint[1] - center[1]) + n[2] * (midpoint[2] - center[2]) < 0) n = n.map((value) => -value);
      const length = Math.hypot(...n) || 1;
      n = n.map((value) => value / length);
      for (const p of [a, b, c]) vertices.push(...p, ...n);
    };
    for (let lobe = 0; lobe < lobes; lobe++) {
      const center = centers[lobe];
      for (let ring = 0; ring < rings; ring++) {
        for (let segment = 0; segment < segments; segment++) {
          const next = (segment + 1) % segments;
          const a = point(lobe, ring, segment);
          const b = point(lobe, ring + 1, segment);
          const c = point(lobe, ring + 1, next);
          const d = point(lobe, ring, next);
          emit(a, b, c, center);
          emit(a, c, d, center);
        }
      }
    }
    return new Float32Array(vertices);
  }

  function drawShellFan(renderer, x, z, scale, rotation, t, index) {
    const pulse = 1 + Math.sin(t * 0.35 + index) * 0.018;
    renderer.draw("sphere", [x, -0.16, z], [1.2 * scale, 0.22 * scale, 0.9 * scale],
      deepStone, 0, 0.02, rotation);
    const ribs = renderer.mobilePerf ? 5 : 8;
    for (let i = 0; i < ribs; i++) {
      const spread = ribs === 1 ? 0 : i / (ribs - 1) - 0.5;
      const angle = rotation + spread * 1.05;
      const reach = scale * (0.54 + Math.abs(spread) * 0.2);
      const ox = Math.sin(angle) * reach;
      const oz = Math.cos(angle) * reach;
      renderer.draw("sphere", [x + ox, 0.03 + (0.5 - Math.abs(spread)) * scale * 0.22, z + oz],
        [scale * 0.34, scale * (0.18 + (0.5 - Math.abs(spread)) * 0.12), scale * 0.72],
        i % 3 === 0 ? pearlRose : (i % 2 ? pearl : pearlViolet),
        0, 0.005, angle, 1, spread * 0.3, 0.08);
    }
    renderer.draw("sphere", [x, 0.1, z], [0.2 * scale * pulse, 0.2 * scale, 0.2 * scale],
      pearl, 0, 0.01, t * 0.08);
  }

  function drawBackdrop(renderer, halfW, halfD, t) {
    const formations = [
      [-halfW - 1.25, -halfD * 0.58, 0.82, 1.2],
      [-halfW - 1.45, halfD * 0.42, 1.05, 1.8],
      [halfW + 1.35, -halfD * 0.38, 1.0, -1.4],
      [halfW + 1.5, halfD * 0.48, 1.2, -1.9],
      [-halfW * 0.64, -halfD - 1.22, 0.78, 0.25],
      [halfW * 0.6, halfD + 1.18, 0.88, Math.PI + 0.15]
    ];
    formations.forEach(([x, z, scale, rotation]) =>
      renderer.draw("nacreGrowth", [x, -0.2, z], [scale * 1.25, scale, scale], pearl, 0, 0.01, rotation, 1, 0, 0, 5));

    // Broken cavern shelves connect the arena to a world instead of a black void.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        renderer.draw("sphere", [sx * (halfW + 1.15), -0.38, sz * (halfD + 0.9)],
          [1.65, 0.22, 1.2], deepStone, 0, 0.018, sx * sz * 0.38);
        renderer.draw("crystal", [sx * (halfW + 0.9), 0.22, sz * (halfD + 0.72)],
          [0.18, 0.48, 0.18], cyan, 2, 0.8, sx * t * 0.04);
      }
    }
  }

  function drawFloorOrnaments(renderer, t) {
    // The engraved rings already live in the albedo. Only the restrained central
    // mineral seal is geometry; large bright toruses read as a white pool.
    renderer.draw("cylinder", [0, 0.006, 0], [0.2, 0.008, 0.2], baseStone, 0, 0.01, t * 0.02);
    renderer.draw("cylinder", [0, 0.016, 0], [0.09, 0.008, 0.09], cyan, 2, 0.09, -t * 0.025);
  }

  function drawHardTile(renderer, context) {
    const { x, z, half, edge, frontEdge, row, col } = context;
    const s = edge ? half * 0.96 : half * 0.8;
    const h = frontEdge ? 0.22 : (edge ? 0.38 : 0.31);
    renderer.draw("cube", [x, 0.012, z], [s * 1.05, 0.018, s * 1.05],
      deepStone, 0, 0.01, 0, 0.82);
    renderer.draw("cube", [x, h + 0.035, z], [s, h, s],
      pearl, 0, 0.018, 0, 1, 0, 0, 3);
    renderer.draw("cube", [x, h * 2 + 0.055, z], [s * 0.88, 0.018, s * 0.88],
      pearl, 0, 0.008, 0, 1, 0, 0, 3);

    if (!edge) {
      renderer.draw("cylinder", [x, h * 2 + 0.078, z], [s * 0.2, 0.012, s * 0.2],
        baseStone, 0, 0.01, (row + col) * 0.34);
      renderer.draw("torus", [x, h * 2 + 0.092, z], [s * 0.17, 0.012, s * 0.17],
        cyan, 2, 0.075, (row + col) * 0.34, 1, 0, Math.PI * 0.5);
    } else if ((row + col) % 3 === 0) {
      const vertical = row === 0 || row === context.rows - 1;
      renderer.draw("cube", [x, 0.25, z], vertical ? [0.035, 0.22, s * 0.55] : [s * 0.55, 0.22, 0.035],
        cyan, 2, 0.065, 0, 0.34);
    }
  }

  function drawBreakableTile(renderer, context) {
    const { x, z, half, row, col } = context;
    const seed = (row * 31 + col * 17) % 11;
    const spin = (seed / 11) * Math.PI * 2;
    const s = half * 0.76;
    renderer.draw("cube", [x, 0.035, z], [s * 0.88, 0.035, s * 0.88], deepStone, 0, 0.004, spin);
    renderer.draw("nacreGrowth", [x, 0.07, z], [s, s * 0.82, s], pearl, 0, 0.006, spin, 1, 0, 0, 5);
  }

  return { isTheme, buildGrowthMesh, drawBackdrop, drawFloorOrnaments, drawHardTile, drawBreakableTile };
})());
