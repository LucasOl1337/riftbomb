import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const serverSource = await readFile(new URL("src/server.mjs", root), "utf8");
const packageJson = JSON.parse(
  await readFile(new URL("package.json", root), "utf8"),
);

test("authoritative /health exposes package version single-source", () => {
  assert.equal(typeof packageJson.version, "string");
  assert.ok(packageJson.version.trim().length > 0);
  assert.match(serverSource, /function readProjectVersion/);
  assert.match(serverSource, /const PACKAGE_VERSION = readProjectVersion\(\)/);
  assert.match(serverSource, /path\.join\(__dirname, ["']\.\.\/package\.json["']\)/);
  assert.match(serverSource, /service:\s*["']riftbomb-authoritative["']/);
  assert.match(serverSource, /version:\s*PACKAGE_VERSION/);
  // ban hardcoded product version string in health payload
  assert.equal(
    /version:\s*["']0\.1\.0["']/.test(serverSource),
    false,
    "health must not hardcode package version",
  );
});
