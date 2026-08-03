import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const deploySource = await readFile(
  new URL("scripts/deploy-cloudflare.mjs", root),
  "utf8",
);

function extractBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

function loadDeployGuards() {
  const block = extractBetween(
    deploySource,
    "// DEPLOY_MAIN_ONLY_V1",
    "async function main()",
  );
  const context = {
    process: { env: {} },
    spawnSync() {
      return { status: 1, stdout: "" };
    },
  };
  vm.createContext(context);
  vm.runInContext(
    `${block}\n;({ envFlagEnabled, resolveDeployBranch, assertProductionDeployAllowed });`,
    context,
  );
  return {
    envFlagEnabled: context.envFlagEnabled,
    resolveDeployBranch: context.resolveDeployBranch,
    assertProductionDeployAllowed: context.assertProductionDeployAllowed,
  };
}

test("deploy script locks production to main with explicit override", () => {
  assert.match(deploySource, /DEPLOY_MAIN_ONLY_V1/);
  assert.match(deploySource, /function assertProductionDeployAllowed/);
  assert.match(deploySource, /ALLOW_NON_MAIN_DEPLOY/);
  assert.match(deploySource, /assertProductionDeployAllowed\(\{ dryRun \}\)/);
  assert.match(
    deploySource,
    /bombpvp\.com deploy is restricted to git branch "main"/,
  );
});

test("assertProductionDeployAllowed fails closed off main", () => {
  const { assertProductionDeployAllowed } = loadDeployGuards();

  assert.doesNotThrow(() =>
    assertProductionDeployAllowed({ branch: "main", dryRun: false }),
  );
  assert.doesNotThrow(() =>
    assertProductionDeployAllowed({
      branch: "swarm/riftbomb/ready-to-ship",
      dryRun: true,
    }),
  );
  assert.doesNotThrow(() =>
    assertProductionDeployAllowed({
      branch: "swarm/riftbomb/ready-to-ship",
      allowNonMain: "1",
      dryRun: false,
    }),
  );

  assert.throws(
    () =>
      assertProductionDeployAllowed({
        branch: "swarm/riftbomb/ready-to-ship",
        dryRun: false,
      }),
    /restricted to git branch "main"/,
  );
  assert.throws(
    () =>
      assertProductionDeployAllowed({
        branch: "",
        dryRun: false,
      }),
    /detached\/unknown/,
  );
});

test("resolveDeployBranch prefers GitHub Actions ref", () => {
  const { resolveDeployBranch } = loadDeployGuards();
  assert.equal(
    resolveDeployBranch({ GITHUB_REF_NAME: "main" }, () => "other"),
    "main",
  );
  assert.equal(
    resolveDeployBranch(
      { GITHUB_REF: "refs/heads/release/v1.4.0" },
      () => "main",
    ),
    "release/v1.4.0",
  );
  assert.equal(
    resolveDeployBranch({}, () => "swarm/riftbomb/ready-to-ship"),
    "swarm/riftbomb/ready-to-ship",
  );
});
