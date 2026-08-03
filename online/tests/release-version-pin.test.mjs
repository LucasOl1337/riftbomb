import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const onlineRoot = new URL("../", import.meta.url);
const onlinePkg = JSON.parse(await readFile(new URL("package.json", onlineRoot), "utf8"));
const onlineLock = JSON.parse(await readFile(new URL("package-lock.json", onlineRoot), "utf8"));
const serverPkg = JSON.parse(
  await readFile(new URL("server/package.json", onlineRoot), "utf8"),
);
const serverLock = JSON.parse(
  await readFile(new URL("server/package-lock.json", onlineRoot), "utf8"),
);

// RELEASE_VERSION_PIN_V1 — online + authoritative server must share one product version.
test("online and server package versions stay pinned together", () => {
  assert.equal(typeof onlinePkg.version, "string");
  assert.ok(onlinePkg.version.trim().length > 0, "online package version missing");
  assert.equal(onlinePkg.version, serverPkg.version);
  assert.equal(onlineLock.version, onlinePkg.version);
  assert.equal(serverLock.version, serverPkg.version);
  assert.equal(onlineLock.packages?.[""]?.version, onlinePkg.version);
  assert.equal(serverLock.packages?.[""]?.version, serverPkg.version);
  // ban silent 0.0.0 / empty drift after readProjectVersion fallback
  assert.notEqual(onlinePkg.version, "0.0.0");
});
