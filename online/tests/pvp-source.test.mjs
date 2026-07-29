import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

function extractFunctionDeclaration(source, name, nextDeclaration) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(nextDeclaration, start);
  assert.notEqual(start, -1, `${name} declaration must exist`);
  assert.notEqual(end, -1, `${name} declaration must have a stable boundary`);
  return source.slice(start, end);
}

async function readPackagedGameParts() {
  const manifest = JSON.parse(
    await readFile(new URL("public/riftbomb-parts/manifest.json", root), "utf8"),
  );
  const directory = new URL(`public${manifest.partsPath}/`, root);
  const names = (await readdir(directory))
    .filter((entry) => /^part-\d+$/.test(entry))
    .sort((left, right) => Number(left.slice(5)) - Number(right.slice(5)));
  return { directory, manifest, names };
}

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
  assert.match(loader, /authoritative-audio\.js/);
  assert.match(loader, /online-duel\.js/);
  assert.match(loader, /Promise\.all/);
  assert.match(loader, /manifest\.partCount/);
  assert.match(loader, /response\.arrayBuffer/);
  assert.match(loader, /new TextDecoder/);
  assert.match(packager, /riftbomb\.html/);
  assert.match(packager, /PART_SIZE/);
  assert.match(packager, /manifest\.json/);
  assert.match(packager, /arenaTextureOutputDirectory/);
  assert.match(packager, /championModelOutputDirectory/);
  assert.doesNotMatch(page, /<script>[\s\S]*<\/script>/);
});

test("uses one authoritative WebSocket transport", async () => {
  const duel = await readFile(new URL("public/online-duel.js", root), "utf8");

  assert.match(duel, /new WebSocket\(AUTHORITATIVE_SERVER_URL\)/);
  assert.doesNotMatch(duel, /RTCPeerConnection|iceGatheringState|state\.inputChannel|state\.snapshots/);
});

test("superseded sockets cannot mutate the active room or audio cursor", async () => {
  const source = await readFile(new URL("public/online-duel.js", root), "utf8");
  const declaration = extractFunctionDeclaration(
    source,
    "connectAuthoritative",
    "  async function onConnected"
  );
  const sockets = [];
  class FakeWebSocket {
    static OPEN = 1;

    constructor() {
      this.readyState = FakeWebSocket.OPEN;
      this.listeners = new Map();
      this.sent = [];
      sockets.push(this);
    }

    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }

    emit(type, data) {
      this.listeners.get(type)?.(data === undefined ? {} : { data: JSON.stringify(data) });
    }

    send(message) {
      this.sent.push(JSON.parse(message));
    }

    close() {
      this.readyState = 3;
    }
  }
  const state = {
    socket: null,
    roomCode: "ROOM01",
    guestReady: false,
    lastPlayedSoundEventId: 0
  };
  const applied = [];
  let connectedCalls = 0;
  const connectAuthoritative = new Function(
    "WebSocket",
    "AUTHORITATIVE_SERVER_URL",
    "state",
    "setTimeout",
    "clearTimeout",
    "lobbyPayload",
    "onConnected",
    "applySnapshot",
    `"use strict"; ${declaration}; return connectAuthoritative;`
  )(
    FakeWebSocket,
    "ws://test.invalid/game-ws",
    state,
    () => 1,
    () => {},
    () => ({}),
    () => { connectedCalls += 1; },
    (snapshot) => applied.push(snapshot)
  );

  void connectAuthoritative("host");
  const oldSocket = sockets[0];
  const activePromise = connectAuthoritative("host");
  const activeSocket = sockets[1];

  oldSocket.emit("open");
  oldSocket.emit("message", { type: "connected", soundCursor: 99 });
  oldSocket.emit("message", { type: "snapshot", data: { s: 500, room: "old" } });
  oldSocket.emit("error");
  oldSocket.emit("close");
  await Promise.resolve();

  assert.equal(state.socket, activeSocket);
  assert.equal(state.lastPlayedSoundEventId, 0);
  assert.equal(oldSocket.sent.length, 0);
  assert.deepEqual(applied, []);
  assert.equal(connectedCalls, 0);

  activeSocket.emit("open");
  activeSocket.emit("message", { type: "connected", soundCursor: 2 });
  activeSocket.emit("message", { type: "snapshot", data: { s: 1, room: "new" } });
  await activePromise;

  assert.equal(activeSocket.sent.length, 1);
  assert.equal(state.lastPlayedSoundEventId, 2);
  assert.deepEqual(applied, [{ s: 1, room: "new" }]);
  assert.equal(connectedCalls, 1);
});

test("online one-shot audio is authoritative, ordered and locally panned", async () => {
  const [duel, consumer] = await Promise.all([
    readFile(new URL("public/online-duel.js", root), "utf8"),
    readFile(new URL("public/authoritative-audio.js", root), "utf8")
  ]);
  assert.match(duel, /authoritativePredictionSink/);
  assert.match(duel, /lastPlayedSoundEventId/);
  assert.match(duel, /sourceId: `remote:\$\{event\.id\}`/);
  assert.match(duel, /game\.audioPanAt\(x, z\)/);
  assert.match(duel, /droppedSoundEventCount \+= result\.gap\.count/);
  assert.match(duel, /console\.warn\("Authoritative audio gap"/);
  assert.match(consumer, /event\.id <= nextCursor/);
  assert.equal((duel.match(/authoritativeAudio\.consume/g) || []).length, 1);
  assert.doesNotMatch(duel, /consumeAuthoritativeSound|receivedSoundEventId|predictedSounds/);
  assert.doesNotMatch(duel, /\.\.\.event\.options/);
});

test("online client can leave match/lobby and resume a saved session after reload", async () => {
  const duel = await readFile(new URL("public/online-duel.js", root), "utf8");
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const styles = await readFile(new URL("app/globals.css", root), "utf8");

  assert.match(duel, /SESSION_KEY/);
  assert.match(duel, /tryResumeSession/);
  assert.match(duel, /leaveOnlineSession/);
  assert.match(duel, /leave-match/);
  assert.match(duel, /sessionStorage/);
  assert.match(page, /leaveMatch/);
  assert.match(page, /match-exit-button/);
  assert.match(page, /client-sticky-cta/);
  assert.match(page, /SAIR DA PARTIDA/);
  assert.match(styles, /\.client-sticky-cta/);
  assert.match(styles, /\.match-exit-button/);
});

test("online seat binding always resolves host=1 guest=2 by player id", async () => {
  const duel = await readFile(new URL("public/online-duel.js", root), "utf8");
  const presentation = await readFile(
    new URL("../game/present-champion-bomb-duel.js", root),
    "utf8",
  );

  assert.match(duel, /function localOnlinePlayerId/);
  assert.match(duel, /function localOnlinePlayer/);
  assert.match(duel, /function bindLocalOnlineView/);
  assert.match(duel, /state\.role === "guest" \? 2 : 1/);
  assert.match(duel, /bindLocalOnlineView\(\)/);
  assert.match(duel, /game\.players = \[\.\.\.data\.players\]\.sort/);
  assert.match(duel, /player\.id === localPlayerId/);
  assert.match(presentation, /players\?\.find\(\(player\) => player\.id === 1\)/);
  assert.match(presentation, /players\?\.find\(\(player\) => player\.id === 2\)/);
});

test("packages every web part behind a self-consistent dynamic manifest", async () => {
  const partsRoot = new URL("public/riftbomb-parts/", root);
  const { directory, manifest, names } = await readPackagedGameParts();
  const versionDirectories = (await readdir(partsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  assert.equal(manifest.version, 2);
  assert.equal(manifest.partsPath, `/riftbomb-parts/${manifest.sha256}`);
  assert.deepEqual(versionDirectories, [manifest.sha256]);
  assert.equal(names.length, manifest.partCount);
  const artifact = Buffer.concat(
    await Promise.all(names.map((entry) => readFile(new URL(entry, directory)))),
  );
  assert.equal(artifact.length, manifest.byteLength);
  assert.equal(
    createHash("sha256").update(artifact).digest("hex"),
    manifest.sha256,
  );
});

test("caches only fingerprinted game parts as immutable", async () => {
  const headers = await readFile(new URL("public/_headers", root), "utf8");
  const loader = await readFile(new URL("public/riftbomb-loader.js", root), "utf8");

  assert.match(
    headers,
    /\/riftbomb-parts\/:version\/\*\s+Cache-Control: public, max-age=31556952, immutable/,
  );
  assert.match(
    headers,
    /\/riftbomb-parts\/manifest\.json\s+Cache-Control: no-store/,
  );
  assert.match(loader, /manifest\.partsPath !== `\/riftbomb-parts\/\$\{manifest\.sha256\}`/);
  assert.match(loader, /fetch\(`\$\{manifest\.partsPath\}\/part-\$\{name\}/);
  assert.doesNotMatch(headers, /^\/riftbomb\.html|^\/riftbomb-loader\.js/m);
});

test("keeps arena WebP files out of the initial online payload", async () => {
  const { directory, names } = await readPackagedGameParts();
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
    ["game/arena-appearance/textures/crates/crate-albedo.webp", "crate.webp"],
    ["game/arena-appearance/textures/crates/crate-top-albedo.webp", "crate-top.webp"],
    ["game/arena-appearance/textures/ground/floor-lattice.webp", "floor-lattice.webp"],
    ["game/arena-appearance/textures/ground/floor-clearing.webp", "floor-clearing.webp"],
    ["game/arena-appearance/textures/ground/floor-labyrinth.webp", "floor-labyrinth.webp"],
    ["game/arena-appearance/textures/ground/floor-forts.webp", "floor-forts.webp"],
    ["game/arena-appearance/textures/ground/floor-pit.webp", "floor-pit.webp"],
    ["game/arena-appearance/textures/walls/wall-lattice.webp", "wall-lattice.webp"],
    ["game/arena-appearance/textures/walls/wall-clearing.webp", "wall-clearing.webp"],
    ["game/arena-appearance/textures/walls/wall-labyrinth.webp", "wall-labyrinth.webp"],
    ["game/arena-appearance/textures/walls/wall-forts.webp", "wall-forts.webp"],
    ["game/arena-appearance/textures/walls/wall-pit.webp", "wall-pit.webp"],
    ["game/arena-appearance/textures/walls/wall-top-lattice.webp", "wall-top-lattice.webp"],
    ["game/arena-appearance/textures/walls/wall-top-clearing.webp", "wall-top-clearing.webp"],
    ["game/arena-appearance/textures/walls/wall-top-labyrinth.webp", "wall-top-labyrinth.webp"],
    ["game/arena-appearance/textures/walls/wall-top-forts.webp", "wall-top-forts.webp"],
    ["game/arena-appearance/textures/walls/wall-top-pit.webp", "wall-top-pit.webp"],
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
  const { directory, names } = await readPackagedGameParts();
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
    const metadata = JSON.parse(
      await readFile(
        new URL(`${modelDirectory}/${champion}-model-metadata.json`, root),
        "utf8",
      ),
    );
    assert.deepEqual(Buffer.from(payload.vertices, "base64"), vertices);
    assert.deepEqual(Buffer.from(payload.indices, "base64"), indices);
    assert.deepEqual(
      Buffer.from(payload.texture.replace(/^data:image\/webp;base64,/, ""), "base64"),
      texture,
    );
    if (metadata.runtime === "vat-v1") {
      const frames = await readFile(
        new URL(`${modelDirectory}/${champion}-model-frames.bin`, root),
      );
      const normals = await readFile(
        new URL(`${modelDirectory}/${champion}-model-normals.bin`, root),
      );
      // Online ships VAT pose data as separate .bin assets (Workers 25 MiB/file cap).
      assert.equal(payload.frames, undefined);
      assert.equal(payload.normals, undefined);
      assert.equal(payload.framesUrl, `/champion-models/${champion}-frames.bin`);
      assert.equal(payload.normalsUrl, `/champion-models/${champion}-normals.bin`);
      const packedFrames = await readFile(
        new URL(`public/champion-models/${champion}-frames.bin`, root),
      );
      const packedNormals = await readFile(
        new URL(`public/champion-models/${champion}-normals.bin`, root),
      );
      const compactRgb = (rgba, componentBytes) => {
        const rgbaPixelBytes = componentBytes * 4;
        const rgbPixelBytes = componentBytes * 3;
        const rgb = Buffer.alloc(rgba.byteLength / 4 * 3);
        for (
          let sourceOffset = 0, targetOffset = 0;
          sourceOffset < rgba.byteLength;
          sourceOffset += rgbaPixelBytes, targetOffset += rgbPixelBytes
        ) {
          rgba.copy(rgb, targetOffset, sourceOffset, sourceOffset + rgbPixelBytes);
        }
        return rgb;
      };
      assert.deepEqual(packedFrames, compactRgb(frames, Uint16Array.BYTES_PER_ELEMENT));
      assert.deepEqual(packedNormals, compactRgb(normals, Uint8Array.BYTES_PER_ELEMENT));
      assert.equal(packedFrames.byteLength, frames.byteLength * 3 / 4);
      assert.equal(packedNormals.byteLength, normals.byteLength * 3 / 4);
      assert.ok(script.length < 25 * 1024 * 1024, `${champion}.js must stay under Workers asset limit`);
      assert.ok(packedFrames.byteLength < 25 * 1024 * 1024);
      assert.ok(packedNormals.byteLength < 25 * 1024 * 1024);
      assert.equal(payload.animation.runtime, "vat-v1");
      assert.equal(payload.animation.componentsPerTexel, 3);
      assert.equal(payload.animation.frameCount, metadata.frameCount);
      assert.ok(payload.animation.actions, `${champion} must ship animation.actions`);
      assert.deepEqual(payload.animation.actions, metadata.animationActions);
      assert.ok(payload.animation.clips, `${champion} must ship animation.clips`);
    }
  }
});

test("ships server-authoritative room and snapshot behavior", async () => {
  const client = await readFile(new URL("public/online-duel.js", root), "utf8");
  const server = await readFile(new URL("server/src/server.mjs", root), "utf8");
  const rooms = await readFile(new URL("server/src/authoritative-rooms.mjs", root), "utf8");
  const worker = await readFile(new URL("worker/index.ts", root), "utf8");
  const adapter = await readFile(new URL("..\/game\/create-authoritative-duel.mjs", root), "utf8");
  assert.match(client, /AUTHORITATIVE_SERVER_URL/);
  assert.match(client, /connectAuthoritative/);
  assert.match(client, /new WebSocket/);
  assert.match(client, /action: "create"/);
  assert.match(client, /state\.role === "guest"/);
  assert.match(client, /game\.p2Human = false/);
  assert.match(client, /ensureChampionModels\(\[state\.hostChampion, state\.guestChampion\]\)/);
  assert.match(client, /bindLocalOnlineView\(\)/);
  assert.match(client, /localOnlinePlayerId\(\)/);
  assert.match(client, /const abilityKeys = \{ KeyQ: 0, KeyF: 1, KeyE: 2, KeyR: 3 \}/);
  assert.match(client, /guestAction\("ability", abilityKeys\[event\.code\]\)/);
  assert.match(client, /CREATE CHALLENGE LINK/);
  assert.match(client, /type: "quick-match"/);
  assert.match(client, /function startQuickMatch/);
  assert.match(server, /quickMatchQueue/);
  assert.match(client, /INVITE_MATCH_TARGET = 10/);
  assert.match(client, /url\.searchParams\.set\("p1", state\.hostChampion\)/);
  assert.match(client, /url\.searchParams\.set\("p2", state\.guestChampion\)/);
  assert.match(client, /setTimeout\(\(\) => joinRoom\(parentRoom\.toUpperCase\(\)/);
  assert.match(client, /function startOnlineMatch/);
  assert.match(client, /type === "rematch"/);
  assert.match(client, /shareReady/);
  assert.match(client, /matchTarget: state\.matchTarget/);
  assert.match(client, /function interpolateRemoteHost/);
  assert.match(client, /pendingGuestBombs\.push/);
  assert.match(client, /game\.placeBomb\(guest\)/);
  assert.match(client, /authoritativeAudio\.consume/);
  assert.match(client, /authoritativePredictionSink/);
  assert.match(client, /browserGameplaySfx\.effect/);
  assert.match(client, /game\.audioPanAt\(x, z\)/);
  assert.match(client, /lastPlayedSoundEventId/);
  assert.doesNotMatch(client, /consumeAuthoritativeSound|capturePredictedSounds|receivedSoundEventId/);
  assert.match(rooms, /TICK_RATE = 60/);
  assert.match(rooms, /SNAPSHOT_RATE = 30/);
  assert.match(rooms, /createAuthoritativeDuel/);
  assert.match(rooms, /soundEventSequence/);
  assert.match(server, /x-riftbomb-proxy/);
  assert.match(server, /type: "ping"/);
  assert.match(client, /type: "pong"/);
  assert.match(worker, /url\.pathname === "\/game-ws"/);
  assert.match(worker, /GAME_SERVER_PROXY_SECRET/);
  assert.match(adapter, /run-champion-bomb-duel\.js/);
  assert.match(adapter, /createAuthoritativeAudioRecorder/);
  assert.match(adapter, /snapshot\.sound/);
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
  assert.match(route, /action === "publish-offer"/);
  assert.match(route, /preparing: true/);
  assert.match(route, /let schemaReady: Promise<void> \| null = null/);
  assert.match(route, /if \(!schemaReady\)/);
  assert.equal(
    (route.match(/await deleteExpiredRooms\(/g) || []).length,
    1,
    "expired-room cleanup belongs only on room creation",
  );
});
