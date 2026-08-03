import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assertStageSources, stageRelease } from "../deploy/stage-release.mjs";

const root = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const stageSource = await readFile(
  new URL("../deploy/stage-release.mjs", import.meta.url),
  "utf8",
);
const installSource = await readFile(
  new URL("../deploy/install-ubuntu.sh", import.meta.url),
  "utf8",
);
const serverPackage = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

test("stage-release source locks Oracle install layout", () => {
  assert.match(stageSource, /STAGE_RELEASE_V1/);
  assert.match(stageSource, /function assertStageSources/);
  assert.match(stageSource, /export async function stageRelease/);
  assert.match(stageSource, /--force-local/);
  assert.match(stageSource, /create-authoritative-duel\.mjs/);
  assert.match(stageSource, /package-lock\.json/);
  assert.match(stageSource, /skipNodeModules|node_modules/);
  assert.match(installSource, /release_dir=.*riftbomb-release/);
  assert.match(installSource, /cp -a "\$release_dir\/game\/\."/);
  assert.match(installSource, /cp -a "\$release_dir\/online\/server\/\."/);
  assert.equal(serverPackage.scripts?.["stage:release"], "node deploy/stage-release.mjs");
});

test("assertStageSources accepts live repo layout", async () => {
  const sources = await assertStageSources(root);
  assert.ok(sources.gameSrc.endsWith(`${path.sep}game`) || sources.gameSrc.endsWith("/game"));
  await access(path.join(sources.serverSrc, "package-lock.json"));
});

test("stageRelease --dry-run does not write files", async () => {
  const outDir = path.join(tmpdir(), `riftbomb-stage-dry-${process.pid}`);
  const result = await stageRelease({ root, outDir, dryRun: true });
  assert.equal(result.dryRun, true);
  assert.equal(result.marker, "STAGE_RELEASE_V1");
  assert.deepEqual(result.layout, ["game/", "online/server/"]);
  await assert.rejects(() => access(outDir));
});

test("stageRelease materializes install-ubuntu layout without node_modules", async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), "riftbomb-stage-"));
  try {
    const result = await stageRelease({ root, outDir, dryRun: false, wantTarball: false });
    assert.equal(result.dryRun, false);
    await access(path.join(outDir, "online", "server", "package-lock.json"));
    await access(path.join(outDir, "online", "server", "src", "server.mjs"));
    await access(path.join(outDir, "online", "server", "deploy", "install-ubuntu.sh"));
    await access(path.join(outDir, "game", "create-authoritative-duel.mjs"));
    await access(path.join(outDir, "game", "run-champion-bomb-duel.js"));
    await assert.rejects(() => access(path.join(outDir, "online", "server", "node_modules")));
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
