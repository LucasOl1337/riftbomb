import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";
import {
  katarinaDaggerPresentation,
  packageKatarinaDagger,
  packagePlayableChampions,
  playableChampions,
} from "./package-playable-champions.mjs";
import "./plan-vat-frame-repairs.test.mjs";

const preparationDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(preparationDirectory, "..", "..");
const execFileAsync = promisify(execFile);

const multiplyMatrices = (left, right) => {
  const output = new Float64Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      output[column * 4 + row] =
        left[row] * right[column * 4] +
        left[4 + row] * right[column * 4 + 1] +
        left[8 + row] * right[column * 4 + 2] +
        left[12 + row] * right[column * 4 + 3];
    }
  }
  return output;
};

const perspectiveMatrix = (fieldOfView, aspect, near, far) => {
  const focalLength = 1 / Math.tan(fieldOfView / 2);
  const range = 1 / (near - far);
  return new Float64Array([
    focalLength / aspect, 0, 0, 0,
    0, focalLength, 0, 0,
    0, 0, (far + near) * range, -1,
    0, 0, 2 * far * near * range, 0,
  ]);
};

const normalise = (vector) => {
  const length = Math.hypot(...vector) || 1;
  return vector.map((value) => value / length);
};

const lookAtMatrix = (eye, target) => {
  const forward = normalise(eye.map((value, axis) => value - target[axis]));
  const right = normalise([
    forward[2],
    0,
    -forward[0],
  ]);
  const up = [
    forward[1] * right[2],
    forward[2] * right[0] - forward[0] * right[2],
    -forward[1] * right[0],
  ];
  const dot = (left, rightVector) =>
    left.reduce((sum, value, axis) => sum + value * rightVector[axis], 0);
  return new Float64Array([
    right[0], up[0], forward[0], 0,
    right[1], up[1], forward[1], 0,
    right[2], up[2], forward[2], 0,
    -dot(right, eye), -dot(up, eye), -dot(forward, eye), 1,
  ]);
};

const daggerModelMatrix = (scale, heading, pitch, height) => {
  const cosine = Math.cos(heading);
  const sine = Math.sin(heading);
  const base = new Float64Array([
    cosine * scale, 0, -sine * scale, 0,
    0, scale, 0, 0,
    sine * scale, 0, cosine * scale, 0,
    0, height, 0, 1,
  ]);
  const pitchCosine = Math.cos(pitch);
  const pitchSine = Math.sin(pitch);
  return multiplyMatrices(base, new Float64Array([
    1, 0, 0, 0,
    0, pitchCosine, pitchSine, 0,
    0, -pitchSine, pitchCosine, 0,
    0, 0, 0, 1,
  ]));
};

const measureDaggerSilhouette = (dagger, { scale, heading, pitch, height: modelHeight }) => {
  // The canonical viewport and camera match the desktop overview in the reported capture.
  const width = 843;
  const viewportHeight = 533;
  const viewProjection = multiplyMatrices(
    perspectiveMatrix(0.74, width / viewportHeight, 0.1, 70),
    lookAtMatrix([0, 14.6, 13.4], [0, 0.2, 0.12]),
  );
  const matrix = multiplyMatrices(
    viewProjection,
    daggerModelMatrix(scale, heading, pitch, modelHeight),
  );
  const minimum = [Infinity, Infinity];
  const maximum = [-Infinity, -Infinity];
  for (let index = 0; index < dagger.length; index += 6) {
    const x = dagger[index];
    const y = dagger[index + 1];
    const z = dagger[index + 2];
    const clipX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
    const clipY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
    const clipW = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
    const screen = [
      (clipX / clipW * 0.5 + 0.5) * width,
      (1 - (clipY / clipW * 0.5 + 0.5)) * viewportHeight,
    ];
    for (let axis = 0; axis < 2; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], screen[axis]);
      maximum[axis] = Math.max(maximum[axis], screen[axis]);
    }
  }
  const size = maximum.map((value, axis) => value - minimum[axis]);
  return {
    size,
    major: Math.max(...size),
    area: size[0] * size[1],
  };
};

test("one deep bake module owns every playable champion", async () => {
  const files = await readdir(preparationDirectory);

  assert.deepEqual(files.filter((file) => file.startsWith("bake-")).sort(), ["bake-playable-champion.mjs"]);
  assert.deepEqual(files.filter((file) => file.startsWith("embed-")).sort(), []);
});

test("the packaged catalog comes from each champion playable model", async () => {
  const catalog = await packagePlayableChampions(repositoryRoot);

  assert.match(catalog, /katarina.*"dagger":"[A-Za-z0-9+/=]+"/s);
  const daggerMatch = catalog.match(/"dagger":"([A-Za-z0-9+/=]+)"/);
  const daggerBytes = Buffer.from(daggerMatch[1], "base64");
  const dagger = new Float32Array(
    daggerBytes.buffer,
    daggerBytes.byteOffset,
    daggerBytes.byteLength / Float32Array.BYTES_PER_ELEMENT
  );
  const bounds = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  for (let index = 0; index < dagger.length; index += 6) {
    for (let axis = 0; axis < 3; axis += 1) {
      bounds[0][axis] = Math.min(bounds[0][axis], dagger[index + axis]);
      bounds[1][axis] = Math.max(bounds[1][axis], dagger[index + axis]);
    }
  }
  const width = bounds[1][0] - bounds[0][0];
  const depth = bounds[1][2] - bounds[0][2];
  assert.ok(width > depth * 1.5, "Katarina dagger must present its broad curved face");
  const packagedDagger = await packageKatarinaDagger(repositoryRoot);
  assert.equal(packagedDagger.geometry, daggerMatch[1]);
  assert.deepEqual(Object.keys(packagedDagger.parts), ["pommel", "grip", "guard", "blade"]);
  assert.equal(packagedDagger.parts.pommel.first, 0);
  assert.equal(
    Object.values(packagedDagger.parts).reduce((count, part) => count + part.count, 0),
    dagger.length / 6,
  );
  assert.ok(catalog.includes(`"daggerParts":${JSON.stringify(packagedDagger.parts)}`));
  assert.ok(catalog.includes(
    `"daggerPresentation":${JSON.stringify(katarinaDaggerPresentation)}`,
  ));

  for (const champion of playableChampions) {
    const modelDirectory = path.join(repositoryRoot, "champions", champion, "playable-model");
    for (const artifact of ["vertices.bin", "indices.bin", "texture.webp"]) {
      const bytes = await readFile(path.join(modelDirectory, `${champion}-model-${artifact}`));
      assert.ok(catalog.includes(bytes.toString("base64")), `${champion} ${artifact} must feed the catalog`);
    }
    const metadata = JSON.parse(
      await readFile(path.join(modelDirectory, `${champion}-model-metadata.json`), "utf8")
    );
    if (metadata.runtime === "vat-v1") {
      assert.equal(metadata.completeClipCatalog, true);
      assert.match(metadata.sourceUrl, /cdn\.modelviewer\.lol/);
      assert.equal(metadata.poseQuality.algorithmVersion, "authored-temporal-v2");
      assert.equal(metadata.poseQuality.unresolvedFrameCount, 0);
      assert.equal(
        metadata.poseQuality.uniqueRepairedFrameCount,
        metadata.poseQuality.repairedFrames.length
      );
      for (const [action, temporal] of Object.entries(metadata.poseQuality.temporalActions)) {
        if (["idle", "run"].includes(action)) continue;
        assert.ok(
          temporal.uniqueFrameCount >= temporal.requiredUniqueFrameCount,
          `${champion} ${action} must retain at least 75% unique combat frames`
        );
        assert.ok(temporal.longestIdenticalRun <= 2, `${champion} ${action} must not freeze`);
        assert.ok(
          temporal.longestPerceptualHold <= temporal.maximumPerceptualHold,
          `${champion} ${action} must not perceptually freeze`
        );
        assert.deepEqual(
          temporal.repairedLowMotionTransitions,
          [],
          `${champion} ${action} repaired frames must visibly move`
        );
        assert.ok(temporal.varyingPairRate >= 0.05, `${champion} ${action} must articulate`);
      }
      for (const actionSource of Object.values(metadata.animationActions)) {
        assert.ok(metadata.animationClips[actionSource]);
      }
      for (const artifact of ["frames.bin", "normals.bin"]) {
        const bytes = await readFile(path.join(modelDirectory, `${champion}-model-${artifact}`));
        assert.ok(
          catalog.includes(bytes.toString("base64")),
          `${champion} ${artifact} must feed the animated catalog`
        );
      }
      assert.match(catalog, new RegExp(`"frameCount":${metadata.frameCount}`));
    }
  }
});

test("Katarina's ready dagger never collapses into an unreadable pickup", async () => {
  const renderer = await readFile(path.join(repositoryRoot, "game", "draw-bomber-rift.js"), "utf8");
  assert.equal(katarinaDaggerPresentation.readyScale, 0.95);
  assert.equal(katarinaDaggerPresentation.readyHeight, 0.34);
  assert.equal(katarinaDaggerPresentation.readyHover, 0.025);
  for (const property of [
    "readyScale",
    "readyPitch",
    "readyHeading",
    "readyHeadingSwing",
    "readyHeight",
    "readyHover",
  ]) {
    assert.match(
      renderer,
      new RegExp(`katarinaDaggerPresentation\\.${property}`),
      `renderer must consume the packaged ${property}`,
    );
  }
  const packagedDagger = await packageKatarinaDagger(repositoryRoot);
  const daggerBytes = Buffer.from(packagedDagger.geometry, "base64");
  const dagger = new Float32Array(
    daggerBytes.buffer,
    daggerBytes.byteOffset,
    daggerBytes.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
  // Sample the complete ready-state motion rather than a flattering single pose.
  const silhouettes = Array.from({ length: 72 }, (_, index) =>
    measureDaggerSilhouette(dagger, {
      scale: katarinaDaggerPresentation.readyScale,
      heading: katarinaDaggerPresentation.readyHeading +
        Math.sin(index / 72 * Math.PI * 2) *
          katarinaDaggerPresentation.readyHeadingSwing,
      pitch: katarinaDaggerPresentation.readyPitch,
      height: katarinaDaggerPresentation.readyHeight,
    }));
  const worst = silhouettes.reduce((smallest, silhouette) =>
    silhouette.major < smallest.major ? silhouette : smallest);
  const largest = silhouettes.reduce((biggest, silhouette) =>
    silhouette.major > biggest.major ? silhouette : biggest);

  assert.ok(
    worst.major >= 18 && worst.area >= 120,
    `ready dagger collapsed to ${worst.size.map((value) => value.toFixed(1)).join("x")} px`,
  );
  assert.ok(
    largest.major <= 28 && largest.area <= 260,
    `ready dagger grew beyond its gameplay cell at ${largest.size.map((value) => value.toFixed(1)).join("x")} px`,
  );
});

test("the renderer exposes the ready dagger in its gameplay-scale review mode", async () => {
  const renderer = await readFile(path.join(repositoryRoot, "game", "draw-bomber-rift.js"), "utf8");
  assert.match(renderer, /modelReviewTarget === "dagger"/);
  assert.match(renderer, /drawReadyKatarinaDagger\(\{ id: 0, x: -5\.28, z: 5\.28 \}, t, beat\)/);
});

test("every published VAT frame passes the silhouette and topology gate", async () => {
  await Promise.all(playableChampions.map(async (champion) => {
    const modelDirectory = path.join(repositoryRoot, "champions", champion, "playable-model");
    const metadata = JSON.parse(
      await readFile(path.join(modelDirectory, `${champion}-model-metadata.json`), "utf8")
    );
    if (metadata.runtime !== "vat-v1") return;
    await execFileAsync(process.execPath, [
      path.join(preparationDirectory, "check-pose-integrity.mjs"),
      modelDirectory,
      "--quiet"
    ]);
  }));
});
