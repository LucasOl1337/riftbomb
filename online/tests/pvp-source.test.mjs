import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("loads the online duel layer into the reconstructed game", async () => {
  const page = await readFile(new URL("public/riftbomb.html", root), "utf8");
  const loader = await readFile(
    new URL("public/riftbomb-loader.js", root),
    "utf8",
  );
  const packager = await readFile(
    new URL("scripts/package-riftbomb.mjs", root),
    "utf8",
  );

  assert.match(page, /src="\/riftbomb-loader\.js"/);
  assert.match(loader, /online-duel\.css/);
  assert.match(loader, /online-duel\.js/);
  assert.match(loader, /Promise\.all/);
  assert.match(loader, /manifest\.partCount/);
  assert.match(loader, /response\.arrayBuffer/);
  assert.match(loader, /new TextDecoder/);
  assert.match(packager, /riftbomb\.html/);
  assert.match(packager, /PART_SIZE/);
  assert.match(packager, /manifest\.json/);
  assert.match(packager, /RIFTBOMB_SAMPLE_MANIFEST/);
  assert.match(packager, /audioOutputDirectory/);
  assert.match(packager, /arenaTextureOutputDirectory/);
  assert.match(packager, /championModelOutputDirectory/);
  assert.doesNotMatch(page, /<script>[\s\S]*<\/script>/);
});

test("packages every web part behind a self-consistent dynamic manifest", async () => {
  const partsDirectory = new URL("public/riftbomb-parts/", root);
  const manifest = JSON.parse(
    await readFile(new URL("manifest.json", partsDirectory), "utf8"),
  );
  const entries = (await readdir(partsDirectory))
    .filter((entry) => /^part-\d+$/.test(entry))
    .sort((left, right) => Number(left.slice(5)) - Number(right.slice(5)));

  assert.equal(manifest.version, 1);
  assert.equal(entries.length, manifest.partCount);
  const artifact = Buffer.concat(
    await Promise.all(entries.map((entry) => readFile(new URL(entry, partsDirectory)))),
  );
  assert.equal(artifact.length, manifest.byteLength);
  assert.equal(
    createHash("sha256").update(artifact).digest("hex"),
    manifest.sha256,
  );
});

test("keeps the real sample bank out of the initial online payload", async () => {
  const directory = new URL("public/riftbomb-parts/", root);
  const names = (await readdir(directory))
    .filter((name) => /^part-\d+$/.test(name))
    .sort();
  const parts = await Promise.all(
    names.map((name) => readFile(new URL(name, directory), "utf8")),
  );
  const game = parts.join("");

  assert.equal(names.length, 1);
  assert.doesNotMatch(game, /RIFTBOMB_SAMPLE_BANK\s*=/);
  assert.match(game, /RIFTBOMB_SAMPLE_MANIFEST\s*=/);
  assert.match(game, /fetchAndDecodeSample/);

  const sample = await readFile(new URL("public/audio/cello/C2.ogg", root));
  assert.equal(sample.subarray(0, 4).toString("ascii"), "OggS");
});

test("keeps arena WebP files out of the initial online payload", async () => {
  const directory = new URL("public/riftbomb-parts/", root);
  const names = (await readdir(directory))
    .filter((name) => /^part-\d+$/.test(name))
    .sort();
  const parts = await Promise.all(
    names.map((name) => readFile(new URL(name, directory), "utf8")),
  );
  const game = parts.join("");

  assert.doesNotMatch(
    game,
    /ARENA_TEXTURE_SOURCE\s*=\s*Object\.freeze\(\{"crateSide":"data:image\/webp;base64/,
  );
  assert.match(game, /\/arena-textures\/crate\.webp/);

  const textures = [
    ["game/Assets/textures/crates/crate-albedo.webp", "crate.webp"],
    ["game/Assets/textures/crates/crate-top-albedo.webp", "crate-top.webp"],
    ["game/Assets/textures/ground/floor-lattice.webp", "floor-lattice.webp"],
    ["game/Assets/textures/ground/floor-clearing.webp", "floor-clearing.webp"],
    ["game/Assets/textures/ground/floor-labyrinth.webp", "floor-labyrinth.webp"],
    ["game/Assets/textures/walls/wall-lattice.webp", "wall.webp"],
    ["game/Assets/textures/walls/wall-top-lattice.webp", "wall-top.webp"],
  ];
  assert.equal(
    (game.match(/\/arena-textures\/[^"]+\.webp/g) || []).length,
    textures.length,
  );
  for (const [sourceName, outputName] of textures) {
    const source = await readFile(new URL(`../${sourceName}`, root));
    const output = await readFile(
      new URL(`public/arena-textures/${outputName}`, root),
    );
    assert.deepEqual(output, source);
    assert.equal(output.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(output.subarray(8, 12).toString("ascii"), "WEBP");
  }
});

test("loads only the playable champion models selected in the lobby", async () => {
  const directory = new URL("public/riftbomb-parts/", root);
  const names = (await readdir(directory))
    .filter((name) => /^part-\d+$/.test(name))
    .sort();
  const parts = await Promise.all(
    names.map((name) => readFile(new URL(name, directory), "utf8")),
  );
  const game = parts.join("");
  const champions = ["katarina", "zed", "renekton", "vladimir", "gangplank"];

  assert.equal(names.length, 1);
  assert.ok(Buffer.byteLength(game) < 750_000);
  assert.doesNotMatch(game, /const PLAYABLE_CHAMPIONS = Object\.freeze\(\{/);
  assert.match(game, /window\.RIFTBOMB_PLAYABLE_CHAMPIONS = Object\.create\(null\)/);
  assert.match(game, /ensureChampionModels/);
  assert.equal(
    (game.match(/\/champion-models\/[^"]+\.js/g) || []).length,
    champions.length,
  );

  for (const champion of champions) {
    const script = await readFile(
      new URL(`public/champion-models/${champion}.js`, root),
      "utf8",
    );
    const match = script.match(/Object\.freeze\((\{.*\})\);\s*$/s);
    assert.ok(match, `${champion} model payload must be valid generated JavaScript`);
    const payload = JSON.parse(match[1]);
    const modelDirectory = `../champions/${champion}/playable-model`;
    const vertices = await readFile(
      new URL(`${modelDirectory}/${champion}-model-vertices.bin`, root),
    );
    const indices = await readFile(
      new URL(`${modelDirectory}/${champion}-model-indices.bin`, root),
    );
    const texture = await readFile(
      new URL(`${modelDirectory}/${champion}-model-texture.webp`, root),
    );
    assert.deepEqual(Buffer.from(payload.vertices, "base64"), vertices);
    assert.deepEqual(Buffer.from(payload.indices, "base64"), indices);
    assert.deepEqual(
      Buffer.from(payload.texture.replace(/^data:image\/webp;base64,/, ""), "base64"),
      texture,
    );
  }
});

test("ships host-authoritative room and snapshot behavior", async () => {
  const client = await readFile(new URL("public/online-duel.js", root), "utf8");
  assert.match(client, /RTCPeerConnection/);
  assert.match(client, /action: "create"/);
  assert.match(client, /SNAPSHOT_INTERVAL/);
  assert.match(client, /state\.role === "guest"/);
  assert.match(client, /game\.p2Human = false/);
  assert.match(client, /ensureChampionModels\(\[state\.hostChampion, state\.guestChampion\]\)/);
});

test("declares persistent signaling storage", async () => {
  const hosting = JSON.parse(
    await readFile(new URL(".openai/hosting.json", root), "utf8"),
  );
  assert.equal(hosting.d1, "DB");

  const route = await readFile(new URL("app/api/pvp/route.ts", root), "utf8");
  assert.match(route, /CREATE TABLE IF NOT EXISTS pvp_rooms/);
  assert.match(route, /ROOM_LIFETIME_MS/);
  assert.match(route, /invalid_host_token/);
  assert.match(route, /let schemaReady: Promise<void> \| null = null/);
  assert.match(route, /if \(!schemaReady\)/);
  assert.equal(
    (route.match(/await deleteExpiredRooms\(/g) || []).length,
    1,
    "expired-room cleanup belongs only on room creation",
  );
});
