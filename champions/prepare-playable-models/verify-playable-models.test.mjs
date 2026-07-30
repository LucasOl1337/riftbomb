import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";
import { packagePlayableChampions, playableChampions } from "./package-playable-champions.mjs";
import "./plan-vat-frame-repairs.test.mjs";

const preparationDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(preparationDirectory, "..", "..");
const execFileAsync = promisify(execFile);

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
