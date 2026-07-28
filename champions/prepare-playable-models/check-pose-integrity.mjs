import fs from "node:fs";
import path from "node:path";

const bakedDirectory = process.argv[2] ?? "champions/katarina/playable-model";
const metadataFiles = fs.readdirSync(bakedDirectory).filter((file) => file.endsWith("-model-metadata.json"));
if (metadataFiles.length !== 1) {
  throw new Error(`Expected one model metadata file in ${bakedDirectory}, found ${metadataFiles.length}`);
}
const modelPrefix = metadataFiles[0].replace("-model-metadata.json", "");
const metadata = JSON.parse(fs.readFileSync(path.join(bakedDirectory, `${modelPrefix}-model-metadata.json`), "utf8"));
const verticesBuffer = fs.readFileSync(path.join(bakedDirectory, `${modelPrefix}-model-vertices.bin`));
const indicesBuffer = fs.readFileSync(path.join(bakedDirectory, `${modelPrefix}-model-indices.bin`));
const vertices = new Float32Array(
  verticesBuffer.buffer,
  verticesBuffer.byteOffset,
  verticesBuffer.byteLength / Float32Array.BYTES_PER_ELEMENT
);
const indices = new Uint16Array(
  indicesBuffer.buffer,
  indicesBuffer.byteOffset,
  indicesBuffer.byteLength / Uint16Array.BYTES_PER_ELEMENT
);

if (metadata.runtime === "vat-v1") {
  const framesBuffer = fs.readFileSync(
    path.join(bakedDirectory, `${modelPrefix}-model-frames.bin`)
  );
  const frames = new Uint16Array(
    framesBuffer.buffer,
    framesBuffer.byteOffset,
    framesBuffer.byteLength / Uint16Array.BYTES_PER_ELEMENT
  );
  const { vertexCount, frameCount, positionBounds, animationClips } = metadata;
  if (frames.length !== vertexCount * frameCount * 4) {
    throw new Error(`Unexpected VAT frame buffer size: ${frames.length}`);
  }

  const positionAt = (vertex, frame) => {
    const offset = (frame * vertexCount + vertex) * 4;
    return [0, 1, 2].map((axis) =>
      positionBounds.min[axis] +
      frames[offset + axis] / 65535 * positionBounds.range[axis]
    );
  };
  const edgeKey = (a, b) => Math.min(a, b) * 65536 + Math.max(a, b);
  const edges = [];
  const seenEdges = new Set();
  for (let index = 0; index < indices.length; index += 3) {
    const triangle = [indices[index], indices[index + 1], indices[index + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = triangle[edge];
      const b = triangle[(edge + 1) % 3];
      const key = edgeKey(a, b);
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      const pa = positionAt(a, 0);
      const pb = positionAt(b, 0);
      const referenceLength = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
      if (referenceLength > 1e-5) edges.push({ a, b, referenceLength });
    }
  }

  const percentile = (values, p) =>
    values[Math.min(values.length - 1, Math.floor(values.length * p))];
  const evaluate = (label, frame) => {
    const ratios = edges.map(({ a, b, referenceLength }) => {
      const pa = positionAt(a, frame);
      const pb = positionAt(b, frame);
      return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]) / referenceLength;
    }).sort((a, b) => a - b);
    const inverseRatios = ratios
      .map((ratio) => 1 / Math.max(ratio, 1e-9))
      .sort((a, b) => a - b);
    return {
      label,
      p01: percentile(ratios, 0.01),
      p99: percentile(ratios, 0.99),
      max: ratios.at(-1),
      collapseP99: percentile(inverseRatios, 0.99)
    };
  };

  const sampleFrames = [];
  for (const [key, clip] of Object.entries(animationClips)) {
    sampleFrames.push([`${key}:first`, clip.startFrame]);
    sampleFrames.push([
      `${key}:middle`,
      clip.startFrame + Math.floor((clip.frameCount - 1) / 2)
    ]);
    sampleFrames.push([`${key}:last`, clip.startFrame + clip.frameCount - 1]);
  }
  const reports = sampleFrames.map(([label, frame]) => evaluate(label, frame));
  console.table(reports.map((report) => ({
    pose: report.label,
    p01: report.p01.toFixed(3),
    p99: report.p99.toFixed(3),
    max: report.max.toFixed(2),
    collapseP99: report.collapseP99.toFixed(3)
  })));

  const animationDiagnostics = metadata.animationDiagnostics ?? [];
  console.table(animationDiagnostics.map((animation) => ({
    animation: animation.actualName,
    tracks: animation.trackCount,
    skeletonBones: metadata.skeletonBoneCount,
    coverage: animation.coverage.toFixed(3)
  })));
  const geometryFailures = reports.filter(
    (report) => report.p99 > 3 || report.collapseP99 > 3
  );
  const coverageFailures = animationDiagnostics.filter(
    (animation) => animation.coverage < 0.9
  );
  if (geometryFailures.length || coverageFailures.length) {
    if (geometryFailures.length) {
      console.error(
        `VAT geometry failed for: ${geometryFailures.map((report) => report.label).join(", ")}`
      );
    }
    if (coverageFailures.length) {
      console.error(
        `Animation rig coverage failed for: ${coverageFailures.map((animation) => animation.actualName).join(", ")}`
      );
    }
    process.exit(1);
  }
  console.log(
    `VAT pose integrity passed across ${frameCount} frames and ${edges.length} unique mesh edges.`
  );
  process.exit(0);
}

const { strideFloats, vertexCount, poseSpecs } = metadata;
if (vertices.length !== vertexCount * strideFloats) {
  throw new Error(`Unexpected vertex buffer size: ${vertices.length}`);
}

const edgeLength = (a, b, poseA, poseB = poseA, blend = 0) => {
  const aBase = a * strideFloats;
  const bBase = b * strideFloats;
  const aOffsetA = aBase + poseA * 3;
  const bOffsetA = bBase + poseA * 3;
  const aOffsetB = aBase + poseB * 3;
  const bOffsetB = bBase + poseB * 3;
  const ax = vertices[aOffsetA] + (vertices[aOffsetB] - vertices[aOffsetA]) * blend;
  const ay = vertices[aOffsetA + 1] + (vertices[aOffsetB + 1] - vertices[aOffsetA + 1]) * blend;
  const az = vertices[aOffsetA + 2] + (vertices[aOffsetB + 2] - vertices[aOffsetA + 2]) * blend;
  const bx = vertices[bOffsetA] + (vertices[bOffsetB] - vertices[bOffsetA]) * blend;
  const by = vertices[bOffsetA + 1] + (vertices[bOffsetB + 1] - vertices[bOffsetA + 1]) * blend;
  const bz = vertices[bOffsetA + 2] + (vertices[bOffsetB + 2] - vertices[bOffsetA + 2]) * blend;
  return Math.hypot(ax - bx, ay - by, az - bz);
};

const percentile = (values, p) => values[Math.min(values.length - 1, Math.floor(values.length * p))];
const edgeKey = (a, b) => Math.min(a, b) * 65536 + Math.max(a, b);

const edges = [];
const seenEdges = new Set();
for (let index = 0; index < indices.length; index += 3) {
  const triangle = [indices[index], indices[index + 1], indices[index + 2]];
  for (let edge = 0; edge < 3; edge += 1) {
    const a = triangle[edge];
    const b = triangle[(edge + 1) % 3];
    const key = edgeKey(a, b);
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    const referenceLength = edgeLength(a, b, 0);
    if (referenceLength > 1e-5) edges.push({ a, b, referenceLength });
  }
}

const evaluate = (label, poseA, poseB = poseA, blend = 0) => {
  const ratios = edges.map(({ a, b, referenceLength }) =>
    edgeLength(a, b, poseA, poseB, blend) / referenceLength
  ).sort((a, b) => a - b);
  const inverseRatios = ratios.map((ratio) => 1 / Math.max(ratio, 1e-9)).sort((a, b) => a - b);
  return {
    label,
    min: ratios[0],
    p01: percentile(ratios, 0.01),
    p99: percentile(ratios, 0.99),
    max: ratios.at(-1),
    collapseP99: percentile(inverseRatios, 0.99),
    severeEdges: ratios.filter((ratio) => ratio > 2.2 || ratio < 0.45).length
  };
};

const reports = poseSpecs.map(([name, time], index) => evaluate(`${index}:${name}@${time}`, index));
reports.push(evaluate("idle-transition@50%", 0, 1, 0.5));
reports.push(evaluate("run-transition@50%", 2, 3, 0.5));

console.table(reports.map((report) => ({
  pose: report.label,
  p01: report.p01.toFixed(3),
  p99: report.p99.toFixed(3),
  max: report.max.toFixed(2),
  collapseP99: report.collapseP99.toFixed(3),
  severeEdges: report.severeEdges
})));

const animationDiagnostics = metadata.animationDiagnostics ?? [];
if (animationDiagnostics.length) {
  console.table(animationDiagnostics.map((animation) => ({
    animation: animation.actualName,
    tracks: animation.trackCount,
    skeletonBones: metadata.skeletonBoneCount,
    coverage: animation.coverage.toFixed(3)
  })));
}

// A skinned character may flex, but neighboring vertices should not stretch or
// collapse across a meaningful portion of the mesh. More importantly, every
// authored animation must cover the skin's skeleton; a base-rig clip on a
// legendary-skin skeleton leaves hair, weapons, and cloth in incompatible poses.
const geometryFailures = reports.filter((report) => report.p99 > 3 || report.collapseP99 > 3);
const coverageFailures = animationDiagnostics.filter((animation) => animation.coverage < 0.9);
if (geometryFailures.length || coverageFailures.length) {
  if (geometryFailures.length) {
    console.error(`Pose geometry failed for: ${geometryFailures.map((report) => report.label).join(", ")}`);
  }
  if (coverageFailures.length) {
    console.error(`Animation rig coverage failed for: ${coverageFailures.map((animation) => animation.actualName).join(", ")}`);
  }
  process.exit(1);
}

console.log(`Pose integrity passed across ${edges.length} unique mesh edges.`);
