"use strict";

/**
 * Geometry-only art direction for Nacre Hollow.
 *
 * Gameplay owns the grid and collisions. This module only replaces the visual
 * interpretation of those cells, so breakable shell growths still behave like
 * crates and carved pillars still behave like hard blocks.
 */
const RIFTBOMB_NACRE_APPEARANCE = Object.freeze((() => {
  const pearl = [0.39, 0.37, 0.34];
  const pearlLight = [0.56, 0.52, 0.47];
  const pearlRose = [0.43, 0.32, 0.35];
  const pearlViolet = [0.31, 0.31, 0.38];
  const cavernStone = [0.025, 0.09, 0.105];
  const pedestalStone = [0.24, 0.27, 0.27];
  const baseStone = [0.32, 0.34, 0.32];
  const cyan = [0.07, 0.42, 0.43];
  const cyanDeep = [0.025, 0.2, 0.23];

  function isTheme(theme) {
    return theme?.floor === "floorClearing";
  }

  function buildGrowthMesh(mobile = false, variant = 0) {
    const vertices = [];
    const rings = mobile ? 5 : 7;
    const segments = mobile ? 8 : 12;
    // Three deterministic silhouettes keep repeated crate cells from becoming a
    // field of identical roses: low oyster bed, tall conch and asymmetric fan.
    // Center entries are [x, y, z, sx, sy, sz, yaw].
    const centerSets = [
      [
        [0, 0.02, 0, 0.76, 0.38, 0.7, 0], [-0.5, -0.06, 0.08, 0.48, 0.28, 0.5, -0.28],
        [0.44, -0.04, 0.16, 0.52, 0.31, 0.48, 0.34], [-0.24, 0.06, -0.4, 0.48, 0.34, 0.46, 0.18],
        [0.28, 0.1, -0.34, 0.42, 0.38, 0.4, -0.22], [-0.54, -0.08, -0.34, 0.34, 0.24, 0.38, 0.48],
        [0.58, -0.08, -0.26, 0.32, 0.25, 0.35, -0.42], [0.08, 0.2, 0.24, 0.36, 0.32, 0.34, 0.12]
      ],
      [
        [0.02, 0.08, -0.04, 0.5, 0.66, 0.46, 0.18], [-0.4, -0.06, 0.14, 0.44, 0.3, 0.42, -0.36],
        [0.38, -0.04, 0.18, 0.42, 0.34, 0.38, 0.4], [-0.18, 0.14, -0.34, 0.34, 0.5, 0.32, 0.12],
        [0.28, 0.06, -0.3, 0.31, 0.42, 0.3, -0.26], [-0.5, -0.08, -0.26, 0.3, 0.24, 0.34, 0.52],
        [0.52, -0.08, -0.22, 0.29, 0.27, 0.32, -0.48]
      ],
      [
        [0, 0.02, 0.08, 0.28, 0.34, 0.76, 0], [-0.32, -0.04, 0.02, 0.25, 0.3, 0.7, -0.48],
        [0.32, -0.04, 0.02, 0.25, 0.3, 0.7, 0.48], [-0.54, -0.08, -0.12, 0.23, 0.25, 0.58, -0.82],
        [0.54, -0.08, -0.12, 0.23, 0.25, 0.58, 0.82], [-0.18, 0.08, -0.18, 0.24, 0.38, 0.62, -0.22],
        [0.18, 0.08, -0.18, 0.24, 0.38, 0.62, 0.22]
      ]
    ];
    const centers = centerSets[Math.abs(variant) % centerSets.length];
    const lobes = mobile ? Math.min(5, centers.length) : centers.length;
    const point = (lobe, ring, segment) => {
      const [cx, cy, cz, sx, sy, sz, yaw] = centers[lobe];
      const v = ring / rings;
      const phi = v * Math.PI;
      const theta = segment / segments * Math.PI * 2;
      const ripple = 1 + 0.09 * Math.sin(theta * 3 + lobe * 1.7) * Math.sin(phi);
      const localX = Math.sin(phi) * Math.cos(theta) * sx * ripple;
      const localZ = Math.sin(phi) * Math.sin(theta) * sz * ripple;
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);
      return [
        cx + localX * cosYaw + localZ * sinYaw,
        cy + Math.cos(phi) * sy + sy,
        cz - localX * sinYaw + localZ * cosYaw
      ];
    };
    const normalAt = (p, center) => {
      const [cx, cy, cz, sx, sy, sz, yaw] = center;
      const dx = p[0] - cx;
      const dz = p[2] - cz;
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);
      const localX = dx * cosYaw - dz * sinYaw;
      const localZ = dx * sinYaw + dz * cosYaw;
      const localNormal = [
        localX / (sx * sx),
        (p[1] - (cy + sy)) / (sy * sy),
        localZ / (sz * sz)
      ];
      const n = [
        localNormal[0] * cosYaw + localNormal[2] * sinYaw,
        localNormal[1],
        -localNormal[0] * sinYaw + localNormal[2] * cosYaw
      ];
      const length = Math.hypot(...n) || 1;
      return n.map((value) => value / length);
    };
    const emit = (a, b, c, center) => {
      for (const p of [a, b, c]) vertices.push(...p, ...normalAt(p, center));
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
          emit(a, c, b, center);
          emit(a, d, c, center);
        }
      }
    }
    return new Float32Array(vertices);
  }

  function buildCavernShelfMesh(mobile = false) {
    const segments = mobile ? 28 : 54;
    const vertices = [];
    const smoothstep = (min, max, value) => {
      const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
      return t * t * (3 - 2 * t);
    };
    const heightAt = (x, z) => {
      // The central well stays below the gameplay slab. Outside it, two broad
      // deterministic frequency bands lift the reef into real orbit-stable rock.
      const edgeDistance = Math.max(Math.abs(x) / 0.31, Math.abs(z) / 0.285);
      const outside = smoothstep(1, 1.3, edgeDistance);
      const farRise = smoothstep(1.18, 3.45, edgeDistance);
      const macro = Math.sin(x * 13.7 + z * 7.3) * 0.038
        + Math.sin(x * 5.2 - z * 11.1) * 0.027;
      const meso = Math.sin((x + z) * 27.0) * Math.sin((x - z) * 21.0) * 0.014;
      return outside * (0.018 + macro + meso + farRise * 0.28);
    };
    const pointAt = (x, z) => {
      const epsilon = 0.0025;
      const y = heightAt(x, z);
      const dx = (heightAt(x + epsilon, z) - heightAt(x - epsilon, z)) / (epsilon * 2);
      const dz = (heightAt(x, z + epsilon) - heightAt(x, z - epsilon)) / (epsilon * 2);
      const length = Math.hypot(dx, 1, dz) || 1;
      return {
        position: [x, y, z],
        normal: [-dx / length, 1 / length, -dz / length]
      };
    };
    const emit = (point) => vertices.push(...point.position, ...point.normal);
    for (let row = 0; row < segments; row++) {
      const z0 = row / segments * 2 - 1;
      const z1 = (row + 1) / segments * 2 - 1;
      for (let col = 0; col < segments; col++) {
        const x0 = col / segments * 2 - 1;
        const x1 = (col + 1) / segments * 2 - 1;
        const a = pointAt(x0, z0);
        const b = pointAt(x0, z1);
        const c = pointAt(x1, z1);
        const d = pointAt(x1, z0);
        emit(a); emit(b); emit(c);
        emit(a); emit(c); emit(d);
      }
    }
    return new Float32Array(vertices);
  }

  function drawShellFan(renderer, x, z, scale, rotation, t, index) {
    const pulse = 1 + Math.sin(t * 0.35 + index) * 0.018;
    renderer.draw("sphere", [x, -0.13, z], [1.08 * scale, 0.16 * scale, 0.78 * scale],
      pedestalStone, 0, 0.01, rotation, 1, 0, 0, 6);
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
        0, 0.004, angle, 1, spread * 0.3, 0.08, 5);
    }
    renderer.draw("sphere", [x, 0.1, z], [0.2 * scale * pulse, 0.2 * scale, 0.2 * scale],
      pearlLight, 0, 0.01, t * 0.08);
  }

  function drawBackdrop(renderer, halfW, halfD, t) {
    // These shelves, reefs and shells are real world-space geometry. They sit
    // behind the perimeter and participate in the same camera/depth pass as play.
    // A shallow textured shelf makes the grotto continuous. The earlier ring of
    // giant ellipsoids exposed the clear colour between objects and read as a
    // row of balls around the arena rather than one carved cavern.
    renderer.draw("nacreCavernShelf", [0, -0.085, 0], [halfW + 24.0, 3.2, halfD + 24.0],
      cavernStone, 1, 0.004, 0, 1, 0, 0, 6);
    renderer.draw("sphere", [0, -0.5, -halfD - 2.0], [halfW + 3.75, 0.42, 2.35],
      cyanDeep, 1, 0.008, 0.04, 1, 0, 0, 6);
    renderer.draw("sphere", [0, -0.52, halfD + 2.05], [halfW + 3.45, 0.4, 2.4],
      cavernStone, 1, 0.006, -0.03, 1, 0, 0, 6);
    renderer.draw("sphere", [-halfW - 2.35, -0.52, 0.15], [2.65, 0.42, halfD + 3.25],
      cavernStone, 1, 0.006, 0.08, 1, 0, 0, 6);
    renderer.draw("sphere", [halfW + 2.4, -0.5, -0.2], [2.7, 0.44, halfD + 3.1],
      cavernStone, 1, 0.006, -0.11, 1, 0, 0, 6);
    const formations = [
      [-halfW - 1.55, -halfD * 0.66, 0.94, 1.2],
      [-halfW - 1.72, halfD * 0.18, 1.08, 1.8],
      [-halfW - 1.42, halfD * 0.72, 0.82, 2.35],
      [halfW + 1.55, -halfD * 0.66, 0.9, -1.15],
      [halfW + 1.76, halfD * 0.12, 1.06, -1.72],
      [halfW + 1.5, halfD * 0.72, 0.86, -2.25],
      [-halfW * 0.62, -halfD - 1.58, 0.9, 0.25],
      [halfW * 0.58, halfD + 1.62, 0.96, Math.PI + 0.15]
    ];
    formations.forEach(([x, z, scale, rotation]) =>
      renderer.draw("nacreGrowth", [x, -0.18, z], [scale * 1.2, scale * 0.86, scale], pearl, 1, 0.008, rotation, 1, 0, 0, 6));

    const shellFans = [
      [-halfW - 1.28, -halfD * 0.1, 1.28, Math.PI * 0.5],
      [-halfW - 1.12, halfD * 0.78, 1.56, Math.PI * 0.42],
      [halfW + 1.14, -halfD * 0.72, 1.52, -Math.PI * 0.45],
      [halfW + 1.3, halfD * 0.08, 1.34, -Math.PI * 0.5],
      [-halfW * 0.3, -halfD - 1.02, 1.12, 0.05],
      [halfW * 0.34, halfD + 1.04, 1.18, Math.PI]
    ];
    shellFans.forEach(([x, z, scale, rotation], index) =>
      drawShellFan(renderer, x, z, scale, rotation, t, index));

    // Broken cavern shelves connect the board to the teal grotto without a flat plate.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        renderer.draw("sphere", [sx * (halfW + 1.15), -0.38, sz * (halfD + 0.9)],
          [1.65, 0.22, 1.2], cavernStone, 0, 0.018, sx * sz * 0.38, 1, 0, 0, 6);
        renderer.draw("nacreGrowth", [sx * (halfW + 1.1), -0.18, sz * (halfD + 0.82)],
          [0.72, 0.46, 0.62], pearlViolet, 1, 0.006, sx * sz * 0.54, 1, 0, 0, 6);
        renderer.draw("crystal", [sx * (halfW + 0.9), 0.22, sz * (halfD + 0.72)],
          [0.14, 0.42, 0.14], cyan, 2, 0.62, sx * t * 0.04);
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
    const edgeVariation = ((row * 7 + col * 11) % 4) * 0.012;
    const s = edge ? half * (0.9 + edgeVariation) : half * 0.8;
    const h = frontEdge ? 0.2 : (edge ? 0.33 + edgeVariation : 0.31);
    renderer.draw("cube", [x, 0.012, z], [s * 1.05, 0.018, s * 1.05],
      pedestalStone, 0, 0.008, 0, 0.9, 0, 0, 6);
    renderer.draw("cube", [x, 0.045, z], [s * 0.97, 0.025, s * 0.97],
      edge ? pearl : cyanDeep, 0, 0.008, 0, 1, 0, 0, edge ? 3 : 0);
    renderer.draw("cube", [x, h + 0.035, z], [s, h, s],
      pearl, edge ? 0 : 1, 0.018, 0, 1, 0, 0, 3);
    renderer.draw("cube", [x, h * 2 + 0.078, z], [s * (edge ? 0.88 : 0.78), 0.045, s * (edge ? 0.88 : 0.78)],
      pearlLight, edge ? 0 : 1, 0.008, 0, 1, 0, 0, edge ? 5 : 3);

    if (!edge) {
      renderer.draw("cylinder", [x, h * 2 + 0.132, z], [s * 0.2, 0.012, s * 0.2],
        baseStone, 0, 0.01, (row + col) * 0.34);
      renderer.draw("torus", [x, h * 2 + 0.146, z], [s * 0.17, 0.012, s * 0.17],
        cyan, 2, 0.06, (row + col) * 0.34, 0.9, 0, Math.PI * 0.5);
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
    const variation = 0.94 + (seed % 5) * 0.018;
    const heightVariation = 1.1 + ((seed * 3) % 5) * 0.03;
    const s = half * 0.96 * variation;
    const growthMesh = ["nacreGrowthTall", "nacreGrowth", "nacreGrowthFan"][seed % 3];
    renderer.draw("cube", [x, 0.012, z], [s * 0.8, 0.012, s * 0.8],
      baseStone, 0, 0.018, spin * 0.08, 0.96, 0, 0, 6);
    renderer.draw("cube", [x, 0.034, z], [s * 0.77, 0.007, s * 0.77],
      cyan, 2, 0.24, spin * 0.08, 1);
    renderer.draw("cube", [x, 0.052, z], [s * 0.72, 0.014, s * 0.72],
      pedestalStone, 0, 0.008, spin * 0.08, 0.98, 0, 0, 6);
    renderer.draw("cylinder", [x, 0.073, z], [s * 0.22, 0.006, s * 0.22],
      cyan, 2, 0.11, spin, 0.42);
    renderer.draw(growthMesh, [x, 0.082, z], [s, s * heightVariation, s * (1.02 - (seed % 3) * 0.035)],
      pearl, 0, 0.005, spin, 1, 0, 0, 5);
  }

  function drawTeamNexus(renderer, nexus, index, t, beat) {
    const marker = [
      nexus.color[0] * 0.58 + cyan[0] * 0.42,
      nexus.color[1] * 0.58 + cyan[1] * 0.42,
      nexus.color[2] * 0.58 + cyan[2] * 0.42
    ];
    renderer.draw("sphere", [nexus.x, -0.01, nexus.z], [0.72, 0.045, 0.72],
      cavernStone, 1, 0.02, t * 0.03, 1, 0, 0, 6);
    renderer.draw("cylinder", [nexus.x, 0.035, nexus.z], [0.45, 0.025, 0.45],
      pearlViolet, 0, 0.012, -t * 0.025, 1, 0, 0, 5);
    renderer.draw("crystal", [nexus.x, 0.4 + Math.sin(t * 1.7 + index) * 0.035, nexus.z],
      [0.22, 0.52, 0.22], marker, 2, 0.72 + beat * 0.12, t * (index ? -0.22 : 0.22));
  }

  function drawTeamTurret(renderer, turret, index, t, beat) {
    const marker = [
      turret.color[0] * 0.54 + cyanDeep[0] * 0.46,
      turret.color[1] * 0.54 + cyanDeep[1] * 0.46,
      turret.color[2] * 0.54 + cyanDeep[2] * 0.46
    ];
    renderer.draw("cube", [turret.x, 0.1, turret.z], [0.28, 0.14, 0.28],
      pedestalStone, 0, 0.012, 0, 1, 0, 0, 6);
    renderer.draw("crystal", [turret.x, 0.39, turret.z], [0.12, 0.27, 0.12],
      marker, 2, 0.58 + beat * 0.1, (index % 2 ? -1 : 1) * t * 0.12);
  }

  return {
    isTheme,
    buildGrowthMesh,
    buildCavernShelfMesh,
    drawBackdrop,
    drawFloorOrnaments,
    drawHardTile,
    drawBreakableTile,
    drawTeamNexus,
    drawTeamTurret
  };
})());
