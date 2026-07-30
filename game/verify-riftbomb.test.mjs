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

test("the readable combat layer preserves the canonical 100 HP rules", async () => {
  const document = await readFile(sourcePath, "utf8");
  const rules = await readFile(path.join(gameDirectory, "apply-combat-rules.js"), "utf8");
  const presentation = await readFile(path.join(gameDirectory, "apply-readable-combat.js"), "utf8");

  assert.match(document, /script src="\.\/apply-combat-rules\.js"/);
  assert.match(document, /script src="\.\/apply-readable-combat\.js"/);
  assert.ok(
    document.indexOf("./apply-combat-rules.js") < document.indexOf("./apply-readable-combat.js"),
    "pure combat rules must load before their browser presentation adapter"
  );
  assert.match(rules, /maxHealth: 100/);
  assert.match(rules, /arenaBombDamage: 35/);
  assert.match(rules, /globalThis\.RIFTBOMB_COMBAT = RIFTBOMB_COMBAT/);
  assert.match(rules, /globalThis\.installRiftbombCombatRules = installRiftbombCombatRules/);
  assert.match(rules, /match\.hitContestant = function hitContestantWithDamage/);
  assert.match(rules, /storedBefore \+ legacyDamage \* 0\.48/);
  assert.match(presentation, /installRiftbombCombatRules\(match\)/);
  assert.match(presentation, /combat-hp-readout/);
});

test("abilities share a bounded simulation-time buffer and interrupt Death Lotus", async () => {
  const rules = await readFile(path.join(gameDirectory, "run-champion-bomb-duel.js"), "utf8");
  const online = await readFile(path.join(repositoryRoot, "online", "public", "online-duel.js"), "utf8");
  const contract = await readFile(path.join(gameDirectory, "combat-system.md"), "utf8");

  assert.match(rules, /const ABILITY_BUFFER_SECONDS = 0\.15/);
  assert.match(rules, /const ABILITY_TIME_EPSILON = 0\.000001/);
  assert.match(rules, /this\.abilityBuffer = new Map\(\)/);
  assert.match(rules, /playerId: player\.id/);
  assert.match(rules, /remaining: ABILITY_BUFFER_SECONDS/);
  assert.match(rules, /processAbilityBuffer\(dt\)/);
  assert.match(rules, /this\.updateGangplank\(dt\);\s*this\.processAbilityBuffer\(dt\);/);
  assert.match(rules, /if \(this\.executeAbility\(command\.slot, player\)\)/);
  assert.match(rules, /this\.cancelKatarinaChannel\(player, "movement"\)/);
  assert.match(rules, /slash\.ownerId !== player\.id/);
  assert.match(rules, /initialBlockers\.includes\("stun"\)/);
  assert.match(rules, /abilityTargetAvailable\(player, slot\)/);
  assert.match(rules, /this\.gangplankKegPlacement\(player\)/);
  assert.match(online, /offlineCastAbility\(slot, actor, \{ buffer: false \}\)/);
  assert.match(online, /player\.ultChannel > 0\) game\.cancelKatarinaChannel\?\.\(player, "movement"\)/);
  assert.match(contract, /final \*\*150 ms\*\*/);
  assert.match(contract, /cannot acquire a target, free landing or deployable capacity later/);
  assert.match(contract, /Arena bombs remain immediate and outside the/);
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
  assert.match(document, /class SfxEngine/);
  assert.match(document, /SFX_VOLUME_DEFAULTS/);
  assert.match(document, /setVolume\(/);
  assert.match(document, /busForAction\(/);
  assert.match(document, /explosion:\s*0\./);
  assert.match(document, /class Game/);
  assert.match(document, /class BrowserMatchPresentation/);
  assert.match(document, /boot\(\);/);
  assert.match(document, /var FluidBg=/);
  assert.match(document, /const PLAYABLE_CHAMPIONS = Object\.freeze/);
  assert.match(document, /const RIFTBOMB_BOTS = \(\(\) =>/);
  assert.doesNotMatch(document, /<(?:script|img)[^>]+src=["'](?!data:)/i);
  assert.doesNotMatch(document, /<link[^>]+href=/i);
  // Online packaging may hydrate VAT frames/normals via fetch(url). Offline
  // payloads keep those fields as embedded base64, so the network branch is dead.
  assert.doesNotMatch(document, /\b(?:XMLHttpRequest|WebSocket)\s*\(/);
  assert.doesNotMatch(document, /url\(["']?https?:/i);
  assert.match(document, /loadPackedBinary/);
  assert.doesNotMatch(document, /framesUrl\s*:/);
  assert.doesNotMatch(document, /normalsUrl\s*:/);
});

test("the solo CPU enters through bot-opponent instead of being duplicated in match rules", async () => {
  const sourceDocument = await readFile(sourcePath, "utf8");
  const rules = await readFile(path.join(gameDirectory, "run-champion-bomb-duel.js"), "utf8");

  assert.match(sourceDocument, /load-baseline-bot\.js/);
  assert.match(rules, /RIFTBOMB_BOTS\.buildWorldView\(this, dt, bot\.id\)/);
  assert.match(rules, /this\.botPolicy\.think\(view, dt\)/);
  assert.doesNotMatch(rules, /const choices = \[\s*\{ dx: 1, dz: 0 \}/);
});

test("bot skill intents reach castAbility through the human input entrypoint", async () => {
  const sourceDocument = await readFile(sourcePath, "utf8");
  const rules = await readFile(path.join(gameDirectory, "run-champion-bomb-duel.js"), "utf8");
  const release = await readFile(releasePath, "utf8");

  // The V1 bundle loads after the baseline and is embedded in the build.
  assert.match(sourceDocument, /load-baseline-bot\.js"><\/script>\s*<script src="\.\/load-v1-bot\.js/);
  assert.match(release, /RIFTBOMB_BOTS\.createV1Policy = createV1Policy/);
  assert.match(release, /RIFTBOMB_BOTS\.createRenektonPilot = createRenektonPilot/);

  // The match forwards skill intents to the same entrypoint as human input.
  assert.match(rules, /Object\.hasOwn\(BOT_SKILL_SLOTS, intent\.skill\)/);
  assert.match(rules, /this\.castAbility\(BOT_SKILL_SLOTS\[intent\.skill\], bot\)/);

  const presentation = {
    selectChampion() {}, prepareRound() {}, announce() {}, update() {}, finish() {}
  };

  // With the V1 bundle the solo CPU takes the pilot of the champion it plays…
  const v1Context = vm.createContext({ console });
  v1Context.RIFTBOMB_BOTS = {
    buildWorldView: () => ({}),
    createRenektonPilot: () => ({ id: "renekton" }),
    createV1Policy: ({ champion = null }) => ({
      champion: champion?.id ?? null,
      memory: {},
      think: () => ({ dx: 0, dz: 1, plantBomb: false, skill: "q" }),
      reset() {}
    })
  };
  vm.runInContext(`${rules}\nglobalThis.Game = Game;`, v1Context);
  const v1Match = new v1Context.Game({ ensureChampionModel() {} }, { effect() {} }, presentation);
  // P2 defaults to Zed: no champion module yet, shared arena brain only…
  assert.equal(v1Match.botPolicy.champion, null);
  // …and picking Renekton for P2 swaps in the Renekton pilot.
  v1Match.selectChampion2("renekton");
  assert.equal(v1Match.botPolicy.champion, "renekton");

  // castAbility rejects casts while stunned — same rule for human and CPU.
  v1Match.mode = "playing";
  v1Match.roundLocked = false;
  v1Match.players[1].stunned = 1;
  assert.equal(v1Match.castAbility(0, v1Match.players[1]), false);
  v1Match.players[1].stunned = 0;

  const casts = [];
  v1Match.castAbility = (slot, player) => { casts.push([slot, player.id]); return true; };
  v1Match.updateBot(0.1);
  assert.deepEqual(casts, [[0, 2]]);

  // …and without it the CPU falls back to the baseline policy.
  const fallbackContext = vm.createContext({ console });
  fallbackContext.RIFTBOMB_BOTS = {
    buildWorldView: () => ({}),
    createBaselinePolicy: () => ({
      profile: "rift",
      memory: { commit: 0, think: 0.15, lastDx: 0, lastDz: 1 },
      think: () => ({ dx: 0, dz: 0, plantBomb: false, skill: null }),
      reset() {}
    })
  };
  vm.runInContext(`${rules}\nglobalThis.Game = Game;`, fallbackContext);
  const fallbackMatch = new fallbackContext.Game({ ensureChampionModel() {} }, { effect() {} }, presentation);
  assert.equal(fallbackMatch.botPolicy.profile, "rift");
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
    finish: () => events.push(["finish"])
  };
  const match = new context.Game({}, {}, presentation);

  assert.deepEqual(events.shift(), ["champion", "katarina"]);
  match.selectChampion("zed");
  assert.ok(events.some(([event, value]) => event === "champion" && value === "zed"));
  assert.ok(events.some(([event, value]) => event === "update" && value === "zed"));

  events.length = 0;
  match.start();
  assert.ok(events.some(([event]) => event === "round"));
});

test("player two can select a full champion kit and receive four local skill inputs", async () => {
  const rules = await readFile(path.join(gameDirectory, "run-champion-bomb-duel.js"), "utf8");
  const controls = await readFile(path.join(gameDirectory, "start-champion-duel.js"), "utf8");
  const context = vm.createContext({ console });
  vm.runInContext(`${rules}\nglobalThis.Game = Game;`, context);
  const presentation = {
    selectChampion() {}, prepareRound() {}, announce() {}, update() {}, finish() {}
  };
  const match = new context.Game({ ensureChampionModel() {} }, { effect() {} }, presentation);

  match.selectChampion2("zed");
  assert.equal(match.selectedChampion2, "zed");
  assert.equal(match.players[1].champion, "zed");
  assert.equal(match.players[1].name, "Red Zed");

  match.mode = "playing";
  match.p2Human = true;
  match.players[1].skillsUnlocked = [true, true, true, true];
  const casts = [];
  match.castZedQ = (player) => casts.push([player.id, 0]);
  match.castZedW = (player) => casts.push([player.id, 1]);
  match.castZedE = (player) => casts.push([player.id, 2]);
  match.castZedR = (player) => casts.push([player.id, 3]);
  match.abilityTargetAvailable = () => true;
  for (let slot = 0; slot < 4; slot += 1) match.castAbility(slot, match.players[1]);
  assert.deepEqual(casts, [[2, 0], [2, 1], [2, 2], [2, 3]]);

  assert.match(controls, /\["KeyJ", "Numpad1"\].*castAbility\(0, game\.players\[1\]\)/s);
  assert.match(controls, /\["Semicolon", "Numpad4"\].*castAbility\(3, game\.players\[1\]\)/s);
  assert.match(controls, /shared: true, localMultiplayer: true/);
  assert.match(controls, /renderer\?\.setViewPlayer\(shared \? 0 : localPlayerId\)/);
  assert.doesNotMatch(controls, /secondaryRenderer|is-local-split/);
});

test("online camera starts with the full arena and supports mouse-wheel zoom", async () => {
  const renderer = await readFile(path.join(gameDirectory, "draw-bomber-rift.js"), "utf8");
  const controls = await readFile(path.join(gameDirectory, "start-champion-duel.js"), "utf8");
  assert.match(renderer, /this\.viewZoom = 0/);
  assert.match(renderer, /adjustViewZoom\(delta\)/);
  assert.match(renderer, /maximum useful arena remains visible/);
  assert.match(renderer, /focusPlayer\.x \* followZoom/);
  assert.match(renderer, /CPU-streamed poses still need a fixed contact shadow/);
  assert.match(controls, /addEventListener\("wheel"/);
  assert.match(controls, /is-online-match/);
  assert.match(controls, /renderer\.adjustViewZoom/);
  assert.doesNotMatch(controls, /Promise\.allSettled\(\[\s*sfx\.start\(\)/);
  assert.match(controls, /Audio will resume after player input/);
});

test("mobile rendering stays legible and malformed animation metadata cannot stop the frame", async () => {
  const renderer = await readFile(path.join(gameDirectory, "draw-bomber-rift.js"), "utf8");

  assert.match(renderer, /this\.maxScale = this\.mobilePerf \? Math\.min\(devicePixelRatio \|\| 1, 2\)/);
  assert.match(renderer, /this\.minScale = this\.mobilePerf \? 0\.9/);
  assert.match(renderer, /this\.pixelBudget = this\.mobilePerf \? 1920 \* 1080/);
  assert.match(renderer, /this\.scale = this\.mobilePerf\s*\n\s*\? Math\.min\(devicePixelRatio \|\| 1, 2\)/);
  assert.match(renderer, /if \(!animation\?\.clips \|\| !animation\?\.actions\) return null/);
  assert.match(renderer, /if \(!frame \|\| frame\.hidden\) return false/);
  assert.doesNotMatch(renderer, /Missing VAT (?:animation clip|action mapping)/);
});

test("mobile controls remain match-only, multitouch-safe, with a floating stick", async () => {
  const document = await readFile(sourcePath, "utf8");
  const controls = await readFile(path.join(gameDirectory, "start-champion-duel.js"), "utf8");
  const styles = await readFile(path.join(gameDirectory, "show-champion-duel.css"), "utf8");

  assert.match(styles, /html\.is-match-active \.touch-controls/);
  assert.match(styles, /html:not\(\.is-match-active\) \.touch-controls/);
  assert.match(styles, /\.touch-actions \{[\s\S]*?pointer-events: auto/);
  assert.match(styles, /\.touch-btn \{[\s\S]*?pointer-events: auto/);
  assert.match(controls, /let activePointer = null;[\s\S]*?addEventListener\("pointerup", release, \{ capture: true \}\)/);
  assert.doesNotMatch(controls, /button\.setPointerCapture/);
  assert.doesNotMatch(document, /user-scalable=no|maximum-scale=1/);

  // Floating stick: the move zone sits before the stick and the action
  // buttons stay outside it, so skill taps can never start movement.
  assert.match(document, /touch-move-zone[\s\S]*?id="touch-stick"[\s\S]*?class="touch-actions"/);
  assert.match(styles, /\.touch-move-zone \{[\s\S]*?pointer-events: auto/);
  assert.match(styles, /\.touch-move-zone \{[\s\S]*?width: 48%/);
  assert.match(styles, /\.touch-stick \{[\s\S]*?pointer-events: none/);
  assert.match(styles, /\.touch-stick \{[\s\S]*?left: max\(/);
  assert.match(styles, /\.touch-stick\.is-floating \{[\s\S]*?will-change: transform/);
  assert.match(styles, /\.touch-stick:not\(\.is-active\) \.touch-stick__knob \{[\s\S]*?transition: transform 90ms/);
  // Skills stay bottom-right — never dragged left with the stick.
  assert.match(styles, /\.touch-actions \{[\s\S]*?position: fixed[\s\S]*?right: max\(/);
  assert.match(styles, /\.touch-actions \{[\s\S]*?left: auto/);

  // A pointerdown on the zone anchors the stick at the touch point and the
  // direction offset is measured from that anchor, not the element center.
  assert.match(controls, /zone\.addEventListener\("pointerdown"/);
  assert.match(controls, /zone\.setPointerCapture\?\.\(event\.pointerId\)/);
  assert.doesNotMatch(controls, /stick\.addEventListener\("pointerdown"/);
  assert.match(controls, /anchorX = clientX/);
  assert.match(controls, /clientX - anchorX/);
  assert.match(controls, /parkStick/);
});

test("analog stick gets cardinal snap and corner nudge while keyboard and AI paths stay untouched", async () => {
  const rules = await readFile(path.join(gameDirectory, "run-champion-bomb-duel.js"), "utf8");

  // Snap applies only inside the analog stick branch of movementFor.
  const stickBranch = rules.match(/if \(stickMag > 0\.18\) \{([\s\S]*?)\} else \{/);
  assert.ok(stickBranch, "analog stick branch must exist");
  assert.match(stickBranch[1], /snapLimit/);
  assert.match(stickBranch[1], /analog = true/);
  assert.doesNotMatch(rules, /ArrowLeft[\s\S]{0,200}analog = true/);

  // Corner nudging only runs when moveEntity receives the analog assist flag.
  assert.match(rules, /moveEntity\(entity, dx, dz, speed, dt, radius, ignoreBomb = null, assist = false\)/);
  assert.match(rules, /assist && dx !== 0/);
  assert.match(rules, /assist && dz !== 0/);
  assert.match(rules, /nudgeAroundCorner\(entity, nx, "x"/);
  assert.match(rules, /nudgeAroundCorner\(entity, nz, "z"/);
  assert.match(rules, /passableBombs, analog\)/);
  // Nudge is capped at one frame of travel and is a pure function of state.
  assert.match(rules, /const shift = \(maxShift \* i\) \/ 2;/);
  assert.doesNotMatch(rules.match(/nudgeAroundCorner\(entity, target[\s\S]*?\n      \}/)[0], /Math\.random|Date\.|performance\./);
});

test("match rules do not write browser presentation directly", async () => {
  const rules = await readFile(path.join(gameDirectory, "run-champion-bomb-duel.js"), "utf8");
  const presentationCalls = [...rules.matchAll(/this\.presentation\.([A-Za-z]+)\(/g)]
    .map((match) => match[1]);

  assert.ok(!/\bUI\.|\bdocument\.|\$\$\(/.test(rules));
  assert.ok(!/syncChampionPresentation/.test(await readFile(path.join(gameDirectory, "start-champion-duel.js"), "utf8")));
  assert.deepEqual(
    [...new Set(presentationCalls)].sort(),
    ["announce", "finish", "prepareRound", "selectChampion", "update"]
  );
});

test("no pause control remains in the game modules", async () => {
  const modules = [
    "play-riftbomb.html",
    "run-champion-bomb-duel.js",
    "start-champion-duel.js",
    "present-champion-bomb-duel.js",
    "play-rift-sfx.js",
    "draw-bomber-rift.js",
    "show-champion-duel.css"
  ];
  for (const module of modules) {
    const source = await readFile(path.join(gameDirectory, module), "utf8");
    assert.ok(!source.includes("togglePause"), `${module} must not reference togglePause`);
    assert.ok(!source.includes("setPaused"), `${module} must not reference setPaused`);
    assert.ok(!/this\.paused|game\.paused/.test(source), `${module} must not track a paused flag`);
    assert.ok(!source.includes("pause-button"), `${module} must not style a pause button`);
  }
});

test("playable model bytes stay out of the renderer implementation", async () => {
  const renderer = await readFile(path.join(gameDirectory, "draw-bomber-rift.js"), "utf8");

  assert.ok(!renderer.includes("_MODEL_VERTICES ="));
  assert.ok(!renderer.includes("_MODEL_INDICES ="));
  assert.ok(!renderer.includes("_MODEL_TEXTURE ="));
  assert.ok(renderer.length < 1_000_000, "renderer should not carry packaged model bytes");
});

test("the full roster samples tiled VAT on the GPU with a bounded CPU fallback", async () => {
  const renderer = await readFile(path.join(gameDirectory, "draw-bomber-rift.js"), "utf8");
  const startup = await readFile(path.join(gameDirectory, "start-champion-duel.js"), "utf8");
  const rules = await readFile(path.join(gameDirectory, "run-champion-bomb-duel.js"), "utf8");
  const expectedClipCounts = { katarina: 25, zed: 40, renekton: 19, vladimir: 26, gangplank: 32 };
  const layoutStart = renderer.indexOf("function planVatTextureLayout");
  const layoutEnd = renderer.indexOf("    const modelReviewTarget", layoutStart);
  assert.ok(layoutStart >= 0 && layoutEnd > layoutStart);
  const layoutContext = vm.createContext({
    clamp: (value, min, max) => Math.max(min, Math.min(max, value))
  });
  vm.runInContext(
    `${renderer.slice(layoutStart, layoutEnd)};
     globalThis.planVatTextureLayout = planVatTextureLayout;
     globalThis.sampleVatAnimationClip = sampleVatAnimationClip;`,
    layoutContext
  );
  for (const [champion, expectedClipCount] of Object.entries(expectedClipCounts)) {
    const metadata = JSON.parse(await readFile(
      path.join(repositoryRoot, "champions", champion, "playable-model",
        `${champion}-model-metadata.json`),
      "utf8"
    ));
    assert.equal(metadata.runtime, "vat-v1");
    assert.equal(metadata.completeClipCatalog, true);
    assert.match(metadata.sourceUrl, /cdn\.modelviewer\.lol/);
    assert.equal(Object.keys(metadata.animationClips).length, expectedClipCount);
    for (const actionSource of Object.values(metadata.animationActions)) {
      assert.ok(metadata.animationClips[actionSource], `${champion} action clip ${actionSource} exists`);
    }
    for (const maxTextureSize of [2048, 16384]) {
      const layout = layoutContext.planVatTextureLayout(
        metadata.vertexCount,
        metadata.frameCount,
        maxTextureSize
      );
      assert.ok(layout.width <= maxTextureSize);
      assert.ok(layout.height <= maxTextureSize);
      assert.equal(layout.texelCount, metadata.vertexCount * metadata.frameCount);
      assert.ok(
        (layout.paddedTexelCount - layout.texelCount) / layout.texelCount <= 0.006,
        `${champion} VAT padding stays below 0.6% at ${maxTextureSize}`
      );
      for (const frame of [0, Math.floor(metadata.frameCount / 2), metadata.frameCount - 1]) {
        for (const vertex of [0, Math.floor(metadata.vertexCount / 2), metadata.vertexCount - 1]) {
          const linear = frame * metadata.vertexCount + vertex;
          const x = linear % layout.width;
          const y = Math.floor(linear / layout.width);
          assert.ok(x >= 0 && x < layout.width);
          assert.ok(y >= 0 && y < layout.height);
          assert.equal(y * layout.width + x, linear);
        }
      }
    }
  }
  assert.match(renderer, /return this\.createVatChampionModel\(/);
  assert.match(renderer, /GPU VAT unavailable for \$\{champion\}; using CPU fallback/);
  for (const champion of Object.keys(expectedClipCounts)) {
    assert.match(
      renderer,
      new RegExp(`this\\.drawVatChampion\\(player, t, beat, "${champion}"`),
      `${champion} must reach the VAT shader path`
    );
  }
  const gpuHotPath = renderer.slice(
    renderer.indexOf("      drawVatChampion(player"),
    renderer.indexOf("      drawPackedChampion(player")
  );
  assert.doesNotMatch(gpuHotPath, /bufferSubData|dynamicVertices|for \(let vertex/);
  assert.match(renderer, /int linear = frame \* uVertexCount \+ gl_VertexID/);
  assert.match(renderer, /textureSize\(uPositionFrames, 0\)\.x/);
  assert.match(renderer, /if \(!frame \|\| frame\.hidden\) return false/);
  assert.match(renderer, /const invulnerable = options\.invulnerable \?\? \(player\.invulnerable > 0\)/);
  assert.match(renderer, /if \(options\.grounding !== false\) \{/);
  assert.match(renderer, /gl\.depthMask\(!options\.shadow\)/);
  assert.doesNotMatch(gpuHotPath, /depthMask\(!options\.shadow && !options\.pool\)/);
  assert.match(renderer, /frame\.key === "poolDown" \|\| frame\.key === "poolUp" \? 0/);
  assert.match(renderer, /Model Viewer glTF UVs are already in atlas orientation/);
  assert.match(renderer, /gl\.pixelStorei\(gl\.UNPACK_FLIP_Y_WEBGL, false\)/);
  assert.match(renderer, /assertVatOperation\("position texture upload"\)/);
  assert.match(renderer, /assertVatOperation\("normal texture upload"\)/);
  assert.match(renderer, /gl\.getError\(\)/);
  assert.match(renderer, /using its fallback material/);
  assert.match(renderer, /resolveChampionAnimation/);
  assert.match(renderer, /resolveVladimirAnimation/);
  assert.match(rules, /vladimirAttackAnim/);
  assert.match(rules, /vladimirQAnim/);
  const validAnimation = {
    frameCount: 20,
    clips: {
      loop: { startFrame: 10, frameCount: 4, loop: true },
      once: { startFrame: 10, frameCount: 4, loop: false },
      single: { startFrame: 4, frameCount: 1, loop: false }
    }
  };
  assert.deepEqual(
    { ...layoutContext.sampleVatAnimationClip(validAnimation, "loop", 1) },
    { frameA: 10, frameB: 11, mix: 0 }
  );
  assert.deepEqual(
    { ...layoutContext.sampleVatAnimationClip(validAnimation, "once", 1) },
    { frameA: 13, frameB: 13, mix: 0 }
  );
  assert.deepEqual(
    { ...layoutContext.sampleVatAnimationClip(validAnimation, "single", 0.5) },
    { frameA: 4, frameB: 4, mix: 0 }
  );
  for (const invalid of [
    [validAnimation, "loop", Number.NaN],
    [validAnimation, "loop", Number.POSITIVE_INFINITY],
    [{ frameCount: 20, clips: { bad: { startFrame: -1, frameCount: 4, loop: true } } }, "bad", 0],
    [{ frameCount: 20, clips: { bad: { startFrame: 18, frameCount: 4, loop: true } } }, "bad", 0],
    [{ frameCount: 20, clips: { bad: { startFrame: 1, frameCount: 1.5, loop: true } } }, "bad", 0]
  ]) {
    assert.equal(layoutContext.sampleVatAnimationClip(...invalid), null);
  }
  const constructorStart = renderer.indexOf("      constructor(canvas)");
  const constructorEnd = renderer.indexOf("      setViewPlayer", constructorStart);
  const constructorBody = renderer.slice(constructorStart, constructorEnd);
  assert.doesNotMatch(
    constructorBody,
    /\b(?:initialise|ensure)ChampionModels?\s*\(/,
    "renderer construction must not decode and upload the full VAT roster"
  );
  assert.match(startup, /game\.players\.map\(\(player\) => player\.champion\)/);
  assert.match(startup, /\.\.\.game\.players\.map\(\(player\) => player\.champion\),\s*modelReviewTarget/);
  assert.match(startup, /\.filter\(Boolean\)/);
  assert.match(startup, /renderer\.ensureChampionModels\(embeddedModels\)/);
});

test("real VAT binaries preserve CPU fallback samples after tiled GPU packing", async () => {
  const renderer = await readFile(path.join(gameDirectory, "draw-bomber-rift.js"), "utf8");
  const layoutStart = renderer.indexOf("function planVatTextureLayout");
  const layoutEnd = renderer.indexOf("    function sampleVatAnimationClip", layoutStart);
  const updateStart = renderer.indexOf("      updateCpuAnimatedChampion(key, frame)");
  const updateEnd = renderer.indexOf("      drawCpuAnimatedChampion(", updateStart);
  assert.ok(layoutStart >= 0 && layoutEnd > layoutStart);
  assert.ok(updateStart >= 0 && updateEnd > updateStart);
  const parityContext = vm.createContext({});
  vm.runInContext(
    `${renderer.slice(layoutStart, layoutEnd)};
     globalThis.planVatTextureLayout = planVatTextureLayout;
     globalThis.updateCpuAnimatedChampion = ({
       ${renderer.slice(updateStart, updateEnd).trim()}
     }).updateCpuAnimatedChampion;`,
    parityContext
  );

  for (const champion of ["katarina", "zed", "renekton", "vladimir", "gangplank"]) {
    const modelDirectory = path.join(repositoryRoot, "champions", champion, "playable-model");
    const [metadata, frameBytes, normalBytes] = await Promise.all([
      readFile(path.join(modelDirectory, `${champion}-model-metadata.json`), "utf8").then(JSON.parse),
      readFile(path.join(modelDirectory, `${champion}-model-frames.bin`)),
      readFile(path.join(modelDirectory, `${champion}-model-normals.bin`))
    ]);
    const vertexCount = metadata.vertexCount;
    const frameCount = metadata.frameCount;
    const layout = parityContext.planVatTextureLayout(vertexCount, frameCount, 2048);
    assert.equal(frameBytes.byteLength, vertexCount * frameCount * 4 * Uint16Array.BYTES_PER_ELEMENT);
    assert.equal(normalBytes.byteLength, vertexCount * frameCount * 4);

    const sourcePositions = new Uint16Array(
      frameBytes.buffer,
      frameBytes.byteOffset,
      frameBytes.byteLength / Uint16Array.BYTES_PER_ELEMENT
    );
    const tiledPositions = new Uint16Array(layout.paddedTexelCount * 4);
    const tiledNormals = new Uint8Array(layout.paddedTexelCount * 4);
    tiledPositions.set(sourcePositions);
    tiledNormals.set(normalBytes);
    assert.equal(
      Buffer.compare(
        Buffer.from(tiledPositions.buffer, 0, frameBytes.byteLength),
        frameBytes
      ),
      0,
      `${champion} position payload remains byte-exact after padding`
    );
    assert.equal(
      Buffer.compare(
        Buffer.from(tiledNormals.buffer, 0, normalBytes.byteLength),
        normalBytes
      ),
      0,
      `${champion} normal payload remains byte-exact after padding`
    );
    if (layout.paddedTexelCount > layout.texelCount) {
      assert.equal(tiledPositions.at(-1), 0);
      assert.equal(tiledNormals.at(-1), 0);
    }

    const lastLinear = layout.texelCount - 1;
    for (const linear of [0, layout.width - 1, layout.width, layout.width + 1, lastLinear]) {
      const x = linear % layout.width;
      const y = Math.floor(linear / layout.width);
      assert.equal(y * layout.width + x, linear, `${champion} preserves tiled address ${linear}`);
      for (let axis = 0; axis < 4; axis += 1) {
        assert.equal(tiledPositions[(y * layout.width + x) * 4 + axis], sourcePositions[linear * 4 + axis]);
        assert.equal(tiledNormals[(y * layout.width + x) * 4 + axis], normalBytes[linear * 4 + axis]);
      }
    }

    const animation = {
      vertexCount,
      frameCount,
      positionMin: metadata.positionBounds.min,
      positionRange: metadata.positionBounds.range
    };
    const dynamicVertices = new Float32Array(vertexCount * 26);
    const cpuState = {
      [`${champion}Animation`]: animation,
      [`${champion}CpuAnimation`]: {
        frameData: sourcePositions,
        normalData: normalBytes,
        dynamicVertices,
        vertexCount
      },
      [`${champion}VertexBuffer`]: {},
      gl: {
        ARRAY_BUFFER: 0x8892,
        bindBuffer() {},
        bufferSubData() {}
      }
    };
    const currentA = 0;
    const currentB = Math.min(1, frameCount - 1);
    const previousA = Math.floor(frameCount / 2);
    const previousB = Math.min(previousA + 1, frameCount - 1);
    const sampleVertices = [0, Math.min(2047, vertexCount - 1), Math.min(2048, vertexCount - 1),
      Math.floor(vertexCount / 2), vertexCount - 1];
    const packed = (data, frameIndex, vertex, axis) => {
      const linear = frameIndex * vertexCount + vertex;
      const x = linear % layout.width;
      const y = Math.floor(linear / layout.width);
      return data[(y * layout.width + x) * 4 + axis];
    };
    for (const transition of [0, 0.5, 1]) {
      const frame = {
        frameA: currentA,
        frameB: currentB,
        mix: 0.37,
        previous: { frameA: previousA, frameB: previousB, mix: 0.61 },
        transition
      };
      parityContext.updateCpuAnimatedChampion.call(cpuState, champion, frame);
      for (const vertex of sampleVertices) {
        for (let axis = 0; axis < 3; axis += 1) {
          const decodePosition = (frameIndex) => animation.positionMin[axis] +
            packed(tiledPositions, frameIndex, vertex, axis) / 65535 * animation.positionRange[axis];
          const currentPosition = decodePosition(currentA) +
            (decodePosition(currentB) - decodePosition(currentA)) * frame.mix;
          const previousPosition = decodePosition(previousA) +
            (decodePosition(previousB) - decodePosition(previousA)) * frame.previous.mix;
          const gpuPosition = previousPosition + (currentPosition - previousPosition) * transition;
          assert.ok(
            Math.abs(dynamicVertices[vertex * 26 + axis] - gpuPosition) <= 0.00002,
            `${champion} position parity at vertex ${vertex}, axis ${axis}, transition ${transition}`
          );

          const decodeNormal = (frameIndex) =>
            packed(tiledNormals, frameIndex, vertex, axis) / 255 * 2 - 1;
          const currentNormal = decodeNormal(currentA) +
            (decodeNormal(currentB) - decodeNormal(currentA)) * frame.mix;
          const previousNormal = decodeNormal(previousA) +
            (decodeNormal(previousB) - decodeNormal(previousA)) * frame.previous.mix;
          const gpuNormal = previousNormal + (currentNormal - previousNormal) * transition;
          assert.ok(
            Math.abs(dynamicVertices[vertex * 26 + 18 + axis] - gpuNormal) <= 0.000002,
            `${champion} normal parity at vertex ${vertex}, axis ${axis}, transition ${transition}`
          );
        }
      }
    }
  }

  assert.match(renderer, /mix\(previousPosition, currentPosition, uTransition\)/);
  assert.match(renderer, /normalize\(mix\(previousNormal, currentNormal, uTransition\)\)/);
});

test("arena modular kit packs seventeen authored texture sources", async () => {
  const renderer = await readFile(path.join(gameDirectory, "draw-bomber-rift.js"), "utf8");
  const packedTextures = await readFile(
    path.join(gameDirectory, "arena-appearance", "load-arena-appearance.js"),
    "utf8"
  );

  assert.match(renderer, /const textureGroups = \{/);
  assert.match(renderer, /for \(const \[sourceKey, aliases\] of Object\.entries\(textureGroups\)\)/);
  assert.match(renderer, /wallClearing:\s*\["wallClearing"\]/);
  assert.match(renderer, /wallLabyrinth:\s*\["wallLabyrinth"\]/);
  assert.match(renderer, /wallForts:\s*\["wallForts"\]/);
  assert.match(renderer, /wallPit:\s*\["wallPit"\]/);
  assert.equal(
    [...packedTextures.matchAll(/data:image\/webp;base64,/g)].length,
    17,
    "the offline build must embed each modular kit source once (5 floors + 5 walls + 5 tops + 2 crates)"
  );
});

test("arena render does not reference an undeclared turret color", async () => {
  const renderer = await readFile(path.join(gameDirectory, "draw-bomber-rift.js"), "utf8");

  assert.doesNotMatch(renderer, /\biceBody\b/);
  assert.match(renderer, /\[turret\.x, 0\.22, turret\.z\][\s\S]{0,100}C\.arenaStone/);
});

test("the build retains the five playable champions and duel rules", async () => {
  const document = await readFile(releasePath, "utf8");

  for (const champion of ["Katarina", "Zed", "Renekton", "Vladimir", "Gangplank"]) {
    assert.ok(document.includes(champion), `${champion} must remain in the build`);
  }
  assert.doesNotMatch(document, /\bZiggs\b/);

  assert.match(document, /first to 3/i);
  assert.match(document, /Breakable Hextech blocks/);
  assert.match(document, /Local PvP/);
});
