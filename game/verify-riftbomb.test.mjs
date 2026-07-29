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
  const combat = await readFile(path.join(gameDirectory, "apply-readable-combat.js"), "utf8");

  assert.match(document, /script src="\.\/apply-readable-combat\.js"/);
  assert.match(combat, /maxHealth: 100/);
  assert.match(combat, /arenaBombDamage: 35/);
  assert.match(combat, /globalThis\.RIFTBOMB_COMBAT = RIFTBOMB_COMBAT/);
  assert.match(combat, /match\.hitContestant = function hitContestantWithDamage/);
  assert.match(combat, /storedBefore \+ legacyDamage \* 0\.48/);
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
  const sfx = { togglePause: (paused) => events.push(["sfx", paused]) };
  const match = new context.Game({}, sfx, presentation);

  assert.deepEqual(events.shift(), ["champion", "katarina"]);
  match.selectChampion("zed");
  assert.ok(events.some(([event, value]) => event === "champion" && value === "zed"));
  assert.ok(events.some(([event, value]) => event === "update" && value === "zed"));

  events.length = 0;
  match.start();
  match.togglePause();
  assert.ok(events.some(([event]) => event === "round"));
  assert.ok(events.some(([event, value]) => event === "paused" && value === true));
  assert.ok(events.some(([event, value]) => event === "sfx" && value === true));
});

test("player two can select a full champion kit and receive four local skill inputs", async () => {
  const rules = await readFile(path.join(gameDirectory, "run-champion-bomb-duel.js"), "utf8");
  const controls = await readFile(path.join(gameDirectory, "start-champion-duel.js"), "utf8");
  const context = vm.createContext({ console });
  vm.runInContext(`${rules}\nglobalThis.Game = Game;`, context);
  const presentation = {
    selectChampion() {}, prepareRound() {}, announce() {}, update() {}, finish() {}, setPaused() {}
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
  assert.match(styles, /\.touch-stick \{[\s\S]*?pointer-events: none/);
  assert.match(styles, /\.touch-stick\.is-floating \{[\s\S]*?position: fixed/);
  assert.match(styles, /\.touch-stick:not\(\.is-active\) \.touch-stick__knob \{[\s\S]*?transition: transform 90ms/);

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

test("the full roster maps Model Viewer clips to CPU-streamed animation meshes", async () => {
  const renderer = await readFile(path.join(gameDirectory, "draw-bomber-rift.js"), "utf8");
  const rules = await readFile(path.join(gameDirectory, "run-champion-bomb-duel.js"), "utf8");
  const expectedClipCounts = { katarina: 25, zed: 40, renekton: 19, vladimir: 26, gangplank: 32 };
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
  }
  assert.match(renderer, /createCpuAnimatedChampionModel/);
  assert.match(renderer, /updateCpuAnimatedChampion/);
  assert.match(renderer, /drawCpuAnimatedChampion/);
  assert.match(renderer, /resolveChampionAnimation/);
  assert.match(renderer, /Model Viewer glTF UVs are already in atlas orientation/);
  assert.match(renderer, /resolveVladimirAnimation/);
  assert.match(rules, /vladimirAttackAnim/);
  assert.match(rules, /vladimirQAnim/);
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
