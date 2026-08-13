import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);

test("War Table memoizes stable subtrees across runtime bridge updates", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");

  for (const component of [
    "RuntimeFrame",
    "BrandMark",
    "ExpandIcon",
    "ChampionAvatar",
    "UnknownRivalAvatar",
    "SectionHeading",
    "ModeList",
    "ArenaList",
    "ChampionList",
  ]) {
    assert.match(
      page,
      new RegExp(`const ${component} = memo\\(function ${component}\\(`),
      `${component} should skip unchanged leaf renders`,
    );
  }

  assert.match(page, /runtimeStateEquals\(lastRuntimeRef\.current, next\)/);
  assert.match(page, /const controlsDisabled = inLobby \|\| runtime\.matchmaking \|\| runtime\.busy/);
  assert.match(page, /<ModeList activeMode=\{activeMode\} disabled=\{controlsDisabled\} onSelect=\{chooseMode\} \/>/);
  assert.match(page, /<ArenaList arena=\{arena\} disabled=\{controlsDisabled\} onSelect=\{chooseArena\} \/>/);
  assert.match(page, /<ChampionList champion=\{champion\} disabled=\{controlsDisabled\} onSelect=\{chooseChampion\} \/>/);
  assert.match(page, /<ChampionAvatar champion=\{item\} size="sm" \/>/);
});

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
  const loaderMatch = page.match(/src="\/(riftbomb-loader-[a-f0-9]{64}\.js)"/);
  assert.ok(loaderMatch, "the published shell must pin its arena loader by content hash");
  const loader = await readFile(
    new URL(`public/${loaderMatch[1]}`, root),
    "utf8",
  );
  const command = await readFile(new URL("scripts/package-riftbomb.mjs", root), "utf8");

  assert.match(page, /src="\/riftbomb-loader-[a-f0-9]{64}\.js"/);
  assert.match(page, /data-riftbomb-manifest='/);
  assert.match(loader, /online-duel\.css/);
  assert.match(loader, /online-duel-loader-[a-f0-9]{64}\.js/);
  assert.doesNotMatch(loader, /<script src="\/online-duel\.js"><\/script>/);
  assert.doesNotMatch(loader, /authoritative-audio\.js/);
  assert.match(loader, /Promise\.all/);
  assert.match(loader, /manifest\.partCount/);
  assert.match(loader, /response\.arrayBuffer/);
  assert.match(loader, /new TextDecoder/);
  assert.match(command, /createOfflineGamePublication\(\)\.publish/);
  assert.match(command, /rootBuildReady = process\.argv\[2\] === "--root-build-ready"/);
  assert.doesNotMatch(command, /PART_SIZE|readFile|writeFile|manifest\.json/);
  assert.doesNotMatch(page, /<script>[\s\S]*<\/script>/);
});

test("defers the online bridge until a command, session or direct visit needs it", async () => {
  const [loader, bootstrap, continuity, runtime] = await Promise.all([
    readFile(new URL("public/riftbomb-loader.js", root), "utf8"),
    readFile(new URL("public/online-duel-loader.js", root), "utf8"),
    readFile(new URL("public/match-continuity.js", root), "utf8"),
    readFile(new URL("public/online-duel.js", root), "utf8"),
  ]);
  assert.match(loader, /online-duel-loader\.js/);
  assert.match(bootstrap, /RIFTBOMB_ONLINE_DUEL_LAZY_V1/);
  assert.match(bootstrap, /const CONTINUITY_URL = "\/match-continuity\.js"/);
  assert.match(bootstrap, /const RUNTIME_URL = "\/online-duel\.js"/);
  assert.ok(
    Buffer.byteLength(bootstrap) < (Buffer.byteLength(continuity) + Buffer.byteLength(runtime)) / 10,
    "the critical bridge loader must stay below 10% of its deferred modules",
  );

  const listeners = new Set();
  const states = [];
  const replayedCommands = [];
  const requests = [];
  const parent = { location: { href: "https://example.test/" } };
  const window = {
    parent,
    location: { origin: "https://example.test" },
    postMessage(message) { states.push(message); },
    dispatchEvent(event) {
      for (const listener of listeners) listener(event);
    },
  };
  parent.postMessage = (message) => states.push(message);
  const appendedScripts = [];
  const document = {
    createElement(type) {
      assert.equal(type, "script");
      return {};
    },
    head: {
      append(script) {
        appendedScripts.push(script);
        requests.push(script.src);
      },
    },
    body: null,
  };
  const context = {
    MessageEvent: class MessageEvent {
      constructor(type, init) {
        Object.assign(this, { type }, init);
      }
    },
    addEventListener(type, listener) {
      assert.equal(type, "message");
      listeners.add(listener);
    },
    document,
    location: window.location,
    sessionStorage: { getItem() { return null; } },
    window,
    URL,
    console,
  };
  context.globalThis = context;
  listeners.add((event) => {
    if (event.data?.type === "command") replayedCommands.push(event.data);
  });

  vm.runInNewContext(bootstrap, context, { filename: "online-duel-loader.js" });
  const bootstrapListener = [...listeners].at(-1);
  assert.deepEqual(requests, []);
  assert.equal(states.length, 1);
  assert.equal(states[0].state.phase, "setup");
  assert.equal(states[0].state.busy, false);

  const command = {
    source: "riftbomb-client",
    version: 1,
    type: "command",
    action: "start-offline",
    payload: { champion: "katarina", guestChampion: "zed", arena: "lattice" },
  };
  bootstrapListener({
    source: parent,
    origin: "https://example.test",
    data: command,
  });
  assert.deepEqual(requests, ["/match-continuity.js"]);
  appendedScripts[0].onload();
  await Promise.resolve();
  assert.deepEqual(requests, ["/match-continuity.js", "/online-duel.js"]);
  appendedScripts[1].onload();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(replayedCommands, [command]);
  assert.equal(appendedScripts.every((script) => script.async), true);
});

test("online bridge delegates prediction and reconciliation to the published movement seam", async () => {
  const source = await readFile(new URL("public/online-duel.js", root), "utf8");
  assert.match(source, /ONLINE_RESPONSIVENESS_V2/);
  assert.match(source, /globalThis\.RIFTBOMB_ONLINE_MOVEMENT/);
  assert.match(source, /onlineMovement\.stepLocal\(game, player, inputMaskFrom\(input\), dt\)/);
  assert.doesNotMatch(source, /localPlayerTarget|reconcileLocalPlayer/);
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
  const [duel, continuity] = await Promise.all([
    readFile(new URL("public/online-duel.js", root), "utf8"),
    readFile(new URL("public/match-continuity.js", root), "utf8"),
  ]);

  assert.match(duel, /RIFTBOMB_MATCH_CONTINUITY/);
  assert.match(continuity, /openSocket = \(url\) => new WebSocket\(url\)/);
  assert.doesNotMatch(duel, /RTCPeerConnection|iceGatheringState|state\.inputChannel|state\.snapshots/);
  assert.doesNotMatch(continuity, /RTCPeerConnection|iceGatheringState/);
});

test("movement and actions use independent bounded streams with causal ACK and replay", async () => {
  const [client, continuity, server, rooms, clientCss] = await Promise.all([
    readFile(new URL("public/online-duel.js", root), "utf8"),
    readFile(new URL("public/match-continuity.js", root), "utf8"),
    readFile(new URL("server/src/server.mjs", root), "utf8"),
    readFile(new URL("server/src/authoritative-rooms.mjs", root), "utf8"),
    readFile(new URL("public/online-duel.css", root), "utf8")
  ]);

  assert.doesNotMatch(client, /function createReliableInputStream|function createReliableActionStream/);
  assert.match(client, /const \{ connection: matchConnection, delivery, runtime, session \} = continuity/);
  assert.match(client, /if \(state\.connected\) delivery\.replay\(\)/);
  assert.doesNotMatch(client, /function sendMovementInput|lastLegacyInput/);
  assert.match(client, /delivery\.sendMovement\(inputMask\(\)\)/);
  assert.match(client, /delivery\.synchronize\(data, seatIndex\)/);
  assert.match(client, /delivery\.beginMatch\(message, seatIndex\)/);
  assert.match(continuity, /rearmLegacy/,
    "legacy movement dedupe must re-arm at every old-server Match boundary");
  const keyup = client.slice(
    client.indexOf('addEventListener("keyup"'),
    client.indexOf('addEventListener("blur"')
  );
  assert.ok(keyup.indexOf("state.localInput[direction] = false") <
    keyup.indexOf('game.mode !== "playing"'),
  "guest key release must clear local state even between matches");
  assert.match(client, /function sendOnlineAction/);
  assert.match(client, /actionAlert\.setAttribute\("role", "alert"\)/);
  assert.match(client, /showActionDeliveryError\(message\)/,
    "a fail-closed action must remain visibly actionable during the match");
  assert.match(clientCss, /\.runtime-action-alert \{[\s\S]*position: fixed;[\s\S]*z-index: 15;/);
  assert.doesNotMatch(clientCss, /is-match-active[^\n]*runtime-action-alert/,
    "match mode must not hide its critical action-delivery alert");
  assert.match(client, /if \(!sendOnlineAction\("bomb"\)\) return false/);
  assert.match(client, /if \(!sendOnlineAction\("ability", slot, aim\)\) return false/);
  assert.match(client, /const sent = delivery\.sendAction\(kind, slot, game\.round, aim\)/,
    "aimed abilities must preserve their target in the reliable action envelope");
  assert.doesNotMatch(client, /pagehide[^\n]*clearInterval/,
    "BFCache restore must keep the delivery timer available");
  assert.doesNotMatch(client, /sendControl\(\{ type: "action"/,
    "gameplay actions must route through negotiated delivery");
  assert.match(continuity, /INPUT_OUTBOX_LIMIT = 64/);
  assert.match(continuity, /ACTION_OUTBOX_LIMIT = 16/);
  assert.match(continuity, /if \(!persistNow\(\)\) \{\s*outbox\.pop\(\);\s*nextSequence -= 1;/,
    "an action envelope must durably persist or roll back before transmission");

  assert.match(server, /authoritativeRooms\.receive\(socket, message\)/);
  assert.match(rooms, /room\.players\[index\]\?\.socket !== socket/);
  assert.match(rooms, /this\.acceptInput\(room, index, message\)/);
  assert.match(rooms, /this\.processPlayerAction\(room, index, message\)/);
  assert.match(rooms, /room\.game\?\.mode === "matchover"/);
  assert.match(rooms, /message\.inputEpoch === room\.inputEpoch/);
  assert.match(rooms, /message\.inputSeq !== room\.inputAccepted\[playerIndex\] \+ 1/);
  assert.match(rooms,
    /room\.game\.update\(dt\);[\s\S]*const applied0 = room\.inputAccepted\[0\];[\s\S]*room\.inputApplied\[0\] = applied0/);
  assert.match(rooms, /snapshot\.input = this\.inputProtocol\(room\)/);
  assert.match(rooms, /snapshot\.action = this\.actionProtocol\(room\)/);
  assert.match(rooms, /message\.actionSeq !== room\.actionAck\[playerIndex\] \+ 1/);
  assert.match(rooms, /message\.actionRound === room\.game\.round/);
  assert.match(rooms, /room\.actionAck\[playerIndex\] = message\.actionSeq/);
  assert.match(rooms, /inputEpoch: 0/);
});

test("the bridge delegates socket generations and resume handshakes to Match continuity", async () => {
  const [bridge, continuity] = await Promise.all([
    readFile(new URL("public/online-duel.js", root), "utf8"),
    readFile(new URL("public/match-continuity.js", root), "utf8"),
  ]);

  assert.match(bridge, /matchConnection\.connect\(/);
  assert.match(bridge, /matchConnection\.isOpen\(\)/);
  assert.doesNotMatch(bridge, /state\.socket|WebSocket\.OPEN/);
  assert.doesNotMatch(bridge, /pendingConnectCancel|new Function/);
  assert.match(continuity, /if \(activeSocket !== socket\) return/);
  assert.match(continuity, /pendingConnectionCancel/);
  assert.match(continuity, /resume_cancelled/);
});
test("online one-shot audio is authoritative, ordered and locally panned", async () => {
  const duel = await readFile(new URL("public/online-duel.js", root), "utf8");
  assert.match(duel, /RIFTBOMB_AUTHORITATIVE_AUDIO_INLINE_V1/);
  assert.match(duel, /authoritativePredictionSink/);
  assert.match(duel, /lastPlayedSoundEventId/);
  assert.match(duel, /sourceId: `remote:\$\{event\.id\}`/);
  assert.match(duel, /game\.audioPanAt\(x, z\)/);
  assert.match(duel, /droppedSoundEventCount \+= result\.gap\.count/);
  assert.match(duel, /console\.warn\("Authoritative audio gap"/);
  assert.match(duel, /event\.id <= nextCursor/);
  assert.equal((duel.match(/authoritativeAudio\.consume/g) || []).length, 1);
  assert.doesNotMatch(duel, /consumeAuthoritativeSound|receivedSoundEventId|predictedSounds/);
  assert.doesNotMatch(duel, /\.\.\.event\.options/);
});

test("online client can leave match/lobby and resume a saved session after reload", async () => {
  const [duel, continuity] = await Promise.all([
    readFile(new URL("public/online-duel.js", root), "utf8"),
    readFile(new URL("public/match-continuity.js", root), "utf8"),
  ]);
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const styles = await readFile(new URL("app/war-table.css", root), "utf8");

  assert.match(continuity, /SESSION_KEY/);
  assert.match(continuity, /PENDING_RESUME_KEY/);
  assert.match(duel, /tryResumeSession/);
  assert.match(duel, /leaveOnlineSession/);
  assert.match(duel, /leave-match/);
  assert.match(duel, /sessionStorage/);
  assert.match(page, /leaveMatch/);
  assert.match(page, /match-exit-button/);
  assert.match(page, /action-cluster__primary/);
  assert.match(page, /SAIR DA PARTIDA/);
  assert.match(styles, /\.action-cluster__primary/);
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
  for (const asset of ["riftbomb-loader", "match-continuity", "online-duel"]) {
    assert.match(
      headers,
      new RegExp(`/${asset}-\\*\\.js\\s+Cache-Control: public, max-age=31556952, immutable`),
    );
  }
  assert.match(
    headers,
    /\/arena-textures\/\*\s+Cache-Control: public, max-age=31556952, immutable/,
  );
  assert.match(
    headers,
    /\/champion-models\/\*\s+Cache-Control: public, max-age=31556952, immutable/,
  );
  assert.match(
    headers,
    /\/champion-sfx\/\*\s+Cache-Control: public, max-age=31556952, immutable/,
  );
  assert.doesNotMatch(headers, /Content-Encoding:/);
  assert.match(
    headers,
    /\/client\/champions\/avatars\/\*\s+Cache-Control: public, max-age=31556952, immutable/,
  );
  assert.match(loader, /manifest\.partsPath !== `\/riftbomb-parts\/\$\{manifest\.sha256\}`/);
  assert.match(loader, /fetch\(`\$\{manifest\.partsPath\}\/part-\$\{name\}/);
  assert.doesNotMatch(headers, /^\/riftbomb\.html|^\/riftbomb-loader\.js/m);
});

test("code-splits champion SFX banks from the critical online part", async () => {
  const { directory, names } = await readPackagedGameParts();
  const game = (await Promise.all(
    names.map((name) => readFile(new URL(name, directory), "utf8")),
  )).join("");

  assert.match(game, /CHAMPION_SFX_SPLIT_V1/);
  assert.doesNotMatch(game, /RIFTBOMB_CHAMPION_SFX_SOURCES/);
  const manifestMatch = game.match(
    /const RIFTBOMB_CHAMPION_SFX_BANK_MANIFEST = Object\.freeze\((\{.*?\})\);/s,
  );
  assert.ok(manifestMatch, "the online part must publish a lazy champion SFX URL map");
  const sources = JSON.parse(manifestMatch[1]);
  assert.deepEqual(Object.keys(sources), ["katarina"]);

  for (const [champion, url] of Object.entries(sources)) {
    assert.match(url, new RegExp(`^/champion-sfx/${champion}-[a-f0-9]{64}\\.js$`));
    const published = await readFile(new URL(`public${url}`, root));
    const fingerprint = url.match(/-([a-f0-9]{64})\.js$/)?.[1];
    assert.equal(createHash("sha256").update(published).digest("hex"), fingerprint);
    const source = await readFile(
      new URL(`../champions/${champion}/sfx/riftbomb-sfx-bank.js`, root),
    );
    assert.deepEqual(published, source);
    const bank = published.toString("utf8");
    new vm.Script(bank, { filename: url });
    assert.match(bank, /RIFTBOMB_CHAMPION_SFX_BANKS/);
    assert.match(bank, new RegExp(`\\[\\"${champion}\\"\\]`));
  }
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
  const arenaSourceMatch = game.match(
    /const ARENA_TEXTURE_SOURCE = Object\.freeze\((\{.*?\})\);/s,
  );
  assert.ok(arenaSourceMatch, "the online part must publish an arena texture URL map");
  const arenaSources = JSON.parse(arenaSourceMatch[1]);
  assert.equal(Object.keys(arenaSources).length, 19);
  assert.doesNotMatch(game, /nacreScene|nacre-hollow-scene\.webp/);

  const textures = [
    ["crateSide", "game/arena-appearance/textures/crates/crate-albedo.webp"],
    ["crateTop", "game/arena-appearance/textures/crates/crate-top-albedo.webp"],
    [
      "floorLattice",
      "game/arena-appearance/textures/ground/floor-salt-lens-combat-band-6ffb0854.webp",
    ],
    ["floorClearing", "game/arena-appearance/textures/ground/floor-clearing-v3.webp"],
    ["nacreGrowth", "game/arena-appearance/textures/props/nacre-growth-albedo.webp"],
    ["nacreReef", "game/arena-appearance/textures/props/nacre-reef-albedo.webp"],
    ["floorLabyrinth", "game/arena-appearance/textures/ground/floor-labyrinth.webp"],
    ["floorForts", "game/arena-appearance/textures/ground/floor-forts.webp"],
    [
      "floorPit",
      "game/arena-appearance/textures/ground/floor-storm-eye-combat-field-99509f91.webp",
    ],
    ["wallLattice", "game/arena-appearance/textures/walls/wall-lattice.webp"],
    ["wallClearing", "game/arena-appearance/textures/walls/wall-clearing.webp"],
    ["wallLabyrinth", "game/arena-appearance/textures/walls/wall-labyrinth.webp"],
    ["wallForts", "game/arena-appearance/textures/walls/wall-forts.webp"],
    ["wallPit", "game/arena-appearance/textures/walls/wall-pit.webp"],
    ["wallTopLattice", "game/arena-appearance/textures/walls/wall-top-lattice.webp"],
    ["wallTopClearing", "game/arena-appearance/textures/walls/wall-top-clearing.webp"],
    ["wallTopLabyrinth", "game/arena-appearance/textures/walls/wall-top-labyrinth.webp"],
    ["wallTopForts", "game/arena-appearance/textures/walls/wall-top-forts.webp"],
    ["wallTopPit", "game/arena-appearance/textures/walls/wall-top-pit.webp"],
  ];
  assert.equal(textures.length, 19, "the online build must publish only the modular arena materials");
  const arenaUrls = game.match(/\/arena-textures\/[^"]+\.webp/g) || [];
  assert.equal(arenaUrls.length, textures.length);
  assert.equal(new Set(arenaUrls).size, textures.length, "every arena slot must own one URL");
  for (const [key, sourceName] of textures) {
    const outputUrl = arenaSources[key];
    assert.match(outputUrl, /^\/arena-textures\/[^/]+-[a-f0-9]{64}\.webp$/);
    const outputName = outputUrl.split("/").at(-1);
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

  // PARTICLES_ONLY_V1: legacy frame plates stay in the editable/offline
  // bundle, but must not inflate the critical online part.
  assert.doesNotMatch(game, /const RIFTBOMB_EXPLOSION_FRAME_SOURCES =/);
  assert.doesNotMatch(game, /const RIFTBOMB_EXPLOSION_FRAMES = Object\.freeze/);
  // The trained V1 pilot ships as a separate optional asset: the solo CPU
  // loads it on demand and falls back to the baseline if it is missing.
  assert.doesNotMatch(game, /<script src="\/bot-v1\.js"><\/script>/);
  assert.doesNotMatch(game, /RIFTBOMB_BOTS\.createV1Policy = createV1Policy/);
  const botV1 = await readFile(new URL("public/bot-v1.js", root), "utf8");
  assert.match(botV1, /RIFTBOMB_BOTS\.createV1Policy = createV1Policy/);
  assert.match(botV1, /RIFTBOMB_BOTS\.createRenektonPilot = createRenektonPilot/);
  assert.doesNotMatch(game, /const PLAYABLE_CHAMPIONS = Object\.freeze\(\{/);
  assert.match(game, /window\.RIFTBOMB_PLAYABLE_CHAMPIONS = Object\.create\(null\)/);
  assert.match(game, /ensureChampionModels/);
  assert.match(game, /initialiseKatarinaDagger\(packed\)/);
  const katarinaInitialisation = game.slice(
    game.indexOf("initialiseChampionModel(champion)"),
    game.indexOf("ensureChampionModel(champion)")
  );
  assert.ok(
    katarinaInitialisation.indexOf('if (champion === "katarina") this.initialiseKatarinaDagger(packed)') <
      katarinaInitialisation.indexOf('if (packed.animation?.runtime === "vat-v1")'),
    "the asynchronously loaded Katarina payload must initialise her authored dagger before model setup"
  );
  assert.equal(
    (game.match(/\/champion-models\/[^"]+\.js/g) || []).length,
    champions.length,
  );

  const championSourceMatch = game.match(
    /const PLAYABLE_CHAMPION_MODEL_SOURCES = Object\.freeze\((\{.*?\})\);/s,
  );
  assert.ok(championSourceMatch, "the online part must publish a champion model URL map");
  const championSources = JSON.parse(championSourceMatch[1]);
  assert.deepEqual(Object.keys(championSources).sort(), [...champions].sort());

  let expectedModelBytes = 0;
  let publishedModelBytes = 0;

  function assertAssetFingerprint(url, bytes) {
    const name = url.split("/").at(-1);
    const match = name.match(/-([a-f0-9]{64})\.[^.]+$/);
    assert.ok(match, `${url} must carry a SHA-256 fingerprint`);
    assert.equal(
      match[1],
      createHash("sha256").update(bytes).digest("hex"),
      `${url} fingerprint must cover the bytes served over the wire`,
    );
  }

  for (const champion of champions) {
    const scriptUrl = championSources[champion];
    assert.match(scriptUrl, new RegExp(`^/champion-models/${champion}-[a-f0-9]{64}\\.js$`));
    const publishedScript = await readFile(
      new URL(`public${scriptUrl}`, root),
    );
    assertAssetFingerprint(scriptUrl, publishedScript);
    const script = publishedScript.toString("utf8");
    new vm.Script(script, { filename: scriptUrl });
    expectedModelBytes += Buffer.byteLength(script);
    publishedModelBytes += publishedScript.byteLength;
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
    if (champion === "katarina") {
      assert.match(payload.dagger, /^[A-Za-z0-9+/=]+$/);
      const daggerBytes = Buffer.from(payload.dagger, "base64");
      const dagger = new Float32Array(
        daggerBytes.buffer,
        daggerBytes.byteOffset,
        daggerBytes.byteLength / Float32Array.BYTES_PER_ELEMENT,
      );
      const bounds = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
      for (let index = 0; index < dagger.length; index += 6) {
        for (let axis = 0; axis < 3; axis += 1) {
          bounds[0][axis] = Math.min(bounds[0][axis], dagger[index + axis]);
          bounds[1][axis] = Math.max(bounds[1][axis], dagger[index + axis]);
        }
      }
      const width = bounds[1][0] - bounds[0][0];
      const depth = bounds[1][2] - bounds[0][2];
      assert.ok(width > depth * 1.5, "online dagger must retain its broad curved face");
      assert.deepEqual(
        Object.keys(payload.daggerParts),
        ["pommel", "grip", "guard", "blade"],
      );
      assert.equal(payload.daggerParts.pommel.first, 0);
      assert.equal(
        Object.values(payload.daggerParts).reduce((count, part) => count + part.count, 0),
        dagger.length / 6,
      );
      assert.ok(
        payload.daggerPresentation.readyScale >= 0.9 &&
          payload.daggerPresentation.readyScale <= 1,
        "online ready dagger scale must remain readable without exceeding one gameplay cell",
      );
      assert.ok(payload.daggerPresentation.readyHeadingSwing <= 0.15);
      assert.ok(
        payload.daggerPresentation.readyHeight >= 0.3 &&
          payload.daggerPresentation.readyHeight <= 0.4,
        "online ready dagger height must stay grounded near its pickup base",
      );
      assert.ok(
        payload.daggerPresentation.readyHover >= 0.015 &&
          payload.daggerPresentation.readyHover <= 0.04,
        "online ready dagger hover must remain subtle",
      );
    } else {
      assert.equal(payload.dagger, undefined);
      assert.equal(payload.daggerParts, undefined);
      assert.equal(payload.daggerPresentation, undefined);
    }
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
      assert.match(
        payload.framesUrl,
        new RegExp(`^/champion-models/${champion}-frames-[a-f0-9]{64}\\.bin$`),
      );
      assert.match(
        payload.normalsUrl,
        new RegExp(`^/champion-models/${champion}-normals-[a-f0-9]{64}\\.bin$`),
      );
      const publishedFrames = await readFile(
        new URL(`public${payload.framesUrl}`, root),
      );
      const publishedNormals = await readFile(
        new URL(`public${payload.normalsUrl}`, root),
      );
      assertAssetFingerprint(payload.framesUrl, publishedFrames);
      assertAssetFingerprint(payload.normalsUrl, publishedNormals);
      publishedModelBytes += publishedFrames.byteLength + publishedNormals.byteLength;
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
      const expectedFrames = compactRgb(frames, Uint16Array.BYTES_PER_ELEMENT);
      const expectedNormals = compactRgb(normals, Uint8Array.BYTES_PER_ELEMENT);
      expectedModelBytes += expectedFrames.byteLength + expectedNormals.byteLength;
      assert.deepEqual(publishedFrames, expectedFrames);
      assert.deepEqual(publishedNormals, expectedNormals);
      assert.equal(publishedFrames.byteLength, frames.byteLength * 3 / 4);
      assert.equal(publishedNormals.byteLength, normals.byteLength * 3 / 4);
      assert.ok(script.length < 25 * 1024 * 1024, `${champion}.js must stay under Workers asset limit`);
      assert.ok(publishedFrames.byteLength < 25 * 1024 * 1024);
      assert.ok(publishedNormals.byteLength < 25 * 1024 * 1024);
      assert.equal(payload.animation.runtime, "vat-v1");
      assert.equal(payload.animation.componentsPerTexel, 3);
      assert.equal(payload.animation.frameCount, metadata.frameCount);
      assert.ok(payload.animation.actions, `${champion} must ship animation.actions`);
      assert.deepEqual(payload.animation.actions, metadata.animationActions);
      assert.ok(payload.animation.clips, `${champion} must ship animation.clips`);
    }
  }
  assert.equal(publishedModelBytes, expectedModelBytes);
});

test("loads the optional V1 bot once for CPU training and preserves fallback", async () => {
  const duel = await readFile(new URL("public/online-duel.js", root), "utf8");
  const loaderStart = duel.indexOf("  function ensureV1BotBundle");
  const loaderEnd = duel.indexOf("\n  function defaultAuthoritativeServerUrl", loaderStart);
  assert.ok(loaderStart >= 0 && loaderEnd > loaderStart, "V1 loader must have a stable boundary");
  const loader = duel.slice(loaderStart, loaderEnd);
  const makeLoader = new Function("document", "RIFTBOMB_BOTS", `
    let v1BotBundlePromise = null;
    const V1_BOT_BUNDLE_URL = "/bot-v1.js";
    ${loader}
    return ensureV1BotBundle;
  `);

  const bots = {};
  const requests = [];
  let appendedScript;
  const document = {
    createElement(type) {
      assert.equal(type, "script");
      return {};
    },
    head: {
      append(script) {
        appendedScript = script;
        requests.push(script.src);
        bots.createV1Policy = () => {};
        script.onload();
      },
    },
  };
  const ensure = makeLoader(document, bots);
  const first = ensure();
  const second = ensure();
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.deepEqual(requests, ["/bot-v1.js"]);
  assert.equal(appendedScript.async, true);

  const failed = makeLoader({
    createElement() { return {}; },
    head: { append(script) { script.onerror(); } },
  }, {});
  assert.equal(await failed(), false, "missing V1 asset must signal baseline fallback");

  const offlineStart = duel.indexOf("async function startOfflineFromClient");
  const offlineEnd = duel.indexOf("\n  async function handleClientCommand", offlineStart);
  assert.ok(offlineStart >= 0 && offlineEnd > offlineStart, "offline flow must have a stable boundary");
  const offline = duel.slice(offlineStart, offlineEnd);
  assert.match(offline, /await ensureV1BotBundle\(\)/);
  assert.ok(
    offline.indexOf('if (payload.mode === "local")') < offline.indexOf("await ensureV1BotBundle()"),
    "local multiplayer must not load the CPU-only bundle",
  );
});

test("ships server-authoritative room and snapshot behavior", async () => {
  const [client, continuity] = await Promise.all([
    readFile(new URL("public/online-duel.js", root), "utf8"),
    readFile(new URL("public/match-continuity.js", root), "utf8"),
  ]);
  const server = await readFile(new URL("server/src/server.mjs", root), "utf8");
  const rooms = await readFile(new URL("server/src/authoritative-rooms.mjs", root), "utf8");
  const worker = await readFile(new URL("worker/index.ts", root), "utf8");
  const adapter = await readFile(new URL("..\/game\/create-authoritative-duel.mjs", root), "utf8");
  assert.match(client, /AUTHORITATIVE_SERVER_URL/);
  assert.match(client, /connectAuthoritative/);
  assert.match(continuity, /new WebSocket/);
  assert.match(client, /action: "create"/);
  assert.match(client, /state\.role === "guest"/);
  assert.match(client, /game\.p2Human = false/);
  assert.match(client, /ensureChampionModels\(\[state\.hostChampion, state\.guestChampion\]\)/);
  assert.match(client, /bindLocalOnlineView\(\)/);
  assert.match(client, /localOnlinePlayerId\(\)/);
  assert.match(client, /const abilityKeys = \{ KeyQ: 0, KeyF: 1, KeyE: 2, KeyR: 3 \}/);
  assert.match(client, /guestAction\("ability", abilityKeys\[event\.code\]\)/);
  assert.match(client, /action === "create-challenge"/);
  assert.doesNotMatch(client, /CREATE CHALLENGE LINK/);
  assert.match(client, /type: "quick-match"/);
  assert.match(client, /function startQuickMatch/);
  assert.match(server, /authoritativeRooms\.acceptConnection/);
  assert.match(rooms, /quickMatchQueue/);
  assert.match(client, /INVITE_MATCH_TARGET = 10/);
  assert.match(client, /url\.searchParams\.set\("p1", state\.hostChampion\)/);
  assert.match(client, /url\.searchParams\.set\("p2", state\.guestChampion\)/);
  assert.match(client, /setTimeout\(\(\) => joinRoom\(parentRoom\.toUpperCase\(\)/);
  assert.match(client, /function startOnlineMatch/);
  assert.match(client, /type === "rematch"/);
  assert.match(client, /shareReady/);
  assert.match(client, /matchTarget: state\.matchTarget/);
  assert.match(client, /function smoothRemoteMovement/);
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
  assert.match(continuity, /type: "pong"/);
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
  assert.match(route, /validatePostAction\(body\)/);
  assert.match(route, /createPersistedRoom\(db/);

  const postStart = route.indexOf("export async function POST");
  const postEnd = route.indexOf("export async function GET");
  const post = route.slice(postStart, postEnd);
  assert.ok(
    post.indexOf("validatePostAction(body)") < post.indexOf("await ensureSchema(db)"),
    "POST must reject invalid bodies before schema setup",
  );

  const get = route.slice(postEnd);
  assert.ok(
    get.indexOf("if (!validCode(code))") < get.indexOf("await ensureSchema(db)"),
    "GET must reject invalid codes before schema setup",
  );

  const client = await readFile(new URL("public/online-duel.js", root), "utf8");
  const joinStart = client.indexOf("async function joinRoom");
  const joinEnd = client.indexOf("  function failConnection", joinStart);
  const join = client.slice(joinStart, joinEnd);
  assert.match(join, /await connectAuthoritative\("guest"\)/);
  assert.doesNotMatch(
    join,
    /signaling\(\"GET\"/,
    "guest join must not add a sequential D1 preflight before the authoritative hello",
  );
  const failureStart = client.indexOf("function failConnection");
  const failureEnd = client.indexOf("  function resetConnection", failureStart);
  const failure = client.slice(failureStart, failureEnd);
  assert.match(failure, /\[\"room_full\", \"role_taken\"\]\.includes/);
});
