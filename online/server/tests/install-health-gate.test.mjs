import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const installSource = await readFile(
  new URL("deploy/install-ubuntu.sh", root),
  "utf8",
);
const serverSource = await readFile(new URL("src/server.mjs", root), "utf8");

test("install-ubuntu fails closed on /health version drift", () => {
  assert.match(installSource, /INSTALL_VM_HEALTH_GATE_V1/);
  assert.match(installSource, /systemctl restart riftbomb-game\.service/);
  assert.match(installSource, /127\.0\.0\.1:8788\/health/);
  assert.match(installSource, /HEALTH_VERSION=/);
  assert.match(installSource, /online\/server\/package\.json/);
  assert.match(installSource, /riftbomb-authoritative/);
  // order: enable -> restart -> health gate
  const enableAt = installSource.indexOf("systemctl enable riftbomb-game.service");
  const restartAt = installSource.indexOf("systemctl restart riftbomb-game.service");
  const gateAt = installSource.indexOf("INSTALL_VM_HEALTH_GATE_V1");
  const healthAt = installSource.indexOf("127.0.0.1:8788/health");
  assert.ok(enableAt > 0 && restartAt > enableAt);
  assert.ok(gateAt > restartAt);
  assert.ok(healthAt > gateAt);
  assert.match(serverSource, /version:\s*PACKAGE_VERSION/);
});
