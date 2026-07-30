import fs from "node:fs/promises";
import path from "node:path";
import { AnimationMixer, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Node bake has no DOM Image; stub enough for GLTFLoader to finish mesh/skin/anim parse.
globalThis.self ??= globalThis;
if (typeof globalThis.Image === "undefined") {
  globalThis.Image = class Image {
    set src(_value) {
      queueMicrotask(() => {
        this.width = 1;
        this.height = 1;
        this.onload?.();
      });
    }
  };
}

const [requestedChampion, inputPath, outputDirectory] = process.argv.slice(2);
if (!requestedChampion || !inputPath || !outputDirectory) {
  throw new Error("Usage: node bake-playable-champion.mjs <katarina|zed|renekton|vladimir|gangplank> <animated.glb> <output-directory>");
}

const champion = requestedChampion.toLowerCase();
const fixedConfigs = {
  katarina: {
    displayName: "Katarina",
    targetHeight: 2.08,
    runtime: "vat-v1",
    sourceUrl: "https://cdn.modelviewer.lol/lol/models/katarina/55000/model.glb",
    actions: {
      idle: "Idle1", run: "Run1", attack: "Attack1",
      q: "Spell1", w: "Spell2", e: "Spell3", r: "Spell4"
    }
  },
  zed: {
    displayName: "Zed",
    targetHeight: 2.05,
    runtime: "vat-v1",
    sourceUrl: "https://cdn.modelviewer.lol/lol/models/zed/238000/model.glb",
    // Shadow-clone / ult clips inject skinned outliers that wreck raw min/max.
    robustGround: true,
    actions: {
      idle: "Zed_idle1.anm", run: "Zed_run.anm", attack: "Zed_attack1.anm",
      q: "Zed_spell1.anm", w: "Zed_spell2_cast.anm", e: "Zed_spell3.anm",
      r: "Spell4", rStrike: "Spell4_Strike"
    }
  },
  renekton: {
    displayName: "Renekton",
    targetHeight: 2.2,
    runtime: "vat-v1",
    sourceUrl: "https://cdn.modelviewer.lol/lol/models/renekton/58000/model.glb",
    actions: {
      idle: "Idle1", run: "Run", attack: "Attack1",
      q: "Spell1", w: "Spell2", e: "Spell3", r: "Spell4"
    }
  },
  vladimir: {
    displayName: "Vladimir",
    targetHeight: 2.08,
    runtime: "vat-v1",
    sourceUrl: "https://cdn.modelviewer.lol/lol/models/vladimir/8000/model.glb",
    actions: {
      idle: "Idle1", run: "Run", attack: "Attack1", q: "Spell1",
      pool: "Spell2", poolDown: "Spell2Down", poolUp: "Spell2Up",
      e: "Vladimir_spell3_cast.anm", r: "Spell4"
    }
  },
  gangplank: {
    displayName: "Gangplank",
    targetHeight: 2.12,
    runtime: "vat-v1",
    sourceUrl: "https://cdn.modelviewer.lol/lol/models/gangplank/41000/model.glb",
    actions: {
      idle: "Idle1", run: "Run_Haste", attack: "Attack1",
      q: "Gangplank_spell1.anm", w: "Gangplank_Spell2.anm",
      e: "Gangplank_spell3.anm", r: "Gangplank_spell4.anm"
    },
    // Do NOT invertUvV: upload already uses UNPACK_FLIP_Y (same as Katarina/Renekton).
    // invertUvV + flip double-samples the atlas and turns GP into a dark leather blob.
    invertUvV: false,
    // Absolute minY on Idle includes skinned outliers ~1.7u under the feet — use percentiles.
    robustGround: true,
    sourceLabel: "Khada Model Viewer Gangplank base GLB (body mesh + all clips; crate excluded)"
  }
};

if (!fixedConfigs[champion]) {
  throw new Error(`Unsupported champion: ${requestedChampion}`);
}

const bytes = await fs.readFile(inputPath);
const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const gltf = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(arrayBuffer, "", resolve, reject);
});
const clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));

const config = fixedConfigs[champion];

const meshes = [];
gltf.scene.traverse((node) => {
  if (!node.isSkinnedMesh) return;
  const materialList = Array.isArray(node.material) ? node.material : [node.material];
  const materialName = materialList[0]?.name ?? "";
  if (champion === "katarina" &&
      (["Recall", "Lizard", "Joke"].includes(materialName) || /^(Blade|Gem)[2-6]$/.test(materialName))) return;
  // Drop pure crate props from Khada packs when they arrive as separate skinned meshes.
  if (champion === "gangplank" && materialList.every((material) => material?.name === "Crate_Mat")) return;
  const geometry = node.geometry;
  if (!geometry.attributes.position || !geometry.attributes.normal ||
      !geometry.attributes.uv || !geometry.index) return;
  meshes.push(node);
});
if (!meshes.length) throw new Error(`No playable ${config.displayName} skinned meshes found`);

const usesBattleQueenAtlas = false;
const resolveClipName = (name) => {
  if (champion === "katarina") {
    return [name, name.replace(/^katarina_/, "")].find((candidate) => clips.has(candidate));
  }
  if (champion === "gangplank") {
    const aliases = {
      Idle1: ["Idle1", "IdleIn", "idle1"],
      Run_Base: ["Run_Base", "Run_Haste", "RunIn", "run"],
      Run_Haste: ["Run_Haste", "Run_Base", "RunIn"],
      "Gangplank_spell1.anm": ["Gangplank_spell1.anm", "Spell1_Alt", "Attack1"],
      "Gangplank_spell4.anm": ["Gangplank_spell4.anm", "Spell4_Upper", "Gangplank_spell3.anm"]
    };
    return (aliases[name] || [name]).find((candidate) => clips.has(candidate));
  }
  return name;
};
const resolvePose = (name, time) => name === "grounded_cast_from_idle_b"
  ? ["katarina_idle1", 0.47]
  : [name, time];

const percentile = (sorted, q) => sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q)))];

const mixer = new AnimationMixer(gltf.scene);
const applyPose = (requestedName, requestedTime) => {
  const [poseName, poseTime] = resolvePose(requestedName, requestedTime);
  const actualName = resolveClipName(poseName);
  const clip = clips.get(actualName);
  if (!clip) throw new Error(`Missing animation clip: ${poseName}`);
  mixer.stopAllAction();
  mixer.setTime(0);
  mixer.clipAction(clip).reset().play();
  mixer.setTime(Math.min(poseTime, Math.max(0, clip.duration - 1e-4)));
  gltf.scene.updateMatrixWorld(true);
  for (const mesh of meshes) mesh.skeleton.update();
};

const samplePose = (name, time) => {
  applyPose(name, time);
  const positions = [];
  const allY = [];
  for (const mesh of meshes) {
    const source = mesh.geometry.attributes.position;
    const values = new Float32Array(source.count * 3);
    const point = new Vector3();
    for (let index = 0; index < source.count; index += 1) {
      point.fromBufferAttribute(source, index);
      mesh.applyBoneTransform(index, point);
      point.applyMatrix4(mesh.matrixWorld);
      values[index * 3] = point.x;
      values[index * 3 + 1] = point.y;
      values[index * 3 + 2] = point.z;
      allY.push(point.y);
    }
    positions.push(values);
  }
  // Khada Idle has skinned outlier verts deep under the feet; grounding on absolute min
  // inflates height ~2x and makes run/spell poses look like a crushed blob after scale.
  let groundY;
  if (config.robustGround) {
    allY.sort((a, b) => a - b);
    groundY = percentile(allY, 0.02);
  } else {
    groundY = Math.min(...allY);
  }
  for (const values of positions) {
    for (let index = 1; index < values.length; index += 3) {
      values[index] -= groundY;
      // Collapse skinned garbage under the soles so it cannot inflate scale or silhouette.
      if (config.robustGround) values[index] = Math.max(0, values[index]);
    }
  }
  return positions;
};

const sampleSmoothNormals = (name, time) => {
  applyPose(name, time);
  const normals = [];
  for (const mesh of meshes) {
    const sourcePosition = mesh.geometry.attributes.position;
    const sourceNormal = mesh.geometry.attributes.normal;
    const values = new Float32Array(sourcePosition.count * 3);
    const point = new Vector3();
    const tip = new Vector3();
    const normal = new Vector3();
    for (let index = 0; index < sourcePosition.count; index += 1) {
      point.fromBufferAttribute(sourcePosition, index);
      normal.fromBufferAttribute(sourceNormal, index);
      tip.copy(point).add(normal);
      mesh.applyBoneTransform(index, point);
      mesh.applyBoneTransform(index, tip);
      point.applyMatrix4(mesh.matrixWorld);
      tip.applyMatrix4(mesh.matrixWorld);
      normal.subVectors(tip, point).normalize();
      values[index * 3] = normal.x;
      values[index * 3 + 1] = normal.y;
      values[index * 3 + 2] = normal.z;
    }
    normals.push(values);
  }
  return normals;
};

if (config.runtime === "vat-v1") {
  const coreFrameCounts = {
    idle: 8, run: 10, attack: 6, q: 8, w: 8, e: 8, r: 8,
    rStrike: 6, pool: 8, poolDown: 6, poolUp: 6
  };
  const actionBySource = new Map(
    Object.entries(config.actions).map(([action, source]) => [source, action])
  );
  for (const [action, source] of Object.entries(config.actions)) {
    if (!clips.has(source)) throw new Error(`Missing ${action} animation clip: ${source}`);
  }
  const orderedClips = [
    clips.get(config.actions.idle),
    ...gltf.animations.filter((clip) => clip.name !== config.actions.idle)
  ];
  const animationSpecs = orderedClips.map((clip) => {
    const action = actionBySource.get(clip.name);
    const loop = action === "idle" || action === "run" ||
      /(?:idle|run|loop|dance|laugh|taunt|joke)/i.test(clip.name);
    const supportingFrameCount = Math.max(4, Math.min(8, Math.round(clip.duration * 2)));
    return {
      key: clip.name,
      name: clip.name,
      actualName: clip.name,
      action,
      clip,
      frameCount: action ? coreFrameCounts[action] : supportingFrameCount,
      loop
    };
  });
  const referencePositions = samplePose(config.actions.idle, 0);
  let sourceHeight = 0;
  for (const positions of referencePositions) {
    for (let index = 1; index < positions.length; index += 3) {
      sourceHeight = Math.max(sourceHeight, positions[index]);
    }
  }
  const unitScale = config.targetHeight / Math.max(1e-4, sourceHeight);
  for (const positions of referencePositions) {
    for (let index = 0; index < positions.length; index += 1) positions[index] *= unitScale;
  }
  const positionFrames = [];
  const normalFrames = [];
  const animationClips = {};
  const frameQuality = [];

  const qualityEdges = [];
  for (let meshIndex = 0; meshIndex < meshes.length; meshIndex += 1) {
    const seenEdges = new Set();
    const sourceIndices = meshes[meshIndex].geometry.index.array;
    const reference = referencePositions[meshIndex];
    for (let index = 0; index < sourceIndices.length; index += 3) {
      const triangle = [sourceIndices[index], sourceIndices[index + 1], sourceIndices[index + 2]];
      for (let edge = 0; edge < 3; edge += 1) {
        const a = triangle[edge];
        const b = triangle[(edge + 1) % 3];
        const edgeKey = `${Math.min(a, b)}:${Math.max(a, b)}`;
        if (seenEdges.has(edgeKey)) continue;
        seenEdges.add(edgeKey);
        const aOffset = a * 3;
        const bOffset = b * 3;
        const referenceLength = Math.hypot(
          reference[aOffset] - reference[bOffset],
          reference[aOffset + 1] - reference[bOffset + 1],
          reference[aOffset + 2] - reference[bOffset + 2]
        );
        if (referenceLength > 1e-5) qualityEdges.push({
          meshIndex, aOffset, bOffset, referenceLength
        });
      }
    }
  }

  const profilePose = (meshPositions) => {
    const samples = [[], [], []];
    for (const values of meshPositions) {
      for (let index = 0; index < values.length; index += 3) {
        for (let axis = 0; axis < 3; axis += 1) samples[axis].push(values[index + axis]);
      }
    }
    const low = [0, 0, 0];
    const center = [0, 0, 0];
    const high = [0, 0, 0];
    const span = [0, 0, 0];
    for (let axis = 0; axis < 3; axis += 1) {
      samples[axis].sort((a, b) => a - b);
      low[axis] = percentile(samples[axis], 0.01);
      center[axis] = percentile(samples[axis], 0.5);
      high[axis] = percentile(samples[axis], 0.99);
      span[axis] = high[axis] - low[axis];
    }
    return { low, center, high, span };
  };
  const referenceProfile = profilePose(referencePositions);
  const centerLimit = config.targetHeight;
  const poseQualityReasons = (profile, meshPositions, strictGeometry) => {
    const reasons = [];
    for (let axis = 0; axis < 3; axis += 1) {
      if (![profile.low[axis], profile.center[axis], profile.high[axis]].every(Number.isFinite)) {
        reasons.push(`axis-${axis}-non-finite`);
        continue;
      }
      const centerShift = Math.abs(profile.center[axis] - referenceProfile.center[axis]);
      const maximumSpan = Math.max(config.targetHeight * 2, referenceProfile.span[axis] * 4);
      const minimumSpan = Math.max(1e-4, referenceProfile.span[axis] * 0.12);
      if (centerShift > centerLimit) reasons.push(`axis-${axis}-center-shift`);
      if (profile.span[axis] > maximumSpan) reasons.push(`axis-${axis}-expanded`);
      if (profile.span[axis] < minimumSpan) reasons.push(`axis-${axis}-collapsed`);
    }
    if (strictGeometry) {
      const ratios = qualityEdges.map(({ meshIndex, aOffset, bOffset, referenceLength }) => {
        const values = meshPositions[meshIndex];
        return Math.hypot(
          values[aOffset] - values[bOffset],
          values[aOffset + 1] - values[bOffset + 1],
          values[aOffset + 2] - values[bOffset + 2]
        ) / referenceLength;
      }).sort((a, b) => a - b);
      const lowRatio = percentile(ratios, 0.01);
      const highRatio = percentile(ratios, 0.99);
      if (lowRatio < 1 / 3) reasons.push("mesh-collapsed");
      if (highRatio > 6) reasons.push("mesh-expanded");
    }
    return reasons;
  };

  const clonePose = (pose) => pose.map((values) => new Float32Array(values));

  const clampSpatialOutliers = (meshPositions) => {
    const samples = [[], [], []];
    for (const values of meshPositions) {
      for (let index = 0; index < values.length; index += 3) {
        for (let axis = 0; axis < 3; axis += 1) samples[axis].push(values[index + axis]);
      }
    }
    const limits = samples.map((values) => {
      values.sort((a, b) => a - b);
      const low = percentile(values, 0.005);
      const high = percentile(values, 0.995);
      const span = Math.max(1e-4, high - low);
      return [low - span * 2, high + span * 2];
    });
    for (const values of meshPositions) {
      for (let index = 0; index < values.length; index += 3) {
        for (let axis = 0; axis < 3; axis += 1) {
          values[index + axis] = Math.max(
            limits[axis][0],
            Math.min(limits[axis][1], values[index + axis])
          );
        }
      }
    }
  };

  for (const spec of animationSpecs) {
    const startFrame = positionFrames.length;
    for (let frameIndex = 0; frameIndex < spec.frameCount; frameIndex += 1) {
      const denominator = spec.loop ? spec.frameCount : Math.max(1, spec.frameCount - 1);
      const sampleTime = spec.clip.duration * frameIndex / denominator;
      const positions = samplePose(spec.name, sampleTime);
      for (const meshPositions of positions) {
        for (let index = 0; index < meshPositions.length; index += 1) {
          meshPositions[index] *= unitScale;
        }
      }
      positionFrames.push(positions);
      normalFrames.push(sampleSmoothNormals(spec.name, sampleTime));
      frameQuality.push({
        clip: spec.key,
        frameOffset: frameIndex,
        strictGeometry: Boolean(spec.action && !["idle", "run"].includes(spec.action)),
        reasons: poseQualityReasons(
          profilePose(positions),
          positions,
          Boolean(spec.action && !["idle", "run"].includes(spec.action))
        )
      });
    }
    animationClips[spec.key] = {
      source: spec.actualName,
      startFrame,
      frameCount: spec.frameCount,
      duration: spec.clip.duration,
      loop: spec.loop
    };
  }

  // Some exported Model Viewer clips contain a few root/bone samples that move
  // most of the character tens of metres or collapse whole vertex islands. The
  // arena owns world movement, so replace only those unusable in-place samples
  // with their nearest valid authored neighbour. The runtime VAT blend keeps the
  // transition smooth without baking a midpoint that can fold rotating limbs.
  const repairedFrames = [];
  const repairInvalidFrames = () => {
    for (const clip of Object.values(animationClips)) {
      const first = clip.startFrame;
      const last = first + clip.frameCount - 1;
      for (let frameIndex = first; frameIndex <= last; frameIndex += 1) {
        const quality = frameQuality[frameIndex];
        if (!quality.reasons.length) continue;
        let before = frameIndex - 1;
        while (before >= first && frameQuality[before].reasons.length) before -= 1;
        let after = frameIndex + 1;
        while (after <= last && frameQuality[after].reasons.length) after += 1;
        const donor = before >= first && after <= last
          ? frameIndex - before <= after - frameIndex ? before : after
          : before >= first ? before : after <= last ? after : 0;
        positionFrames[frameIndex] = clonePose(positionFrames[donor]);
        normalFrames[frameIndex] = clonePose(normalFrames[donor]);
        repairedFrames.push({
          clip: quality.clip,
          frameOffset: quality.frameOffset,
          reasons: quality.reasons
        });
        quality.reasons = [];
      }
    }
  };
  repairInvalidFrames();
  for (const frame of positionFrames) clampSpatialOutliers(frame);

  const vertexCount = meshes.reduce(
    (sum, mesh) => sum + mesh.geometry.attributes.position.count,
    0
  );
  const indexCount = meshes.reduce((sum, mesh) => sum + mesh.geometry.index.count, 0);
  if (vertexCount >= 65536) throw new Error("Model exceeds Uint16 index range");

  // Build VAT bounds from the idle clip only, then pad for combat motion.
  // Zed Q/W/R (and several supporting clips) leave whole vertex islands at
  // ±1e4 after skinning — including them in min/max collapses the body.
  const idleClip = animationClips[config.actions.idle] ||
    animationClips[Object.keys(animationClips).find((key) => /idle/i.test(key)) || ""];
  const axisSamples = [[], [], []];
  const idleFrameCount = idleClip ? idleClip.frameCount : 1;
  const idleStart = idleClip ? idleClip.startFrame : 0;
  for (let frameOffset = 0; frameOffset < idleFrameCount; frameOffset += 1) {
    const frame = positionFrames[idleStart + frameOffset];
    for (const meshPositions of frame) {
      for (let index = 0; index < meshPositions.length; index += 3) {
        for (let axis = 0; axis < 3; axis += 1) {
          axisSamples[axis].push(meshPositions[index + axis]);
        }
      }
    }
  }
  const positionMin = [0, 0, 0];
  const positionMax = [0, 0, 0];
  const height = config.targetHeight || 2;
  for (let axis = 0; axis < 3; axis += 1) {
    const values = axisSamples[axis];
    values.sort((a, b) => a - b);
    const low = percentile(values, 0.01);
    const high = percentile(values, 0.99);
    const center = (low + high) * 0.5;
    const half = Math.max((high - low) * 0.5, height * (axis === 1 ? 0.15 : 0.2));
    // Idle box padded so run/attack still fit; hard-cap so one exploded prop
    // cannot re-open a multi-kilometer range.
    const pad = axis === 1 ? height * 0.35 : height * 0.85;
    positionMin[axis] = Math.max(center - half - pad, low - pad);
    positionMax[axis] = Math.min(center + half + pad, high + pad);
  }
  // Keep feet near the idle contact plane.
  const foot = percentile(axisSamples[1], 0.02);
  positionMin[1] = Math.min(positionMin[1], foot - height * 0.05);
  positionMax[1] = Math.max(positionMax[1], percentile(axisSamples[1], 0.99) + height * 0.2);
  // Absolute safety cap relative to idle center (stops any residual runaway).
  const idleCenter = axisSamples.map((values) => percentile(values, 0.5));
  positionMin[0] = Math.max(positionMin[0], idleCenter[0] - height * 1.6);
  positionMax[0] = Math.min(positionMax[0], idleCenter[0] + height * 1.6);
  positionMin[1] = Math.max(positionMin[1], idleCenter[1] - height * 1.2);
  positionMax[1] = Math.min(positionMax[1], idleCenter[1] + height * 1.4);
  positionMin[2] = Math.max(positionMin[2], idleCenter[2] - height * 1.6);
  positionMax[2] = Math.min(positionMax[2], idleCenter[2] + height * 1.6);
  const positionRange = positionMax.map((maximum, axis) =>
    Math.max(1e-6, maximum - positionMin[axis])
  );
  const clampToPositionBounds = (meshPositions) => {
    for (const values of meshPositions) {
      for (let index = 0; index < values.length; index += 3) {
        for (let axis = 0; axis < 3; axis += 1) {
          values[index + axis] = Math.max(
            positionMin[axis],
            Math.min(positionMax[axis], values[index + axis]),
          );
        }
      }
    }
  };
  // The GPU only sees values after this global clamp and Uint16 packing. Re-run
  // the gate on that exact spatial domain so a pose cannot pass in float space
  // and then collapse into a boundary plane when encoded as VAT data.
  for (let frameIndex = 0; frameIndex < positionFrames.length; frameIndex += 1) {
    const clampedPose = clonePose(positionFrames[frameIndex]);
    let saturatedComponents = 0;
    let componentCount = 0;
    for (const values of clampedPose) {
      for (let index = 0; index < values.length; index += 3) {
        for (let axis = 0; axis < 3; axis += 1) {
          if (values[index + axis] <= positionMin[axis] || values[index + axis] >= positionMax[axis]) {
            saturatedComponents += 1;
          }
          componentCount += 1;
        }
      }
    }
    clampToPositionBounds(clampedPose);
    const quality = frameQuality[frameIndex];
    quality.reasons = poseQualityReasons(
      profilePose(clampedPose),
      clampedPose,
      quality.strictGeometry
    );
    if (saturatedComponents / Math.max(1, componentCount) >= 0.05) {
      quality.reasons.push("position-bounds-saturation");
    }
    quality.reasons = [...new Set(quality.reasons)];
  }
  repairInvalidFrames();
  // Re-clamp every sample into the robust global box before quantization.
  for (const frame of positionFrames) clampToPositionBounds(frame);

  const frameCount = positionFrames.length;
  const quantizedPositions = new Uint16Array(frameCount * vertexCount * 4);
  const quantizedNormals = new Uint8Array(frameCount * vertexCount * 4);
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    let frameVertexOffset = 0;
    for (let meshIndex = 0; meshIndex < meshes.length; meshIndex += 1) {
      const positions = positionFrames[frameIndex][meshIndex];
      const normals = normalFrames[frameIndex][meshIndex];
      const meshVertexCount = positions.length / 3;
      for (let vertexIndex = 0; vertexIndex < meshVertexCount; vertexIndex += 1) {
        const source = vertexIndex * 3;
        const target = (frameIndex * vertexCount + frameVertexOffset + vertexIndex) * 4;
        for (let axis = 0; axis < 3; axis += 1) {
          const normalizedPosition = (positions[source + axis] - positionMin[axis]) /
            positionRange[axis];
          quantizedPositions[target + axis] = Math.round(
            Math.max(0, Math.min(1, normalizedPosition)) * 65535
          );
          quantizedNormals[target + axis] = Math.round(
            (Math.max(-1, Math.min(1, normals[source + axis])) * 0.5 + 0.5) * 255
          );
        }
        quantizedPositions[target + 3] = 65535;
        quantizedNormals[target + 3] = 255;
      }
      frameVertexOffset += meshVertexCount;
    }
  }

  const vertices = new Float32Array(vertexCount * 2);
  const indices = new Uint16Array(indexCount);
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const mesh of meshes) {
    const uv = mesh.geometry.attributes.uv;
    for (let vertexIndex = 0; vertexIndex < uv.count; vertexIndex += 1) {
      const target = (vertexOffset + vertexIndex) * 2;
      vertices[target] = uv.getX(vertexIndex);
      vertices[target + 1] = config.invertUvV ? 1 - uv.getY(vertexIndex) : uv.getY(vertexIndex);
    }
    const sourceIndices = mesh.geometry.index.array;
    for (let sourceIndex = 0; sourceIndex < sourceIndices.length; sourceIndex += 1) {
      indices[indexOffset + sourceIndex] = sourceIndices[sourceIndex] + vertexOffset;
    }
    vertexOffset += uv.count;
    indexOffset += sourceIndices.length;
  }

  const skeletonBoneCount = Math.max(...meshes.map((mesh) => mesh.skeleton.bones.length));
  const animationDiagnostics = animationSpecs.map((spec) => {
    const animatedNodes = new Set(spec.clip.tracks.map((track) =>
      track.name.replace(/\.(?:position|quaternion|scale)$/, "")
    ));
    return {
      requestedName: spec.name,
      actualName: spec.actualName,
      duration: spec.clip.duration,
      trackCount: spec.clip.tracks.length,
      coverage: animatedNodes.size / Math.max(1, skeletonBoneCount)
    };
  });
  const source = config.sourceLabel ||
    `Khada Model Viewer ${config.displayName} base GLB with all animation clips`;

  await fs.mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    fs.writeFile(
      path.join(outputDirectory, `${champion}-model-vertices.bin`),
      Buffer.from(vertices.buffer)
    ),
    fs.writeFile(
      path.join(outputDirectory, `${champion}-model-indices.bin`),
      Buffer.from(indices.buffer)
    ),
    fs.writeFile(
      path.join(outputDirectory, `${champion}-model-frames.bin`),
      Buffer.from(quantizedPositions.buffer)
    ),
    fs.writeFile(
      path.join(outputDirectory, `${champion}-model-normals.bin`),
      Buffer.from(quantizedNormals.buffer)
    ),
    fs.writeFile(path.join(outputDirectory, `${champion}-model-metadata.json`), JSON.stringify({
      runtime: config.runtime,
      completeClipCatalog: true,
      source,
      sourceUrl: config.sourceUrl,
      unitScale,
      vertexCount,
      indexCount,
      strideFloats: 2,
      frameCount,
      textureDimensions: [vertexCount, frameCount],
      positionBounds: { min: positionMin, max: positionMax, range: positionRange },
      materials: meshes.map((mesh) => mesh.material?.name ?? "unknown"),
      skeletonBoneCount,
      animationDiagnostics,
      poseQuality: {
        centerLimit,
        maximumSpanMultiplier: 4,
        minimumSpanMultiplier: 0.12,
        repairedFrameCount: repairedFrames.length,
        repairedFrames
      },
      animationActions: config.actions,
      animationClips
    }, null, 2))
  ]);

  console.log(JSON.stringify({
    champion,
    runtime: config.runtime,
    vertexCount,
    indexCount,
    frameCount,
    animations: Object.keys(animationClips)
  }, null, 2));
  process.exit(0);
}

const posesByMesh = config.poses.map(([name, time]) => samplePose(name, time));
let sourceHeight = 0;
if (config.robustGround) {
  const heights = [];
  for (const positions of posesByMesh[0]) {
    for (let index = 1; index < positions.length; index += 3) heights.push(positions[index]);
  }
  heights.sort((a, b) => a - b);
  // Floor is already 0 after clamp; p99 is the standing crown (ignore rare max spikes).
  sourceHeight = Math.max(1e-4, percentile(heights, 0.995));
} else {
  for (const positions of posesByMesh[0]) {
    for (let index = 1; index < positions.length; index += 3) sourceHeight = Math.max(sourceHeight, positions[index]);
  }
}
const unitScale = config.targetHeight / sourceHeight;
for (const pose of posesByMesh) {
  for (const positions of pose) {
    for (let index = 0; index < positions.length; index += 1) positions[index] *= unitScale;
  }
}

const normalIdle = sampleSmoothNormals(...config.normalIdle);
const normalSkill = sampleSmoothNormals(...config.normalSkill);
const vertexCount = meshes.reduce((sum, mesh) => sum + mesh.geometry.attributes.position.count, 0);
const indexCount = meshes.reduce((sum, mesh) => sum + mesh.geometry.index.count, 0);
if (vertexCount >= 65536) throw new Error("Model exceeds Uint16 index range");

const strideFloats = 26;
const vertices = new Float32Array(vertexCount * strideFloats);
const indices = new Uint16Array(indexCount);
let vertexOffset = 0;
let indexOffset = 0;

for (let meshIndex = 0; meshIndex < meshes.length; meshIndex += 1) {
  const mesh = meshes[meshIndex];
  const count = mesh.geometry.attributes.position.count;
  const uv = mesh.geometry.attributes.uv;
  for (let vertexIndex = 0; vertexIndex < count; vertexIndex += 1) {
    const target = (vertexOffset + vertexIndex) * strideFloats;
    for (let poseIndex = 0; poseIndex < 6; poseIndex += 1) {
      const source = posesByMesh[poseIndex][meshIndex];
      vertices[target + poseIndex * 3] = source[vertexIndex * 3];
      vertices[target + poseIndex * 3 + 1] = source[vertexIndex * 3 + 1];
      vertices[target + poseIndex * 3 + 2] = source[vertexIndex * 3 + 2];
    }
    vertices[target + 18] = normalIdle[meshIndex][vertexIndex * 3];
    vertices[target + 19] = normalIdle[meshIndex][vertexIndex * 3 + 1];
    vertices[target + 20] = normalIdle[meshIndex][vertexIndex * 3 + 2];
    vertices[target + 21] = normalSkill[meshIndex][vertexIndex * 3];
    vertices[target + 22] = normalSkill[meshIndex][vertexIndex * 3 + 1];
    vertices[target + 23] = normalSkill[meshIndex][vertexIndex * 3 + 2];
    const sourceU = uv.getX(vertexIndex);
    const sourceV = uv.getY(vertexIndex);
    const weaponAtlasSide = /^(Blade1|Gem1)$/.test(mesh.material?.name ?? "");
    vertices[target + 24] = usesBattleQueenAtlas
      ? sourceU * (weaponAtlasSide ? 0.2 : 0.8) + (weaponAtlasSide ? 0.8 : 0)
      : sourceU;
    // glTF textures are V-top; game atlases + UNPACK_FLIP_Y expect the opposite for our shader path.
    vertices[target + 25] = config.invertUvV ? 1 - sourceV : sourceV;
  }
  const sourceIndices = mesh.geometry.index.array;
  for (let sourceIndex = 0; sourceIndex < sourceIndices.length; sourceIndex += 1) {
    indices[indexOffset + sourceIndex] = sourceIndices[sourceIndex] + vertexOffset;
  }
  vertexOffset += count;
  indexOffset += sourceIndices.length;
}

const bounds = config.poses.map((_, poseIndex) => {
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    const offset = vertexIndex * strideFloats + poseIndex * 3;
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], vertices[offset + axis]);
      maximum[axis] = Math.max(maximum[axis], vertices[offset + axis]);
    }
  }
  return { min: minimum, max: maximum };
});

const skeletonBoneCount = Math.max(...meshes.map((mesh) => mesh.skeleton.bones.length));
const diagnosticNames = [...new Set(config.poses.map(([name]) =>
  name === "grounded_cast_from_idle_b" ? "katarina_idle1" : name
))];
const animationDiagnostics = diagnosticNames.map((requestedName) => {
  const actualName = resolveClipName(requestedName);
  const clip = clips.get(actualName);
  return {
    requestedName,
    actualName,
    duration: clip.duration,
    trackCount: clip.tracks.length,
    coverage: clip.tracks.length / Math.max(1, skeletonBoneCount * 3)
  };
});

await fs.mkdir(outputDirectory, { recursive: true });
await Promise.all([
  fs.writeFile(path.join(outputDirectory, `${champion}-model-vertices.bin`), Buffer.from(vertices.buffer)),
  fs.writeFile(path.join(outputDirectory, `${champion}-model-indices.bin`), Buffer.from(indices.buffer)),
  fs.writeFile(path.join(outputDirectory, `${champion}-model-metadata.json`), JSON.stringify({
    source: usesBattleQueenAtlas
      ? "Battle Queen Katarina (skin29)"
      : (config.sourceLabel || `Classic ${config.displayName} game mesh and matching base rig`),
    unitScale,
    vertexCount,
    indexCount,
    strideFloats,
    materials: meshes.map((mesh) => mesh.material?.name ?? "unknown"),
    skeletonBoneCount,
    animationDiagnostics,
    poseSpecs: config.poses,
    bounds
  }, null, 2))
]);

console.log(JSON.stringify({ champion, vertexCount, indexCount, skeletonBoneCount, bounds }, null, 2));
