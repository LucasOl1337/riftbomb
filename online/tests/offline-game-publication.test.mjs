import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createOfflineGamePublication } from "../scripts/offline-game-publication.mjs";

const champions = ["katarina", "zed", "renekton", "vladimir", "gangplank"];
const arenaTextures = [
  "crates/crate-albedo.webp",
  "crates/crate-top-albedo.webp",
  "ground/floor-salt-lens-combat-band-6ffb0854.webp",
  "ground/floor-clearing-v3.webp",
  "props/nacre-growth-albedo.webp",
  "props/nacre-reef-albedo.webp",
  "ground/floor-labyrinth.webp",
  "ground/floor-forts.webp",
  "ground/floor-storm-eye-combat-field-99509f91.webp",
  "walls/wall-lattice.webp",
  "walls/wall-clearing.webp",
  "walls/wall-labyrinth.webp",
  "walls/wall-forts.webp",
  "walls/wall-pit.webp",
  "walls/wall-top-lattice.webp",
  "walls/wall-top-clearing.webp",
  "walls/wall-top-labyrinth.webp",
  "walls/wall-top-forts.webp",
  "walls/wall-top-pit.webp",
];

async function createFixture(directory) {
  const repositoryRoot = path.join(directory, "repository");
  const onlineRoot = path.join(repositoryRoot, "online");
  const publicDirectory = path.join(onlineRoot, "public");
  const write = async (base, relative, contents) => {
    const target = path.join(base, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  };

  const matchRules = '"use strict";\nconst FIXTURE_RULE = true;\n';
  const arenaBundle = [
    '"use strict";',
    "const ARENA_TEXTURES = Object.freeze({});",
    "globalThis.FIXTURE_ARENA_TEXTURES = ARENA_TEXTURES;",
    "",
  ].join("\n");
  const championBundle = [
    '"use strict";',
    "const PLAYABLE_CHAMPIONS = Object.create(null);",
    "globalThis.FIXTURE_PLAYABLE_CHAMPIONS = PLAYABLE_CHAMPIONS;",
    "",
  ].join("\n");
  const v1BotBundle = [
    '"use strict";',
    "const RIFTBOMB_BOTS = {};",
    "const createV1Policy = () => ({});",
    "RIFTBOMB_BOTS.createV1Policy = createV1Policy;",
    "",
  ].join("\n");
  const localSfxManifest = "const RIFTBOMB_CHAMPION_SFX_BANK_MANIFEST = Object.freeze({});";
  const game = [
    "<!doctype html>",
    "  <script>",
    "const RIFTBOMB_EXPLOSION_FRAME_SOURCES = Object.freeze({});",
    "  </script>",
    "  <script>",
    v1BotBundle.trimEnd(),
    "  </script>",
    `  <script>\n${matchRules.trimEnd()}\n  </script>`,
    `  <script>\n${arenaBundle.trimEnd()}\n  </script>`,
    `  <script>\n${championBundle.trimEnd()}\n  </script>`,
    `  <script>\n${localSfxManifest}\n  </script>`,
    "",
  ].join("\n");

  await Promise.all([
    write(repositoryRoot, "riftbomb.html", game),
    write(repositoryRoot, "game/run-champion-bomb-duel.js", matchRules),
    write(repositoryRoot, "game/arena-appearance/load-arena-appearance.js", arenaBundle),
    write(repositoryRoot, "game/load-playable-champion-models.js", championBundle),
    write(repositoryRoot, "game/load-v1-bot.js", v1BotBundle),
    write(onlineRoot, "riftbomb-shell.html", [
      "<!doctype html>",
      "<script data-riftbomb-manifest='__RIFTBOMB_MANIFEST__' src=\"/riftbomb-loader.js\"></script>",
      "",
    ].join("\n")),
    write(publicDirectory, "riftbomb-loader.js",
      'document.write(\'<script src="/online-duel-loader.js"></script>\');\n'),
    write(publicDirectory, "online-duel-loader.js", [
      'const CONTINUITY_URL = "/match-continuity.js";',
      'const RUNTIME_URL = "/online-duel.js";',
      "",
    ].join("\n")),
    write(publicDirectory, "match-continuity.js",
      'globalThis.RIFTBOMB_MATCH_CONTINUITY = Object.freeze({ create() {} });\n'),
    write(publicDirectory, "online-duel.js",
      'globalThis.RIFTBOMB_ONLINE_DUEL_FIXTURE = true;\n'),
  ]);

  await Promise.all(arenaTextures.map((relative, index) => write(
    repositoryRoot,
    `game/arena-appearance/textures/${relative}`,
    Buffer.from([index, index + 1, index + 2]),
  )));
  await Promise.all(champions.flatMap((champion, index) => {
    const base = `champions/${champion}/playable-model/${champion}-model`;
    return [
      write(repositoryRoot, `${base}-vertices.bin`, Buffer.from([index, 1])),
      write(repositoryRoot, `${base}-indices.bin`, Buffer.from([index, 2])),
      write(repositoryRoot, `${base}-texture.webp`, Buffer.from([index, 3])),
      write(repositoryRoot, `${base}-metadata.json`, JSON.stringify({ runtime: "static" })),
    ];
  }));

  const staleBootAssets = [
    `riftbomb-loader-${"a".repeat(64)}.js`,
    `online-duel-loader-${"b".repeat(64)}.js`,
    `online-duel-${"c".repeat(64)}.js`,
    `match-continuity-${"d".repeat(64)}.js`,
  ];
  await Promise.all(staleBootAssets.map((name) =>
    write(publicDirectory, name, "stale"),
  ));

  return { onlineRoot, publicDirectory, repositoryRoot, staleBootAssets };
}

test("publishes and validates the complete Offline boot chain through one interface", async (t) => {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "riftbomb-publication-"));
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const fixture = await createFixture(temporaryDirectory);
  const builds = [];
  const logs = [];
  const publication = createOfflineGamePublication({
    filesystem: { mkdir, readFile, readdir, rm, writeFile },
    buildRoot: async (repositoryRoot) => builds.push(repositoryRoot),
    transformJavaScript: async (source) => ({ code: source }),
    packageDagger: async () => ({ geometry: { fixture: true }, parts: [] }),
    daggerPresentation: { fixture: true },
    log: (message) => logs.push(message),
  });

  assert.deepEqual(Object.keys(publication), ["publish"]);
  const result = await publication.publish({
    repositoryRoot: fixture.repositoryRoot,
    onlineRoot: fixture.onlineRoot,
  });
  assert.deepEqual(builds, [fixture.repositoryRoot]);
  assert.deepEqual(logs, ["Packed Riftbomb into 1 web parts."]);

  const manifest = JSON.parse(await readFile(
    path.join(fixture.publicDirectory, "riftbomb-parts/manifest.json"),
    "utf8",
  ));
  assert.deepEqual(manifest, result.manifest);
  const part = await readFile(path.join(
    fixture.publicDirectory,
    manifest.partsPath.slice(1),
    "part-00",
  ));
  assert.equal(createHash("sha256").update(part).digest("hex"), manifest.sha256);
  assert.equal(part.byteLength, manifest.byteLength);

  async function assertFingerprinted(name) {
    const bytes = await readFile(path.join(fixture.publicDirectory, name));
    const fingerprint = name.match(/-([a-f0-9]{64})\.js$/)?.[1];
    assert.equal(createHash("sha256").update(bytes).digest("hex"), fingerprint, name);
    return bytes.toString("utf8");
  }
  const scripts = await Promise.all([
    assertFingerprinted(result.boot.riftbombLoaderName),
    assertFingerprinted(result.boot.onlineDuelLoaderName),
    assertFingerprinted(result.boot.matchContinuityName),
    assertFingerprinted(result.boot.onlineDuelName),
  ]);
  const [gameLoader, bridgeLoader] = scripts;
  assert.match(gameLoader, new RegExp(`/${result.boot.onlineDuelLoaderName}`));
  assert.match(bridgeLoader, new RegExp(`/${result.boot.matchContinuityName}`));
  assert.match(bridgeLoader, new RegExp(`/${result.boot.onlineDuelName}`));
  const shell = await readFile(path.join(fixture.publicDirectory, "riftbomb.html"), "utf8");
  assert.match(shell, new RegExp(`/${result.boot.riftbombLoaderName}`));
  assert.ok(shell.includes(`data-riftbomb-manifest='${JSON.stringify(manifest)}'`));

  for (const name of fixture.staleBootAssets) {
    await assert.rejects(access(path.join(fixture.publicDirectory, name)), { code: "ENOENT" });
  }
});
