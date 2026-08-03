import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../../.github/workflows/deploy-bombpvp.yml", import.meta.url),
  "utf8",
);

test("deploy workflow fails closed off main even on workflow_dispatch", () => {
  assert.match(workflow, /DEPLOY_WORKFLOW_MAIN_ONLY_V1/);
  assert.match(
    workflow,
    /if:\s*\$\{\{\s*github\.ref\s*==\s*'refs\/heads\/main'\s*\}\}/,
  );
  assert.match(workflow, /branches:\s*\n\s*-\s*main/m);
});

test("deploy smoke checks live arena package manifest", () => {
  assert.match(workflow, /DEPLOY_SMOKE_MANIFEST_V1/);
  assert.match(
    workflow,
    /https:\/\/bombpvp\.com\/riftbomb-parts\/manifest\.json/,
  );
  assert.match(workflow, /partsPath !== `\/riftbomb-parts\/\$\{m\.sha256\}`/);
  assert.match(workflow, /m\.version !== 2/);
  assert.match(workflow, /unknown_action/);
  assert.match(workflow, /https:\/\/bombpvp\.com\//);
});

test("CI runs release deploy gates before wrangler publish", async () => {
  const packageJson = await readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  );
  assert.match(packageJson, /"test:release-gates"/);
  assert.match(
    packageJson,
    /tests\/deploy-guard\.test\.mjs tests\/deploy-workflow-guard\.test\.mjs/,
  );
  // DEPLOY_RELEASE_GATES_V1 also locks Oracle health + multi-package version pin.
  assert.match(packageJson, /tests\/release-version-pin\.test\.mjs/);
  assert.match(packageJson, /server\/tests\/release-metadata\.test\.mjs/);
  assert.match(packageJson, /server\/tests\/install-health-gate\.test\.mjs/);
  assert.match(packageJson, /server\/tests\/stage-release\.test\.mjs/);
  assert.match(workflow, /DEPLOY_RELEASE_GATES_V1/);
  assert.match(workflow, /npm run test:release-gates/);
  const gatesAt = workflow.indexOf("DEPLOY_RELEASE_GATES_V1");
  const deployAt = workflow.indexOf("Deploy to Cloudflare Workers");
  assert.ok(gatesAt > 0, "missing release gates step");
  assert.ok(deployAt > gatesAt, "release gates must run before deploy step");
});
