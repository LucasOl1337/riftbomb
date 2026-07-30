import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

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
  assert.match(page, /data-riftbomb-manifest='/);
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
  assert.match(packager, /rootBuildReady = process\.argv\[2\] === "--root-build-ready"/);
  assert.match(packager, /if \(!rootBuildReady\)/);
  assert.match(packager, /arenaTextureOutputDirectory/);
  assert.match(packager, /championModelOutputDirectory/);
  assert.doesNotMatch(page, /<script>[\s\S]*<\/script>/);
});

test("embeds the packaged manifest to remove its serial boot request", async () => {
  const page = await readFile(new URL("public/riftbomb.html", root), "utf8");
  const loader = await readFile(new URL("public/riftbomb-loader.js", root), "utf8");
  const manifest = JSON.parse(
    await readFile(new URL("public/riftbomb-parts/manifest.json", root), "utf8"),
  );
  const embedded = page.match(/data-riftbomb-manifest='([^']+)'/);

  assert.ok(embedded, "generated shell must carry the packaged manifest");
  assert.deepEqual(JSON.parse(embedded[1]), manifest);
  assert.match(loader, /document\.currentScript\?\.dataset\.riftbombManifest/);
  assert.match(loader, /if \(embeddedManifest\)/);
  assert.match(loader, /fetch\("\/riftbomb-parts\/manifest\.json"/);
});

test("uses the embedded manifest normally and keeps the external fallback", async () => {
  const loader = await readFile(new URL("public/riftbomb-loader.js", root), "utf8");
  const { directory, manifest, names } = await readPackagedGameParts();
  const parts = new Map(
    await Promise.all(names.map(async (name) => [name, await readFile(new URL(name, directory))])),
  );

  async function runLoader(embeddedManifest) {
    const requests = [];
    let resolveCompleted;
    let rejectCompleted;
    const completed = new Promise((resolve, reject) => {
      resolveCompleted = resolve;
      rejectCompleted = reject;
    });
    const progress = {};
    const status = {};
    const document = {
      currentScript: { dataset: embeddedManifest ? { riftbombManifest: embeddedManifest } : {} },
      getElementById(id) {
        return id === "progress" ? progress : status;
      },
      open() {},
      write(game) {
        assert.match(game, /<!doctype html>/i);
      },
      close() {
        resolveCompleted();
      },
      documentElement: { dataset: {} },
    };
    const context = {
      console: { error: rejectCompleted },
      crypto: webcrypto,
      document,
      fetch: async (url) => {
        requests.push(url);
        if (url === "/riftbomb-parts/manifest.json") {
          return { ok: true, json: async () => manifest };
        }
        const part = parts.get(url.split("/").at(-1));
        assert.ok(part, `unexpected loader request: ${url}`);
        return {
          ok: true,
          arrayBuffer: async () => part.buffer.slice(
            part.byteOffset,
            part.byteOffset + part.byteLength,
          ),
        };
      },
      location: { search: "" },
      performance,
      TextDecoder,
      URLSearchParams,
    };
    context.globalThis = context;
    vm.runInNewContext(loader, context);
    await completed;
    return requests;
  }

  const embeddedRequests = await runLoader(JSON.stringify(manifest));
  const fallbackRequests = await runLoader();

  assert.equal(embeddedRequests.length, manifest.partCount);
  assert.doesNotMatch(embeddedRequests.join("\n"), /manifest\.json/);
  assert.equal(fallbackRequests.length, manifest.partCount + 1);
  assert.equal(fallbackRequests[0], "/riftbomb-parts/manifest.json");
});

test("uses one authoritative WebSocket transport", async () => {
  const duel = await readFile(new URL("public/online-duel.js", root), "utf8");

  assert.match(duel, /new WebSocket\(AUTHORITATIVE_SERVER_URL\)/);
  assert.doesNotMatch(duel, /RTCPeerConnection|iceGatheringState|state\.inputChannel|state\.snapshots/);
});

test("movement and actions use independent bounded streams with causal ACK and replay", async () => {
  const [client, server, rooms, clientCss] = await Promise.all([
    readFile(new URL("public/online-duel.js", root), "utf8"),
    readFile(new URL("server/src/server.mjs", root), "utf8"),
    readFile(new URL("server/src/authoritative-rooms.mjs", root), "utf8"),
    readFile(new URL("public/online-duel.css", root), "utf8")
  ]);

  assert.match(client, /function createReliableInputStream/);
  assert.match(client, /INPUT_OUTBOX_LIMIT = 64/);
  assert.match(client, /inputProtocol: INPUT_PROTOCOL_VERSION/);
  assert.match(client, /setInterval\(\(\) => \{\s*if \(!state\.connected\) return;\s*reliableInput\.replay\(\);\s*reliableAction\.replay\(\)/);
  assert.match(client, /function sendMovementInput/);
  assert.match(client, /reliableInput\.currentEpoch\(\) <= 0/);
  assert.match(client, /inputEpoch: epoch/);
  assert.match(client, /inputSeq: nextSequence\+\+/);
  assert.match(client, /if \(cursor\.epoch < epoch\) return false/);
  assert.match(client, /transmit\(outbox\[0\], true\)/);
  assert.match(client, /reliableInput\.synchronize\(data\.input/);
  const matchControl = client.slice(
    client.indexOf("function handleControl"),
    client.indexOf("function sendControl")
  );
  assert.match(matchControl,
    /reliableInput\.currentEpoch\(\) <= 0\) state\.lastLegacyInput = -1/,
    "legacy movement dedupe must re-arm at every old-server match boundary");
  assert.match(client, /if \(!reliableInput\.queue\(mask\)\) reliableInput\.replay\(\)/);
  const keyup = client.slice(
    client.indexOf('addEventListener("keyup"'),
    client.indexOf('addEventListener("blur"')
  );
  assert.ok(keyup.indexOf("state.localInput[direction] = false") <
    keyup.indexOf('game.mode !== "playing"'),
  "guest key release must clear local state even between matches");
  assert.match(client, /function createReliableActionStream/);
  assert.match(client, /ACTION_OUTBOX_LIMIT = 16/);
  assert.match(client, /actionProtocol: ACTION_PROTOCOL_VERSION/);
  assert.match(client, /actionEpoch: epoch/);
  assert.match(client, /actionSeq: nextSequence\+\+/);
  assert.match(client, /actionRound: round/);
  assert.match(client, /reliableAction\.negotiate\(message\.action/);
  assert.match(client, /reliableAction\.synchronize\(data\.action/);
  assert.match(client, /function sendOnlineAction/);
  assert.match(client, /actionAlert\.setAttribute\("role", "alert"\)/);
  assert.match(client, /showActionDeliveryError\(message\)/,
    "a fail-closed action must remain visibly actionable during the match");
  assert.match(clientCss, /\.online-action-alert \{[\s\S]*position: fixed;[\s\S]*z-index: 15;/);
  assert.doesNotMatch(clientCss, /is-match-active[^\n]*online-action-alert/,
    "match mode must not hide its critical action-delivery alert");
  assert.match(client, /if \(!sendOnlineAction\("bomb"\)\) return false/);
  assert.match(client, /if \(!sendOnlineAction\("ability", slot\)\) return false/);
  assert.match(client,
    /if \(!persistNow\(\)\) \{\s*outbox\.pop\(\);\s*nextSequence -= 1;\s*failure = "storage";\s*return false;\s*\}\s*if \(outbox\.length === 1\) transmit\(entry\)/,
    "an action envelope must durably persist or roll back before transmission");
  assert.doesNotMatch(client, /pagehide[^\n]*clearInterval/,
    "BFCache restore must keep the delivery timer available");
  assert.doesNotMatch(client, /sendControl\(\{ type: "action"/,
    "gameplay actions must route through negotiated delivery");
  assert.doesNotMatch(client, /reliableInput\.queue\([^)]*(?:bomb|ability)/);

  assert.match(server, /room\.players\[index\]\?\.socket !== socket/);
  assert.match(server, /inputProtocol: message\.inputProtocol === 1 \? 1 : 0/);
  assert.match(server, /actionProtocol: message\.actionProtocol === 1 \? 1 : 0/);
  assert.match(server, /authoritativeRooms\.acceptInput\(room, index, message\)/);
  assert.match(server, /authoritativeRooms\.processPlayerAction\(room, index, message\)/);
  assert.match(server, /room\.game\?\.mode === "matchover"/);
  assert.match(server, /message\.inputEpoch === room\.inputEpoch/);
  assert.match(rooms, /message\.inputSeq !== room\.inputAccepted\[playerIndex\] \+ 1/);
  assert.match(rooms, /room\.game\.update\(dt\);\s*room\.inputApplied\[0\] =/);
  assert.match(rooms, /snapshot\.input = this\.inputProtocol\(room\)/);
  assert.match(rooms, /snapshot\.action = this\.actionProtocol\(room\)/);
  assert.match(rooms, /message\.actionSeq !== room\.actionAck\[playerIndex\] \+ 1/);
  assert.match(rooms, /message\.actionRound === room\.game\.round/);
  assert.match(rooms, /room\.actionAck\[playerIndex\] = message\.actionSeq/);
  assert.match(rooms, /inputEpoch: 0/);
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
  const controls = [];
  let connectedCalls = 0;
  const connectAuthoritative = new Function(
    "WebSocket",
    "AUTHORITATIVE_SERVER_URL",
    "INPUT_PROTOCOL_VERSION",
    "ACTION_PROTOCOL_VERSION",
    "RESUME_PROTOCOL_VERSION",
    "state",
    "pendingConnectCancel",
    "setTimeout",
    "clearTimeout",
    "lobbyPayload",
    "ensureResumeToken",
    "onConnected",
    "receiveSnapshot",
    "handleControl",
    "saveSession",
    "clearPendingResume",
    "reliableInput",
    "reliableAction",
    "localOnlinePlayerId",
    `"use strict"; ${declaration}; return connectAuthoritative;`
  )(
    FakeWebSocket,
    "ws://test.invalid/game-ws",
    1,
    1,
    1,
    state,
    null,
    () => 1,
    () => {},
    () => ({}),
    () => "11".repeat(32),
    () => { connectedCalls += 1; },
    (snapshot) => applied.push(snapshot),
    (message) => controls.push(message),
    () => {},
    () => {},
    { synchronize() { return true; } },
    { negotiate() { return true; } },
    () => 1
  );

  const superseded = connectAuthoritative("host");
  const oldSocket = sockets[0];
  const activePromise = connectAuthoritative("host");
  const activeSocket = sockets[1];
  await assert.rejects(superseded, /resume_cancelled/,
    "superseding a pending connect must settle its promise");

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
  assert.equal(activeSocket.sent[0].resumeProtocol, 1);
  assert.equal(activeSocket.sent[0].resumeToken, "11".repeat(32));
  assert.equal(state.lastPlayedSoundEventId, 2);
  assert.deepEqual(applied, [{ s: 1, room: "new" }]);
  assert.equal(connectedCalls, 1);

  let resumeResolved = false;
  const resumed = connectAuthoritative("guest", { resume: true, resumePhase: "match" })
    .then(() => { resumeResolved = true; });
  const resumedSocket = sockets[2];
  resumedSocket.emit("open");
  resumedSocket.emit("message", {
    type: "connected",
    resume: { v: 1, protected: true, resumed: true },
    input: { v: 1, epoch: 4, accepted: [0, 7], ack: [0, 7] }
  });
  await Promise.resolve();
  assert.equal(resumeResolved, false, "authenticated resume waits for its explicit control frame");
  resumedSocket.emit("message", { type: "resume", activeMatch: true });
  await resumed;
  assert.equal(resumeResolved, true);
  assert.equal(controls.at(-1).type, "resume");

  const rejected = connectAuthoritative("guest");
  const rejectedSocket = sockets[3];
  rejectedSocket.emit("open");
  rejectedSocket.emit("message", { type: "error", error: "role_taken" });
  await assert.rejects(rejected, /role_taken/);
  assert.equal(rejectedSocket.readyState, 3, "pre-connected errors must close their socket");

  state.sessionConfirmed = false;
  const freshLobby = connectAuthoritative("guest", { resume: true, resumePhase: "lobby" });
  const freshLobbySocket = sockets[4];
  freshLobbySocket.emit("open");
  assert.equal(freshLobbySocket.sent[0].resumeOnly, false);
  freshLobbySocket.emit("message", {
    type: "connected",
    resume: { v: 1, protected: true, resumed: false },
    input: { v: 1, epoch: 0, accepted: [0, 0], ack: [0, 0] }
  });
  await freshLobby;
  assert.equal(controls.at(-1).type, "resume");
  assert.equal(controls.at(-1).activeMatch, false,
    "a persisted pre-hello lobby claim must complete instead of orphaning its bearer");
  assert.equal(state.sessionConfirmed, true);

  const confirmedLobby = connectAuthoritative("guest", { resume: true, resumePhase: "lobby" });
  const confirmedLobbySocket = sockets[5];
  confirmedLobbySocket.emit("open");
  assert.equal(confirmedLobbySocket.sent[0].resumeOnly, true,
    "an established lobby may only recover its existing protected seat");
  confirmedLobbySocket.emit("message", {
    type: "connected",
    resume: { v: 1, protected: true, resumed: true },
    input: { v: 1, epoch: 0, accepted: [0, 0], ack: [0, 0] }
  });
  confirmedLobbySocket.emit("message", { type: "resume", activeMatch: false });
  await confirmedLobby;

  const missingMatch = connectAuthoritative("guest", { resume: true, resumePhase: "match" });
  const missingMatchSocket = sockets[6];
  missingMatchSocket.emit("open");
  assert.equal(missingMatchSocket.sent[0].resumeOnly, true);
  missingMatchSocket.emit("message", {
    type: "connected",
    resume: { v: 1, protected: true, resumed: false }
  });
  await assert.rejects(missingMatch, /resume_denied/);
  assert.equal(missingMatchSocket.readyState, 3);
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

test("caches only fingerprinted game artifacts as immutable", async () => {
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
  assert.match(
    headers,
    /\/arena-textures\/floor-salt-lens-combat-band-6ffb0854\.webp\s+Cache-Control: public, max-age=31556952, immutable/,
  );
  assert.match(
    headers,
    /\/arena-textures\/floor-storm-eye-combat-field-99509f91\.webp\s+Cache-Control: public, max-age=31556952, immutable/,
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
  assert.match(game, /\/arena-textures\/floor-salt-lens-combat-band-6ffb0854\.webp/);
  assert.match(game, /\/arena-textures\/floor-storm-eye-combat-field-99509f91\.webp/);
  assert.doesNotMatch(game, /\/arena-textures\/floor-lattice\.webp/);
  assert.doesNotMatch(game, /\/arena-textures\/floor-pit\.webp/);

  const textures = [
    ["game/arena-appearance/textures/crates/crate-albedo.webp", "crate.webp"],
    ["game/arena-appearance/textures/crates/crate-top-albedo.webp", "crate-top.webp"],
    [
      "game/arena-appearance/textures/ground/floor-salt-lens-combat-band-6ffb0854.webp",
      "floor-salt-lens-combat-band-6ffb0854.webp",
    ],
    ["game/arena-appearance/textures/ground/floor-clearing.webp", "floor-clearing.webp"],
    ["game/arena-appearance/textures/ground/floor-labyrinth.webp", "floor-labyrinth.webp"],
    ["game/arena-appearance/textures/ground/floor-forts.webp", "floor-forts.webp"],
    [
      "game/arena-appearance/textures/ground/floor-storm-eye-combat-field-99509f91.webp",
      "floor-storm-eye-combat-field-99509f91.webp",
    ],
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
  const arenaUrls = game.match(/\/arena-textures\/[^"]+\.webp/g) || [];
  assert.equal(arenaUrls.length, textures.length);
  assert.equal(new Set(arenaUrls).size, textures.length, "every arena slot must own one URL");
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
  assert.doesNotMatch(game, /RIFTBOMB_BOTS\.createV1Policy/);
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
  assert.match(route, /createPersistedRoom\(db/);
});
