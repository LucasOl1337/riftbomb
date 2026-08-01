import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  INITIAL_RUNTIME_STATE,
  runtimeStateEquals,
} from "../app/riftbomb-client.ts";

const root = new URL("../", import.meta.url);

test("deduplicates unchanged runtime snapshots before React state updates", () => {
  const snapshot = {
    ...INITIAL_RUNTIME_STATE,
    phase: "lobby",
    role: "host",
    roomCode: "ABC234",
    connected: true,
    rivalConnected: true,
    guestReady: true,
    inviteMode: true,
    inviteUrl: "https://example.test/?room=ABC234",
    busy: false,
    hostChampion: "zed",
    guestChampion: "renekton",
    arena: "pit",
    matchTarget: 10,
    status: "Ready",
    tone: "ok",
  };

  assert.equal(runtimeStateEquals(null, snapshot), false);
  assert.equal(runtimeStateEquals(snapshot, snapshot), true);
  assert.equal(runtimeStateEquals({ ...snapshot }, snapshot), true);

  for (const field of Object.keys(snapshot)) {
    const value = snapshot[field];
    const changed = {
      ...snapshot,
      [field]:
        typeof value === "boolean"
          ? !value
          : typeof value === "number"
            ? value + 1
            : `${value}-changed`,
    };
    assert.equal(runtimeStateEquals(changed, snapshot), false, field);
  }
});

test("ships a real client shell with one canonical game runtime", async () => {
  const [page, styles, data] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/war-table.css", root), "utf8"),
    readFile(new URL("app/riftbomb-client.ts", root), "utf8"),
  ]);

  for (const mode of ["quick", "friend", "solo"]) {
    assert.match(data, new RegExp(`id: "${mode}"`));
  }
  for (const retired of ["online", "local", "challenge", "join"]) {
    assert.doesNotMatch(data, new RegExp(`id: "${retired}"`));
  }
  assert.match(page, /\/riftbomb\.html\?client=1/);
  assert.doesNotMatch(page, /LegacyClient|\/\?legacy=1/);
  assert.match(page, /quick-match/);
  assert.match(page, /cancel-quick-match/);
  assert.match(page, /create-challenge/);
  assert.match(page, /start-offline/);
  assert.doesNotMatch(page, /create-room|join-room|CÓDIGO DA SALA|ROOM_CODE_PATTERN/);
  assert.match(styles, /\.war-workspace/);
  assert.match(styles, /\.war-dossier/);
  assert.match(styles, /\.rotate-gate/);
});

test("keeps the approved War Table readable without a fixed bottom rail", async () => {
  const [page, styles, data] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/war-table.css", root), "utf8"),
    readFile(new URL("app/riftbomb-client.ts", root), "utf8"),
  ]);

  assert.match(data, /Configure uma melhor de 10 e envie um link que abre o duelo direto\./);
  assert.match(page, /O pareamento define o segundo jogador/);
  assert.doesNotMatch(page, /client-sticky-cta|base azul|base vermelha/i);
  assert.match(styles, /\.war-topbar \{[\s\S]*?position: sticky;[\s\S]*?top: 0;/);
  assert.match(styles, /height: clamp\(292px, calc\(100dvh - 376px\), 610px\);/);
  assert.match(styles, /@media \(max-width: 860px\)[\s\S]*?\.war-workspace \{[\s\S]*?grid-template-columns: 1fr;/);
});

test("keeps the consolidated Bot V1 profile visible across setup widths", async () => {
  const [page, styles, data] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/war-table.css", root), "utf8"),
    readFile(new URL("app/riftbomb-client.ts", root), "utf8"),
  ]);

  assert.match(page, /activeMode === "solo" \? \([\s\S]*?training-bot-card/);
  assert.match(page, /training-bot-card__metrics/);
  assert.match(page, /<dt>NÍVEL<\/dt>/);
  assert.match(page, /<dt>PLACAR<\/dt>/);
  assert.match(page, /<dt>BOMBA 1<\/dt>/);
  assert.match(data, /intelligence: "4\/5 · Tático adaptativo"/);
  assert.match(data, /description: "Abre rotas, lê hábitos/);
  assert.match(styles, /\.training-bot-card__metrics \{[\s\S]*?grid-template-columns: repeat\(3, 1fr\);/);
});

test("makes the default Quick Match call to action immediate and specific", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");

  assert.match(page, /if \(activeMode === "quick"\) return "ENTRAR NA FILA"/);
  assert.match(page, /sendCommand\("quick-match", \{ champion, arena \}\)/);
  assert.match(page, /Aguardando rival/);
  assert.doesNotMatch(page, /if \(activeMode === "quick"\) return "BUSCAR PARTIDA"/);
});

test("gives the primary call to action tactile and keyboard feedback", async () => {
  const styles = await readFile(new URL("app/war-table.css", root), "utf8");

  assert.match(
    styles,
    /\.action-cluster__primary:focus-visible\s*\{[\s\S]*?outline: 3px solid #fff;[\s\S]*?outline-offset: -6px;/,
  );
  assert.match(
    styles,
    /\.action-cluster__primary:active:not\(:disabled\)\s*\{[\s\S]*?transform: translateY\(1px\) scale\(0\.985\);/,
  );
});

test("keeps the runtime authoritative behind a same-origin message bridge", async () => {
  const [page, runtime] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("public/online-duel.js", root), "utf8"),
  ]);

  assert.doesNotMatch(page, /new WebSocket|RTCPeerConnection/);
  assert.doesNotMatch(page, /fetch\([^)]*\/api\/pvp/);
  assert.match(page, /target\.postMessage\(message, window\.location\.origin\)/);
  assert.match(runtime, /event\.source !== window\.parent/);
  assert.match(runtime, /event\.origin !== window\.location\.origin/);
  assert.match(runtime, /source: RUNTIME_SOURCE/);
  assert.match(runtime, /function clientStateSnapshot/);
  assert.match(runtime, /await createRoom\(\)/);
  assert.match(runtime, /await startQuickMatch/);
  assert.match(runtime, /await joinRoom\(code/);
  assert.match(runtime, /await startOfflineFromClient/);
  assert.match(runtime, /await startHostOnlineMatch/);
});

test("includes one native Riftbomb artwork per playable arena", async () => {
  const arenaNames = [
    "lattice.webp",
    "clearing.webp",
    "labyrinth.webp",
    "forts-key-art-v2.webp",
    "pit-key-art-v2.webp",
  ];
  const championNames = [
    "katarina.webp",
    "zed-war-table-v1.webp",
    "renekton-war-table-v1.webp",
    "vladimir-war-table-v1.webp",
    "gangplank-war-table-v1.webp",
  ];

  for (const name of arenaNames) {
    const image = await readFile(new URL(`public/client/arenas/${name}`, root));
    assert.equal(image.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(image.subarray(8, 12).toString("ascii"), "WEBP");
    assert.ok(image.byteLength > 100_000);
  }

  const client = await readFile(new URL("app/riftbomb-client.ts", root), "utf8");
  for (const name of arenaNames) {
    assert.match(client, new RegExp(`hero: "/client/arenas/${name}"`));
  }
  assert.equal(
    new Set(client.match(/hero: "\/client\/arenas\/[^\"]+"/g)).size,
    arenaNames.length,
  );
  for (const name of championNames) {
    const image = await readFile(
      new URL(`public/client/champions/${name}`, root),
    );
    assert.equal(image.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(image.subarray(8, 12).toString("ascii"), "WEBP");
  }
});

test("ships iPhone safe-area, installed fullscreen, and rotation fallback metadata", async () => {
  const [layout, manifest, page, styles, runtime, gameStyles] = await Promise.all([
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/manifest.ts", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/war-table.css", root), "utf8"),
    readFile(new URL("../game/start-champion-duel.js", root), "utf8"),
    readFile(new URL("../game/show-champion-duel.css", root), "utf8"),
  ]);

  assert.match(layout, /viewportFit:\s*"cover"/);
  assert.match(layout, /viewport-fit=cover/);
  assert.match(layout, /appleWebApp/);
  assert.match(layout, /statusBarStyle:\s*"black-translucent"/);
  assert.match(manifest, /display:\s*"fullscreen"/);
  assert.match(manifest, /orientation:\s*"landscape"/);
  assert.match(page, /Adicionar à Tela de Início/);
  assert.match(page, /fullscreenUnavailable/);
  assert.match(page, /<\/section>\s*<div\s+className="rotate-gate"/);
  assert.match(styles, /env\(safe-area-inset-top\)/);
  assert.match(styles, /button:focus-visible/);
  assert.match(styles, /@media \(max-width: 640px\)/);
  assert.match(styles, /\.is-match-live \.rotate-gate/);
  assert.match(gameStyles, /html\.is-match-active \.guide-button/);
  assert.match(runtime, /window\.self !== window\.top/);
});
