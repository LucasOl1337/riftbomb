import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const gameDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(gameDirectory);
const sourcePath = path.join(gameDirectory, "play-riftbomb.html");
const releasePath = path.join(repositoryRoot, "riftbomb.html");

const localEntrypoints = (document) => [
  ...document.matchAll(/<(?:link rel="stylesheet" href|script src)="\.\/([^"]+)"(?:><\/script>)?/g)
].map((match) => match[1]);

test("the editable page enters every game module through one named path", async () => {
  const document = await readFile(sourcePath, "utf8");
  const expectedEntrypoints = localEntrypoints(document);

  assert.deepEqual(expectedEntrypoints, [...new Set(expectedEntrypoints)], "entrypoint paths must be unique");

  for (const entrypoint of expectedEntrypoints) {
    const matches = document.match(new RegExp(`\\./${entrypoint.replaceAll(".", "\\.")}`, "g")) ?? [];
    assert.equal(matches.length, 1, `${entrypoint} must be referenced exactly once`);
    await stat(path.join(gameDirectory, entrypoint));
  }
});

test("the built game is one offline HTML artifact", async () => {
  const sourceDocument = await readFile(sourcePath, "utf8");
  const document = await readFile(releasePath, "utf8");

  for (const entrypoint of localEntrypoints(sourceDocument)) {
    assert.ok(!document.includes(`./${entrypoint}`), `${entrypoint} should be inlined`);
    const source = await readFile(path.join(gameDirectory, entrypoint), "utf8");
    assert.ok(document.includes(source.trimEnd()), `${entrypoint} must be embedded byte-for-byte`);
  }

  assert.match(document, /class Renderer/);
  assert.match(document, /class MusicEngine/);
  assert.match(document, /class Game/);
  assert.match(document, /boot\(\);/);
  assert.match(document, /var FluidBg=/);
  assert.match(document, /const PLAYABLE_CHAMPIONS = Object\.freeze/);
});

test("playable model bytes stay out of the renderer implementation", async () => {
  const renderer = await readFile(path.join(gameDirectory, "draw-bomber-rift.js"), "utf8");

  assert.ok(!renderer.includes("_MODEL_VERTICES ="));
  assert.ok(!renderer.includes("_MODEL_INDICES ="));
  assert.ok(!renderer.includes("_MODEL_TEXTURE ="));
  assert.ok(renderer.length < 1_000_000, "renderer should not carry packaged model bytes");
});

test("the build retains the five playable champions and duel rules", async () => {
  const document = await readFile(releasePath, "utf8");

  for (const champion of ["Katarina", "Zed", "Renekton", "Vladimir", "Ziggs"]) {
    assert.ok(document.includes(champion), `${champion} must remain in the build`);
  }

  assert.match(document, /first to 3/i);
  assert.match(document, /Breakable Hextech blocks/);
  assert.match(document, /Local PvP/);
});
