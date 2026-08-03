import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { brotliDecompressSync } from "node:zlib";
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

  assert.match(data, /Gere um link de melhor de 10 e mande para o amigo entrar direto\./);
  assert.match(page, /A busca em São Paulo preenche o segundo lugar\./);
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

test("sells each mode with commercial consequence microcopy", async () => {
  const data = await readFile(new URL("app/riftbomb-client.ts", root), "utf8");

  assert.match(data, /id: "quick"[\s\S]*?eyebrow: "RIVAL ONLINE"/);
  assert.match(data, /Rival em São Paulo\. Melhor de 3, sem criar sala\./);
  assert.match(data, /Gere um link de melhor de 10 e mande para o amigo entrar direto\./);
  assert.match(data, /Pratique contra Dominus-01 \(V1 Renekton\) no navegador, sem fila\./);
  assert.doesNotMatch(data, /Encontre um rival na região e dispute uma melhor de 3\./);
  assert.doesNotMatch(data, /Configure uma melhor de 10 e envie um link que abre o duelo direto\./);
  assert.doesNotMatch(data, /Treine contra o V1 Renekton certificado como Dominus-01\./);
});

test("makes the default Quick Match call to action immediate and specific", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/war-table.css", root), "utf8"),
  ]);

  assert.match(page, /if \(activeMode === "quick"\) return "JOGAR AGORA"/);
  assert.match(page, /sendCommand\("quick-match", \{ champion, arena \}\)/);
  assert.match(page, /Aguardando rival/);
  assert.match(page, /action-cluster__hint/);
  assert.match(page, /Encontre um rival online sem criar sala\./);
  assert.doesNotMatch(page, /if \(activeMode === "quick"\) return "ENTRAR NA FILA"/);
  assert.doesNotMatch(page, /if \(activeMode === "quick"\) return "BUSCAR PARTIDA"/);
  assert.match(styles, /\.action-cluster__hint\s*\{/);
});

test("distinguishes Quick Match idle waiting from active search", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/war-table.css", root), "utf8"),
  ]);

  assert.ok(page.includes('data-waiting={runtime.matchmaking ? "searching" : projectedRival ? "matched" : "idle"}'));
  assert.ok(page.includes('runtime.matchmaking ? " is-searching" : ""'));
  assert.ok(page.includes('runtime.matchmaking ? "Procurando oponente…" : "Aguardando rival"'));
  assert.ok(page.includes('Fila São Paulo ativa — cancele se mudar de ideia'));
  assert.ok(page.includes('? "BUSCANDO RIVAL"'));
  assert.match(styles, /\.fighter--rival\.is-searching/);
  assert.match(styles, /rival-search-pulse/);
  assert.match(styles, /prefers-reduced-motion: reduce[\s\S]*?\.fighter--rival\.is-searching/);
});

test("distinguishes client notice success from error tone", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/war-table.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /data-tone=\{clientNotice\.tone\}/);
  assert.match(page, /tone: "success"/);
  assert.match(page, /tone: "error"/);
  assert.match(page, /tone: "neutral"/);
  assert.match(styles, /\.client-notice\[data-tone="success"\]/);
  assert.match(styles, /\.client-notice\[data-tone="error"\]/);
  assert.match(styles, /color: var\(--rb-success\)/);
  assert.doesNotMatch(
    styles,
    /\.action-cluster\[data-tone="error"\] \.action-cluster__status small,\s*\.client-notice \{/,
  );
});

test("sells matchmaking status with commercial search language", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");

  assert.match(page, /\? "BUSCANDO RIVAL"/);
  assert.match(page, /runtime\.matchmaking/);
  assert.match(page, /Buscando um rival disponível na região de São Paulo\./);
  assert.doesNotMatch(page, /PAREAMENTO AUTOMÁTICO/);
});

test("sells the theatre rival slot without queue jargon", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");

  assert.match(page, /: "RIVAL EM SP"/);
  assert.match(page, /A busca em São Paulo preenche o segundo lugar\./);
  assert.match(page, /\["BUSCA", "REGIONAL"\]/);
  assert.doesNotMatch(page, /FILA REGIONAL/);
  assert.doesNotMatch(page, /O pareamento define o segundo jogador/);
  assert.doesNotMatch(page, /\["FILA", "AUTOMÁTICA"\]/);
});


test("sells the desktop topbar hero with commercial product hierarchy", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/war-table.css", root), "utf8"),
  ]);

  assert.match(page, /className="war-title-block"/);
  assert.match(page, /BOMBAS · CAMPEÕES · SOBREVIVA/);
  assert.match(page, /id="war-table-title">WAR TABLE</);
  assert.doesNotMatch(page, /MONTAGEM PRÉ-PARTIDA/);
  // Mobile still hides the center topbar; theatre-proof remains the live commercial surface there.
  assert.match(styles, /@media \(max-width: 860px\)[\s\S]*?\.war-title-block \{[\s\S]*?display: none;/);
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

test("ships both online bridge scripts precompressed without changing decoded bytes", async (t) => {
  const [source, loaderSource, headers] = await Promise.all([
    readFile(new URL("public/online-duel.js", root)),
    readFile(new URL("public/online-duel-loader.js", root)),
    readFile(new URL("public/_headers", root), "utf8"),
  ]);
  let compressed;
  let loaderCompressed;
  try {
    [compressed, loaderCompressed] = await Promise.all([
      readFile(new URL("dist/client/online-duel.js", root)),
      readFile(new URL("dist/client/online-duel-loader.js", root)),
    ]);
  } catch (error) {
    if (error?.code === "ENOENT") {
      t.skip("requires the verified online build artifact");
      return;
    }
    throw error;
  }

  assert.match(
    headers,
    /\/online-duel\.js\s+Content-Encoding: br/,
    "the stable runtime URL must declare its production encoding",
  );
  assert.match(
    headers,
    /\/online-duel-loader\.js\s+Content-Encoding: br/,
    "the lazy bridge URL must declare its production encoding",
  );
  assert.ok(compressed.byteLength < source.byteLength);
  assert.deepEqual(brotliDecompressSync(compressed), source);
  assert.ok(loaderCompressed.byteLength < loaderSource.byteLength);
  assert.deepEqual(brotliDecompressSync(loaderCompressed), loaderSource);
});

test("ships cached responsive arena artwork and compact champion portraits", async () => {
  const arenaNames = [
    "lattice.webp",
    "clearing.webp",
    "labyrinth.webp",
    "forts-key-art-v2.webp",
    "pit-key-art-v2.webp",
  ];
  const championPortraits = [
    ["katarina-avatar-dbf4bd7a3da41838e6ebea98a5eff5296451184dc3b071d53e4e9aa186845923.webp", 256, 422],
    ["zed-avatar-1a959b10d054d0aefe1c0046eebd888810d7cab306bc928282312eee101e86ba.webp", 256, 256],
    ["renekton-avatar-f424bf8e43906e3a0d6471acede086d23ad1cd1bfe0c25fbfa0258c36f39ce51.webp", 256, 256],
    ["vladimir-avatar-7c9df2bdc3347435963d6febd028f9a68013d699fa42b580200637e8a642e944.webp", 256, 256],
    ["gangplank-avatar-59ce1e1c7d3174fc807506f81079ade20ea660eaa218aa2aa4b204ad5764e4cf.webp", 256, 256],
  ];
  const arenaWidths = [160, 320, 640, 1024];

  for (const name of arenaNames) {
    const image = await readFile(new URL(`public/client/arenas/${name}`, root));
    assert.equal(image.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(image.subarray(8, 12).toString("ascii"), "WEBP");
    assert.ok(image.byteLength > 100_000);
  }

  const [client, page, headers, responsiveNames, arenaDirectoryNames] = await Promise.all([
    readFile(new URL("app/riftbomb-client.ts", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("public/_headers", root), "utf8"),
    readdir(new URL("public/client/arenas/responsive/", root)),
    readdir(new URL("public/client/arenas/", root)),
  ]);
  for (const legacyAlias of ["forts.webp", "pit.webp"]) {
    assert.equal(
      arenaDirectoryNames.includes(legacyAlias),
      false,
      `${legacyAlias} must not return as an unreferenced duplicate hero asset`,
    );
  }
  assert.match(
    headers,
    /\/client\/arenas\/responsive\/\*\s+Cache-Control: public, max-age=31556952, immutable/,
  );
  assert.match(
    headers,
    /\/client\/champions\/avatars\/\*\s+Cache-Control: public, max-age=31556952, immutable/,
  );
  assert.match(page, /sizes="\(max-width: 640px\) 40px, 48px"/);
  assert.equal(responsiveNames.length, arenaNames.length * arenaWidths.length);
  const responsiveAssets = new Map();
  let responsiveBytes = 0;
  for (const name of responsiveNames) {
    const match = name.match(/^(.+)-(160|320|640|1024)-([a-f0-9]{64})\.webp$/);
    assert.ok(match, `${name} must be a fingerprinted responsive WebP`);
    const [, stem, width, digest] = match;
    const image = await readFile(new URL(`public/client/arenas/responsive/${name}`, root));
    assert.equal(createHash("sha256").update(image).digest("hex"), digest, name);
    responsiveAssets.set(`${stem}-${width}`, { digest, image });
    responsiveBytes += image.byteLength;
  }
  assert.ok(
    responsiveBytes <= 810_000,
    `responsive arena variants exceed the aggregate 810 KB mobile budget: ${responsiveBytes}`,
  );
  for (const name of arenaNames) {
    assert.match(client, new RegExp(`hero: "/client/arenas/${name}"`));
    const stem = name.replace(/\.webp$/, "");
    for (const width of arenaWidths) {
      const asset = responsiveAssets.get(`${stem}-${width}`);
      assert.ok(asset, `${stem}-${width} must have exactly one responsive asset`);
      assert.match(
        client,
        new RegExp(
          `/client/arenas/responsive/${stem}-${width}-${asset.digest}\\.webp ${width}w`,
        ),
        `${name} must expose a content-addressed ${width}w mobile candidate`,
      );
    }
  }
  assert.equal(
    new Set(client.match(/hero: "\/client\/arenas\/[^\"]+"/g)).size,
    arenaNames.length,
  );
  const portraitRefs = [...client.matchAll(/portrait: "(\/client\/champions\/[^"]+)"/g)]
    .map(([, source]) => source);
  assert.deepEqual(
    portraitRefs,
    championPortraits.map(([name]) => `/client/champions/avatars/${name}`),
    "the lobby must point avatar slots at the compact portrait variants",
  );
  for (const source of portraitRefs) {
    assert.match(
      source,
      /^\/client\/champions\/avatars\/[a-z]+-avatar-[a-f0-9]{64}\.webp$/,
      `${source} must be content-addressed for immutable cache`,
    );
  }

  const readWebpDimensions = (image) => {
    const chunk = image.subarray(12, 16).toString("ascii");
    if (chunk === "VP8X") {
      return {
        width: 1 + image[24] + (image[25] << 8) + (image[26] << 16),
        height: 1 + image[27] + (image[28] << 8) + (image[29] << 16),
      };
    }
    if (chunk === "VP8 ") {
      return {
        width: image.readUInt16LE(26) & 0x3fff,
        height: image.readUInt16LE(28) & 0x3fff,
      };
    }
    throw new Error(`Unsupported WebP chunk ${chunk}`);
  };

  for (const name of arenaNames) {
    const stem = name.replace(/\.webp$/, "");
    for (const width of arenaWidths) {
      const asset = responsiveAssets.get(`${stem}-${width}`);
      assert.ok(asset, `${stem}-${width} must have exactly one responsive asset`);
      const image = asset.image;
      assert.equal(image.subarray(0, 4).toString("ascii"), "RIFF");
      assert.equal(image.subarray(8, 12).toString("ascii"), "WEBP");
      assert.deepEqual(
        readWebpDimensions(image),
        { width, height: Math.round(width * 9 / 16) },
      );
      assert.ok(
        image.byteLength <= 150_000,
        `${stem}-${width}.webp exceeds the mobile image budget`,
      );
    }
  }

  for (const [name, width, height] of championPortraits) {
    const image = await readFile(
      new URL(`public/client/champions/avatars/${name}`, root),
    );
    assert.equal(image.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(image.subarray(8, 12).toString("ascii"), "WEBP");
    assert.deepEqual(readWebpDimensions(image), { width, height });
    assert.ok(image.byteLength <= 32_000, `${name} must stay within the avatar budget`);
  }
});

test("keeps responsive arena sources attached to hero and thumbnail consumers", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");

  assert.match(
    page,
    /src=\{selectedArena\.hero\}\s+srcSet=\{selectedArena\.heroSrcSet\}\s+sizes="\(max-width: 640px\) 100vw, \(max-width: 1200px\) 68vw, 50vw"/,
    "the selected hero must keep its responsive source set",
  );
  assert.match(
    page,
    /src=\{item\.hero\}\s+srcSet=\{item\.heroSrcSet\}\s+sizes="\(max-width: 640px\) 40px, 48px"/,
    "arena thumbnails must keep their responsive source set",
  );
});

test("confirms cancel Quick Match with PT-BR success notice", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");

  assert.ok(page.includes("CANCEL_QUEUE_SUCCESS_NOTICE_V1"));
  assert.match(page, /message: "Busca cancelada\. Escolha outro protocolo ou entre na fila de novo\."/);
  const cancelIdx = page.indexOf('sendCommand("cancel-quick-match")');
  assert.notEqual(cancelIdx, -1);
  const cancelSlice = page.slice(cancelIdx, cancelIdx + 700);
  assert.ok(cancelSlice.includes('tone: "success"'));
  assert.ok(cancelSlice.includes("setClientNotice({"));
  assert.ok(cancelSlice.includes("matchmaking: false"));
  // Bridge residual from online-duel must map to PT-BR, not stay as bare EN/PT mix only in status.
  assert.match(page, /quick match cancelado\|cancelled\? quick\|matchmaking cancel\/i\.test\(runtime\.status\)/);
});

test("surfaces fullscreen feedback outside the portrait rotate-gate", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/war-table.css", root), "utf8"),
  ]);

  assert.ok(page.includes("FULLSCREEN_FEEDBACK_V1"));
  assert.ok(page.includes("publishFullscreenFeedback"));
  assert.ok(page.includes("matchPresentationNotice"));
  assert.ok(page.includes('data-match-presentation-notice="1"'));
  assert.ok(page.includes('className="match-presentation-notice"'));
  // One helper must fan out to rotate-gate copy, War Table notice, and mid-match banner.
  const helperIdx = page.indexOf("function publishFullscreenFeedback");
  assert.notEqual(helperIdx, -1);
  const helperSlice = page.slice(helperIdx, helperIdx + 420);
  assert.ok(helperSlice.includes("setPresentationNotice(message)"));
  assert.ok(helperSlice.includes("setClientNotice({ message, tone })"));
  assert.ok(helperSlice.includes("setMatchPresentationNotice({ message, tone })"));
  // Success path stays PT-BR and tone-aware (not silent).
  assert.match(page, /publishFullscreenFeedback\(\s*"Tela cheia horizontal ativada\.",\s*"success"\s*\)/);
  assert.match(styles, /FULLSCREEN_FEEDBACK_V1/);
  assert.match(
    styles,
    /\.match-presentation-notice\[data-tone="success"\]\s*\{[\s\S]*?color:\s*var\(--rb-success\);/,
  );
  assert.match(
    styles,
    /\.match-presentation-notice\[data-tone="error"\]\s*\{[\s\S]*?color:\s*var\(--rb-danger\);/,
  );
});

test("confirms leave lobby/match with PT-BR success notice", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");

  assert.ok(page.includes("LEAVE_SUCCESS_NOTICE_V1"));
  assert.match(page, /message: "Você saiu da sala\. Escolha um protocolo para jogar de novo\."/);
  assert.match(page, /message: "Você saiu da partida\. Monte outra formação quando quiser\."/);
  // Success tone reuses existing client-notice rails — not silent null.
  const lobbyIdx = page.indexOf("sendCommand(\"leave-lobby\")");
  const matchIdx = page.indexOf("sendCommand(\"leave-match\")");
  assert.notEqual(lobbyIdx, -1);
  assert.notEqual(matchIdx, -1);
  const lobbySlice = page.slice(lobbyIdx, lobbyIdx + 700);
  const matchSlice = page.slice(matchIdx, matchIdx + 700);
  assert.ok(lobbySlice.includes('tone: "success"'));
  assert.ok(matchSlice.includes('tone: "success"'));
  assert.ok(lobbySlice.includes("setClientNotice({"));
  assert.ok(matchSlice.includes("setClientNotice({"));
  // Do not leave English optimistic leave status as the only signal.
  assert.doesNotMatch(page, /status: "Left the online lobby\."/);
  assert.doesNotMatch(page, /status: "You left the match\."/);
  assert.match(page, /left the online lobby\/i\.test\(runtime\.status\)/);
  assert.match(page, /you left the match\|left the match\/i\.test\(runtime\.status\)/);
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
  assert.match(page, /className="rotate-gate"/);
  assert.match(page, /ref=\{rotateGateRef\}/);
  assert.match(styles, /env\(safe-area-inset-top\)/);
  assert.match(styles, /button:focus-visible/);
  assert.match(styles, /@media \(max-width: 640px\)/);
  assert.match(styles, /\.is-match-live \.rotate-gate/);
  assert.match(gameStyles, /html\.is-match-active \.guide-button/);
  assert.match(runtime, /window\.self !== window\.top/);
});
