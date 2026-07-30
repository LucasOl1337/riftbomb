import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships a real client shell while keeping the classic runtime reversible", async () => {
  const [page, styles, data] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/riftbomb-client.ts", root), "utf8"),
  ]);

  for (const mode of ["quick", "online", "solo", "local", "challenge", "join"]) {
    assert.match(data, new RegExp(`id: "${mode}"`));
  }
  assert.match(page, /\/riftbomb\.html\?client=1/);
  assert.match(page, /\/\?legacy=1/);
  assert.match(page, /create-room/);
  assert.match(page, /quick-match/);
  assert.match(page, /cancel-quick-match/);
  assert.match(page, /create-challenge/);
  assert.match(page, /join-room/);
  assert.match(page, /start-offline/);
  assert.match(styles, /\.client-layout/);
  assert.match(styles, /\.party-rail/);
  assert.match(styles, /\.rotate-gate/);
});

test("keeps the selected mode promise visible on portrait phones", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  assert.match(page, /PVP EM TEMPO REAL · SÃO PAULO · SEM DOWNLOAD/);
  assert.match(
    styles,
    /@media \(max-width: 780px\) and \(orientation: portrait\)[\s\S]*?\.client-hero-copy \{[\s\S]*?display: grid;[\s\S]*?\.client-server-tag \{[\s\S]*?display: inline-flex;/,
  );
  assert.match(
    styles,
    /@media \(max-width: 780px\) and \(orientation: portrait\)[\s\S]*?\.match-config \{[\s\S]*?top: 6\.4rem;/,
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

test("includes native Riftbomb arena and Champion artwork for the shell", async () => {
  const arenaNames = ["lattice.webp", "clearing.webp", "labyrinth.webp"];
  const championNames = [
    "katarina.webp",
    "zed.webp",
    "renekton.webp",
    "vladimir.webp",
    "gangplank.webp",
  ];

  for (const name of arenaNames) {
    const image = await readFile(new URL(`public/client/arenas/${name}`, root));
    assert.equal(image.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(image.subarray(8, 12).toString("ascii"), "WEBP");
    assert.ok(image.byteLength > 100_000);
  }
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
    readFile(new URL("app/globals.css", root), "utf8"),
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
  assert.match(styles, /\.rotate-gate__action:focus-visible/);
  assert.match(styles, /Portrait setup stays usable/);
  assert.match(styles, /\.is-match-live \.rotate-gate/);
  assert.match(gameStyles, /html\.is-match-active \.guide-button/);
  assert.match(runtime, /window\.self !== window\.top/);
});
