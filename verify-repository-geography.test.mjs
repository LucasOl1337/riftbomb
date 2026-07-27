import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import path from "node:path";

const trackedPaths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const isContentPath = (trackedPath) =>
  trackedPath.startsWith("game/Assets/")
  || /^champions\/(?!prepare-playable-models\/)[^/]+\//.test(trackedPath);

const isIndependentProjectPath = (trackedPath) => trackedPath.startsWith("online/");
const isGeographyExempt = (trackedPath) =>
  isContentPath(trackedPath) || isIndependentProjectPath(trackedPath);

test("tracked paths never exceed three directory levels", () => {
  const tooDeep = trackedPaths.filter((trackedPath) =>
    !isGeographyExempt(trackedPath) && trackedPath.split("/").length - 1 > 3
  );
  assert.deepEqual(tooDeep, []);
});

test("tracked paths avoid generic and technical-layer module names", () => {
  const forbidden = new Set([
    "utils", "helpers", "common", "shared", "misc", "core", "lib", "manager", "service",
    "src", "dist", "assets", "tools"
  ]);
  const violations = trackedPaths.filter((trackedPath) =>
    !isGeographyExempt(trackedPath)
    && trackedPath.split("/").some((segment) => forbidden.has(segment.toLowerCase()))
  );
  assert.deepEqual(violations, []);
});

test("no leaf directory pretends that one file is a module", () => {
  const directFiles = new Map();
  const childDirectories = new Map();

  for (const trackedPath of trackedPaths) {
    const parts = trackedPath.split("/");
    if (parts.length > 1) {
      const directory = parts.slice(0, -1).join("/");
      directFiles.set(directory, (directFiles.get(directory) ?? 0) + 1);
    }

    for (let index = 1; index < parts.length - 1; index += 1) {
      const parent = parts.slice(0, index).join("/");
      const child = parts.slice(0, index + 1).join("/");
      if (!childDirectories.has(parent)) childDirectories.set(parent, new Set());
      childDirectories.get(parent).add(child);
    }
  }

  const directories = new Set([...directFiles.keys(), ...childDirectories.keys()]);
  const oneFileLeaves = [...directories].filter((directory) =>
    !isGeographyExempt(`${directory}/`)
    && directFiles.get(directory) === 1
    && !childDirectories.has(directory)
  );
  assert.deepEqual(oneFileLeaves, []);
});

test("the product map exposes the game, every champion, and the course by name", () => {
  const required = [
    "riftbomb.html",
    "game/play-riftbomb.html",
    "game/run-champion-bomb-duel.js",
    "game/draw-bomber-rift.js",
    "game/play-rift-soundtrack.js",
    "champions/katarina/playable-model/katarina-model-metadata.json",
    "champions/zed/playable-model/zed-model-metadata.json",
    "champions/renekton/playable-model/renekton-model-metadata.json",
    "champions/vladimir/playable-model/vladimir-model-metadata.json",
    "champions/ziggs/reconstruction/ziggs-spec.json",
    "architecture-course/course-map.html",
    "online/.openai/hosting.json",
    "online/app/api/pvp/route.ts",
    "online/public/online-duel.js"
  ];

  for (const requiredPath of required) {
    assert.ok(trackedPaths.includes(path.posix.normalize(requiredPath)), `Missing ${requiredPath}`);
  }
});
