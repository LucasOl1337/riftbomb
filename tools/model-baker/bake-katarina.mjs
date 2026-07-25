import fs from "node:fs/promises";
import path from "node:path";
import {
  AnimationMixer,
  Vector3
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const [inputPath, outputDirectory] = process.argv.slice(2);
if (!inputPath || !outputDirectory) {
  throw new Error("Usage: node bake-katarina.mjs <animated.glb> <output-directory>");
}

const bytes = await fs.readFile(inputPath);
const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const gltf = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(arrayBuffer, "", resolve, reject);
});

const meshes = [];
gltf.scene.traverse((node) => {
  const materialName = node.material?.name ?? "";
  const optionalBattleQueenMesh = /^(Blade|Gem)[2-6]$/.test(materialName);
  if (!node.isSkinnedMesh || ["Recall", "Lizard", "Joke"].includes(materialName) || optionalBattleQueenMesh) return;
  const geometry = node.geometry;
  if (!geometry.attributes.position || !geometry.attributes.uv || !geometry.index) return;
  meshes.push(node);
});

if (!meshes.length) throw new Error("No playable skinned meshes found");
const usesBattleQueenAtlas = meshes.some((mesh) => mesh.material?.name === "Main_Mat");

const clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
const lotusPoseTime = clips.has("spell4") ? 1.2 : 0.4;
const poseSpecs = [
  ["katarina_idle1", 0.0],
  ["katarina_idle1", 0.47],
  ["katarina_run", 0.0],
  ["katarina_run", 0.4],
  ["grounded_cast_from_idle_b", 0.0],
  ["katarina_spell4", lotusPoseTime]
];

const mixer = new AnimationMixer(gltf.scene);
const resolveClipName = (requestedName) => {
  const candidates = [requestedName, requestedName.replace(/^katarina_/, "")];
  return candidates.find((candidate) => clips.has(candidate));
};
const applyPose = (clipName, time) => {
  const requestedClipName = clipName === "grounded_cast_from_idle_b" ? "katarina_idle1" : clipName;
  const actualClipName = resolveClipName(requestedClipName);
  const actualTime = clipName === "grounded_cast_from_idle_b" ? 0.47 : time;
  const clip = clips.get(actualClipName);
  if (!clip) throw new Error(`Missing animation clip: ${requestedClipName}`);

  mixer.stopAllAction();
  mixer.setTime(0);
  const action = mixer.clipAction(clip);
  action.reset().play();
  mixer.setTime(Math.min(actualTime, Math.max(0, clip.duration - 1e-4)));
  gltf.scene.updateMatrixWorld(true);
  for (const mesh of meshes) mesh.skeleton.update();
};

const samplePose = (clipName, time) => {
  applyPose(clipName, time);

  const positions = [];
  let minimumY = Infinity;
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
      minimumY = Math.min(minimumY, point.y);
    }
    positions.push(values);
  }

  for (const values of positions) {
    for (let index = 1; index < values.length; index += 3) values[index] -= minimumY;
  }
  return positions;
};

const sampleSmoothNormals = (clipName, time) => {
  applyPose(clipName, time);
  const result = [];
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
    result.push(values);
  }
  return result;
};

const posesByMesh = poseSpecs.map(([name, time]) => samplePose(name, time));
const sourceHeight = Math.max(...posesByMesh[0].flatMap((positions) => {
  const heights = [];
  for (let index = 1; index < positions.length; index += 3) heights.push(positions[index]);
  return heights;
}));
const unitScale = 2.08 / sourceHeight;
for (const pose of posesByMesh) {
  for (const positions of pose) {
    for (let index = 0; index < positions.length; index += 1) positions[index] *= unitScale;
  }
}

const normalIdle = sampleSmoothNormals("katarina_idle1", 0.0);
const normalLotus = sampleSmoothNormals("katarina_spell4", lotusPoseTime);
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
    vertices[target + 21] = normalLotus[meshIndex][vertexIndex * 3];
    vertices[target + 22] = normalLotus[meshIndex][vertexIndex * 3 + 1];
    vertices[target + 23] = normalLotus[meshIndex][vertexIndex * 3 + 2];
    const sourceU = uv.getX(vertexIndex);
    const weaponAtlasSide = /^(Blade1|Gem1)$/.test(mesh.material?.name ?? "");
    vertices[target + 24] = usesBattleQueenAtlas
      ? sourceU * (weaponAtlasSide ? 0.2 : 0.8) + (weaponAtlasSide ? 0.8 : 0)
      : sourceU;
    vertices[target + 25] = uv.getY(vertexIndex);
  }
  const sourceIndices = mesh.geometry.index.array;
  for (let sourceIndex = 0; sourceIndex < sourceIndices.length; sourceIndex += 1) {
    indices[indexOffset + sourceIndex] = sourceIndices[sourceIndex] + vertexOffset;
  }
  vertexOffset += count;
  indexOffset += sourceIndices.length;
}

const bounds = poseSpecs.map((_, poseIndex) => {
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
const animationDiagnostics = [...new Set(poseSpecs.map(([name]) =>
  name === "grounded_cast_from_idle_b" ? "katarina_idle1" : name
))].map((requestedName) => {
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
  fs.writeFile(path.join(outputDirectory, "katarina-model-vertices.bin"), Buffer.from(vertices.buffer)),
  fs.writeFile(path.join(outputDirectory, "katarina-model-indices.bin"), Buffer.from(indices.buffer)),
  fs.writeFile(path.join(outputDirectory, "katarina-model-metadata.json"), JSON.stringify({
    source: usesBattleQueenAtlas
      ? "Battle Queen Katarina (skin29)"
      : "Modern Katarina game mesh",
    unitScale,
    vertexCount,
    indexCount,
    strideFloats,
    materials: meshes.map((mesh) => mesh.material?.name ?? "unknown"),
    skeletonBoneCount,
    animationDiagnostics,
    poseSpecs,
    bounds
  }, null, 2))
]);

console.log(JSON.stringify({ vertexCount, indexCount, bounds }, null, 2));
