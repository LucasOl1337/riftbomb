import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

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
  assert.match(document, /class BrowserMatchPresentation/);
  assert.match(document, /boot\(\);/);
  assert.match(document, /var FluidBg=/);
  assert.match(document, /const PLAYABLE_CHAMPIONS = Object\.freeze/);
  assert.doesNotMatch(document, /<(?:script|img)[^>]+src=["'](?!data:)/i);
  assert.doesNotMatch(document, /<link[^>]+href=/i);
  assert.doesNotMatch(document, /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/);
  assert.doesNotMatch(document, /url\(["']?https?:/i);
});

test("match rules cross one presentation seam without requiring a DOM", async () => {
  const rulesPath = path.join(gameDirectory, "run-champion-bomb-duel.js");
  const rules = await readFile(rulesPath, "utf8");
  const context = vm.createContext({ console });
  vm.runInContext(`${rules}\nglobalThis.Game = Game;`, context);

  const events = [];
  const presentation = {
    selectChampion: (champion) => events.push(["champion", champion]),
    prepareRound: () => events.push(["round"]),
    announce: (message) => events.push(["announce", message]),
    update: (match) => events.push(["update", match.selectedChampion]),
    finish: () => events.push(["finish"]),
    setPaused: (paused) => events.push(["paused", paused])
  };
  const music = { togglePause: (paused) => events.push(["music", paused]) };
  const match = new context.Game({}, music, presentation);

  assert.deepEqual(events.shift(), ["champion", "katarina"]);
  match.selectChampion("zed");
  assert.ok(events.some(([event, value]) => event === "champion" && value === "zed"));
  assert.ok(events.some(([event, value]) => event === "update" && value === "zed"));

  events.length = 0;
  match.start();
  match.togglePause();
  assert.ok(events.some(([event]) => event === "round"));
  assert.ok(events.some(([event, value]) => event === "paused" && value === true));
  assert.ok(events.some(([event, value]) => event === "music" && value === true));
});

test("match rules do not write browser presentation directly", async () => {
  const rules = await readFile(path.join(gameDirectory, "run-champion-bomb-duel.js"), "utf8");
  const presentationCalls = [...rules.matchAll(/this\.presentation\.([A-Za-z]+)\(/g)]
    .map((match) => match[1]);

  assert.ok(!/\bUI\.|\bdocument\.|\$\$\(/.test(rules));
  assert.ok(!/syncChampionPresentation/.test(await readFile(path.join(gameDirectory, "start-champion-duel.js"), "utf8")));
  assert.deepEqual(
    [...new Set(presentationCalls)].sort(),
    ["announce", "finish", "prepareRound", "selectChampion", "setPaused", "update"]
  );
});

test("playable model bytes stay out of the renderer implementation", async () => {
  const renderer = await readFile(path.join(gameDirectory, "draw-bomber-rift.js"), "utf8");

  assert.ok(!renderer.includes("_MODEL_VERTICES ="));
  assert.ok(!renderer.includes("_MODEL_INDICES ="));
  assert.ok(!renderer.includes("_MODEL_TEXTURE ="));
  assert.ok(renderer.length < 1_000_000, "renderer should not carry packaged model bytes");
});

test("arena themes share five GPU texture allocations", async () => {
  const renderer = await readFile(path.join(gameDirectory, "draw-bomber-rift.js"), "utf8");
  const packedTextures = await readFile(path.join(gameDirectory, "load-arena-textures.js"), "utf8");

  assert.match(renderer, /const textureGroups = \{/);
  assert.match(renderer, /for \(const \[sourceKey, aliases\] of Object\.entries\(textureGroups\)\)/);
  assert.equal(
    [...packedTextures.matchAll(/data:image\/webp;base64,/g)].length,
    5,
    "the offline build must embed each authored arena source once"
  );
});

test("arena render does not reference an undeclared turret color", async () => {
  const renderer = await readFile(path.join(gameDirectory, "draw-bomber-rift.js"), "utf8");

  assert.doesNotMatch(renderer, /\biceBody\b/);
  assert.match(renderer, /\[turret\.x, 0\.22, turret\.z\][\s\S]{0,100}C\.arenaStone/);
});

test("the build retains the six playable champions and duel rules", async () => {
  const document = await readFile(releasePath, "utf8");

  for (const champion of ["Katarina", "Zed", "Renekton", "Vladimir", "Gangplank", "Ziggs"]) {
    assert.ok(document.includes(champion), `${champion} must remain in the build`);
  }

  assert.match(document, /first to 3/i);
  assert.match(document, /Breakable Hextech blocks/);
  assert.match(document, /Local PvP/);
});
