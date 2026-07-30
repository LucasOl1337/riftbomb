import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import path from "node:path";

const gameDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(gameDirectory);
const benchmarkChampions = ["katarina", "zed"];

const percentile = (values, ratio) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
};

async function loadChampion(champion) {
  const modelDirectory = path.join(repositoryRoot, "champions", champion, "playable-model");
  const [metadata, frameBytes, normalBytes] = await Promise.all([
    readFile(path.join(modelDirectory, `${champion}-model-metadata.json`), "utf8").then(JSON.parse),
    readFile(path.join(modelDirectory, `${champion}-model-frames.bin`)),
    readFile(path.join(modelDirectory, `${champion}-model-normals.bin`))
  ]);
  return {
    champion,
    metadata,
    frames: new Uint16Array(
      frameBytes.buffer,
      frameBytes.byteOffset,
      frameBytes.byteLength / Uint16Array.BYTES_PER_ELEMENT
    ),
    normals: normalBytes,
    dynamicVertices: new Float32Array(metadata.vertexCount * 26)
  };
}

function emulateLegacyCpuFrame(model, phase) {
  const { metadata, frames, normals, dynamicVertices } = model;
  const { vertexCount, frameCount } = metadata;
  const min = metadata.positionBounds.min;
  const range = metadata.positionBounds.range;
  const frameA = Math.floor(phase) % frameCount;
  const frameB = (frameA + 1) % frameCount;
  const mix = phase - Math.floor(phase);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const sourceA = (frameA * vertexCount + vertex) * 4;
    const sourceB = (frameB * vertexCount + vertex) * 4;
    const target = vertex * 26;
    for (let axis = 0; axis < 3; axis += 1) {
      const positionA = min[axis] + frames[sourceA + axis] / 65535 * range[axis];
      const positionB = min[axis] + frames[sourceB + axis] / 65535 * range[axis];
      const position = positionA + (positionB - positionA) * mix;
      for (let slot = 0; slot < 6; slot += 1) {
        dynamicVertices[target + slot * 3 + axis] = position;
      }
      const normalA = normals[sourceA + axis] / 255 * 2 - 1;
      const normalB = normals[sourceB + axis] / 255 * 2 - 1;
      const normal = normalA + (normalB - normalA) * mix;
      dynamicVertices[target + 18 + axis] = normal;
      dynamicVertices[target + 21 + axis] = normal;
    }
  }
}

const models = await Promise.all(benchmarkChampions.map(loadChampion));
for (let warmup = 0; warmup < 10; warmup += 1) {
  for (const model of models) emulateLegacyCpuFrame(model, warmup * 0.37);
}

const samples = [];
for (let batch = 0; batch < 9; batch += 1) {
  for (let update = 0; update < 40; update += 1) {
    const start = performance.now();
    for (const model of models) emulateLegacyCpuFrame(model, batch * 3.1 + update * 0.37);
    samples.push(performance.now() - start);
  }
}

const legacyUploadBytesPerFrame = models.reduce(
  (total, model) => total + model.dynamicVertices.byteLength,
  0
);
const result = {
  benchmark: "Katarina + Zed VAT animation update",
  warmups: 10,
  measuredFrames: samples.length,
  legacyCpuMsPerFrame: {
    median: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    p99: percentile(samples, 0.99)
  },
  legacyAnimationUpload: {
    bytesPerFrame: legacyUploadBytesPerFrame,
    mebibytesPerFrame: legacyUploadBytesPerFrame / 1024 / 1024,
    mebibytesPerSecondAt60Fps: legacyUploadBytesPerFrame * 60 / 1024 / 1024
  },
  gpuVatHotPath: {
    javascriptVertexIterationsPerFrame: 0,
    animationUploadBytesPerFrame: 0,
    perFrameState: "uniforms and indexed draw only"
  }
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
