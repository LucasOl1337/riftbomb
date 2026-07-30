import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import { createAuthoritativeDuel } from "./create-authoritative-duel.mjs";

const gameDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(gameDirectory);
const sourcePath = path.join(gameDirectory, "play-riftbomb.html");
const releasePath = path.join(repositoryRoot, "riftbomb.html");

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

function webpInfo(buffer) {
  assert.equal(buffer.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(buffer.subarray(8, 12).toString("ascii"), "WEBP");
  const uint24 = (offset) => (
    buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16)
  );
  let width = 0;
  let height = 0;
  let hasAlpha = false;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const chunk = buffer.subarray(offset, offset + 4).toString("ascii");
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    assert.ok(data + size <= buffer.length, `${chunk} exceeds its WebP container`);
    if (chunk === "VP8 ") {
      assert.equal(buffer.subarray(data + 3, data + 6).toString("hex"), "9d012a");
      width ||= buffer.readUInt16LE(data + 6) & 0x3fff;
      height ||= buffer.readUInt16LE(data + 8) & 0x3fff;
    } else if (chunk === "VP8L") {
      assert.equal(buffer[data], 0x2f);
      const bits = buffer.readUInt32LE(data + 1);
      width ||= (bits & 0x3fff) + 1;
      height ||= ((bits >>> 14) & 0x3fff) + 1;
      hasAlpha ||= Boolean(bits & 0x10000000);
    } else if (chunk === "VP8X") {
      hasAlpha ||= Boolean(buffer[data] & 0x10);
      width = uint24(data + 4) + 1;
      height = uint24(data + 7) + 1;
    } else if (chunk === "ALPH") {
      hasAlpha = true;
    }
    offset = data + size + (size & 1);
  }
  assert.ok(width > 0 && height > 0, "WebP must contain a VP8, VP8L or VP8X size");
  return { width, height, hasAlpha };
}

function webpDimensions(buffer) {
  const { width, height } = webpInfo(buffer);
  return { width, height };
}

function pngDimensions(buffer) {
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(buffer.subarray(12, 16).toString("ascii"), "IHDR");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

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

test("the decorative WebGL background waits until core boot can finish", async () => {
  const document = await readFile(sourcePath, "utf8");
  const deferredBackground = await readFile(
    path.join(gameDirectory, "arena-appearance", "defer-bomber-rift-background.js"),
    "utf8"
  );
  const controls = await readFile(path.join(gameDirectory, "start-champion-duel.js"), "utf8");

  assert.match(document, /<template id="riftbomb-background">\s*<fluid-bg/);
  assert.match(document, /animate-bomber-rift-background\.js[\s\S]*defer-bomber-rift-background\.js/);
  assert.match(deferredBackground, /requestIdleCallback\(mountBackground, \{ timeout: 1000 \}\)/);
  assert.match(deferredBackground, /setTimeout\(mountBackground, 0\)/);
  assert.match(deferredBackground, /template\.content\.cloneNode\(true\)/);
  assert.match(deferredBackground, /is-match-active/);
  assert.match(controls, /fluid-bg, #riftbomb-background/);

  class TemplateElement {}
  const idleCallbacks = [];
  const mounted = [];
  const template = Object.assign(new TemplateElement(), {
    isConnected: true,
    content: {
      cloneNode(deep) {
        assert.equal(deep, true);
        return { nodeName: "FLUID-BG" };
      }
    },
    replaceWith(node) {
      mounted.push(node);
      this.isConnected = false;
    },
    remove() {
      this.isConnected = false;
    }
  });
  const context = vm.createContext({
    HTMLTemplateElement: TemplateElement,
    document: {
      getElementById() { return template; },
      documentElement: { classList: { contains() { return false; } } }
    },
    requestIdleCallback(callback, options) {
      idleCallbacks.push({ callback, options });
    }
  });

  vm.runInContext(deferredBackground, context);

  assert.deepEqual(mounted, [], "background must not mount during the critical script task");
  assert.equal(idleCallbacks.length, 1);
  assert.equal(idleCallbacks[0].options.timeout, 1000);
  idleCallbacks[0].callback();
  assert.deepEqual(mounted, [{ nodeName: "FLUID-BG" }]);
});

test("arena textures load only for the selected or explored arena", async (t) => {
  const document = await readFile(sourcePath, "utf8");
  const planSource = await readFile(
    path.join(gameDirectory, "arena-appearance", "plan-arena-texture-loads.js"),
    "utf8"
  );
  const renderer = await readFile(path.join(gameDirectory, "draw-bomber-rift.js"), "utf8");
  const controls = await readFile(path.join(gameDirectory, "start-champion-duel.js"), "utf8");
  const rules = await readFile(path.join(gameDirectory, "run-champion-bomb-duel.js"), "utf8");
  const context = vm.createContext({});
  vm.runInContext(planSource, context);

  const theme = {
    floor: "floorClearing",
    wall: "wallClearing",
    wallTop: "wallTopClearing",
    soft: "nacreGrowth"
  };
  assert.deepEqual(
    [...context.RIFTBOMB_ARENA_TEXTURE_PLAN.forTheme(theme)],
    ["nacreGrowth", "floorClearing", "wallClearing", "wallTopClearing"]
  );
  assert.deepEqual(
    [...context.RIFTBOMB_ARENA_TEXTURE_PLAN.forTheme(null)],
    ["crate", "crateTop", "floorLattice", "wallLattice", "wallTopLattice"]
  );

  assert.match(document, /load-arena-appearance\.js[\s\S]*plan-arena-texture-loads\.js[\s\S]*draw-bomber-rift\.js/);
  assert.match(renderer, /this\.arenaTextureLoaders = Object\.create\(null\)/);
  assert.match(renderer, /ensureArenaTextures\(theme\)/);
  assert.match(renderer, /RIFTBOMB_ARENA_TEXTURE_PLAN\.forTheme\(theme\)/);
  assert.match(controls, /renderer\.ensureArenaTextures\(game\.arenaTemplate\(\)\.theme\)/);
  assert.doesNotMatch(controls, /paintArenaPreview|createArenaPreview|buildArenaPicker/);
  assert.doesNotMatch(controls, /renderer\.arenaTexturesReady/);

  const themePattern = /theme: Object\.freeze\(\{\s*floor: "([^"]+)",\s*wall: "([^"]+)",\s*wallTop: "([^"]+)"/g;
  const themes = [...rules.matchAll(themePattern)].map(([, floor, wall, wallTop]) => ({
    floor,
    wall,
    wallTop
  }));
  const declaredThemeCount = (rules.match(/theme: Object\.freeze\(\{/g) ?? []).length;
  assert.ok(declaredThemeCount > 0, "at least one arena theme must be budgeted");
  assert.equal(themes.length, declaredThemeCount, "every declared arena theme must enter the texture budget");

  const texturePathForKey = (key) => {
    if (key === "crate") return path.join("crates", "crate-albedo.webp");
    if (key === "crateTop") return path.join("crates", "crate-top-albedo.webp");
    if (key === "floorLattice") {
      return path.join("ground", "floor-salt-lens-combat-band-6ffb0854.webp");
    }
    if (key === "floorPit") {
      return path.join("ground", "floor-storm-eye-combat-field-99509f91.webp");
    }
    if (key === "floorClearing") {
      return path.join("ground", "floor-clearing-v3.webp");
    }
    if (key === "nacreGrowth") return path.join("props", "nacre-growth-albedo.webp");
    const directory = key.startsWith("floor") ? "ground" : "walls";
    const fileName = key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
    return path.join(directory, `${fileName}.webp`);
  };
  const texturesDirectory = path.join(gameDirectory, "arena-appearance", "textures");
  const measuredThemes = await Promise.all(themes.map(async (arenaTheme) => {
    const keys = [...context.RIFTBOMB_ARENA_TEXTURE_PLAN.forTheme(arenaTheme)];
    assert.ok(keys.length <= 5, `arena boot must request at most 5 textures, received ${keys.length}`);
    const sizes = await Promise.all(keys.map(async (key) => (
      await stat(path.join(texturesDirectory, texturePathForKey(key)))
    ).size));
    return { bytes: sizes.reduce((total, size) => total + size, 0), keys };
  }));
  const largestTheme = measuredThemes.reduce((largest, measured) => (
    measured.bytes > largest.bytes ? measured : largest
  ));
  assert.ok(
    largestTheme.bytes <= 2_700_000,
    `arena boot loads ${largestTheme.bytes} B; budget is 2700000 B`
  );
  t.diagnostic(
    `arena texture budget: ${themes.length} themes, max ${largestTheme.keys.length} requests / ${largestTheme.bytes} B`
  );
});

test("Salt Lens floor preserves original provenance, budget, scale and packed bytes", async () => {
  const appearanceDirectory = path.join(gameDirectory, "arena-appearance");
  const metadata = JSON.parse(await readFile(
    path.join(appearanceDirectory, "materials", "ground.json"),
    "utf8"
  ));
  const floorPath = path.join(appearanceDirectory, metadata.maps.saltLens);
  const sourceFile = path.join(appearanceDirectory, metadata.source);
  const [floor, source, packedTextures, renderer] = await Promise.all([
    readFile(floorPath),
    readFile(sourceFile),
    readFile(path.join(appearanceDirectory, "load-arena-appearance.js"), "utf8"),
    readFile(path.join(gameDirectory, "draw-bomber-rift.js"), "utf8")
  ]);

  assert.deepEqual(webpDimensions(floor), { width: 1024, height: 1024 });
  const sourceSize = pngDimensions(source);
  assert.ok(sourceSize.width >= 1024 && sourceSize.height >= 1024);
  assert.ok(floor.length <= 249_056, `Salt Lens floor is ${floor.length} B; ceiling is 249056 B`);
  assert.equal(floor.length, metadata.assetByteLength);
  assert.deepEqual(metadata.assetDimensions, [1024, 1024]);
  assert.equal(sha256(source), metadata.sourceSha256);
  assert.equal(sha256(floor), metadata.assetSha256);
  assert.notEqual(
    metadata.assetSha256,
    "a1b41d7c797aa9fe473be8116d32655c077b353af05b377bb75e9aa5eb09e0d9",
    "the homogeneous legacy floor must not be repromoted"
  );

  const packedFloor = packedTextures.match(
    /"floorLattice":"data:image\/webp;base64,([^"]+)"/
  );
  assert.ok(packedFloor, "offline arena pack must include floorLattice");
  assert.deepEqual(Buffer.from(packedFloor[1], "base64"), floor);

  assert.match(
    renderer,
    /this\.arenaFloorProfile = floorKey === "floorLattice" \|\| floorKey === "floorPit"\s*\? 1\s*: 0/
  );
  assert.match(renderer, /useMap === 1 \? \(this\.arenaFloorProfile \|\| 0\) : 0/);
  assert.match(renderer, /if \(uFloorProfile > 0\.5\)/);
  assert.match(renderer, /uv = fract\(vWorld\.xz \* 0\.066 \+ 0\.5\)/);
  assert.match(renderer, /detailRotation \* \(\(uv - 0\.5\) \* detailScale\)/);
  assert.match(renderer, /texture\(map, mirroredTile\(detailCoord\)\)/);
  assert.match(renderer, /halfTexel = vec2\(0\.5 \/ 1024\.0\)/);
  assert.match(renderer, /sampleCombatBandDetail\(uAlbedo, uv, 5\.25, 0\.16\)/);
  assert.match(renderer, /bumpFromAlbedo\(uAlbedo, uv, N, 0\.8\)/);
  assert.match(renderer, /sampleAlbedoDetail\(uAlbedo, uv, 5\.5, 0\.28\)/);
  assert.match(renderer, /bumpFromAlbedo\(uAlbedo, uv, N, 1\.15\)/);
});

test("Storm-Eye floor preserves original provenance, rollback, budget and packed bytes", async () => {
  const appearanceDirectory = path.join(gameDirectory, "arena-appearance");
  const metadata = JSON.parse(await readFile(
    path.join(appearanceDirectory, "materials", "ground.json"),
    "utf8"
  ));
  const provenance = metadata.provenance.stormEye;
  const floorPath = path.join(appearanceDirectory, metadata.maps.stormEye);
  const sourceFile = path.join(appearanceDirectory, provenance.source);
  const legacyPath = path.join(appearanceDirectory, "textures", "ground", "floor-pit.webp");
  const [floor, source, legacy, packedTextures, renderer] = await Promise.all([
    readFile(floorPath),
    readFile(sourceFile),
    readFile(legacyPath),
    readFile(path.join(appearanceDirectory, "load-arena-appearance.js"), "utf8"),
    readFile(path.join(gameDirectory, "draw-bomber-rift.js"), "utf8")
  ]);

  assert.equal(
    path.basename(floorPath),
    "floor-storm-eye-combat-field-99509f91.webp"
  );
  assert.deepEqual(webpDimensions(floor), { width: 1024, height: 1024 });
  const sourceSize = pngDimensions(source);
  assert.ok(sourceSize.width >= 1024 && sourceSize.height >= 1024);
  assert.equal(source[25], 2, "the native PNG must be RGB truecolor without alpha");
  assert.equal(webpInfo(floor).hasAlpha, false, "the runtime WebP must not carry alpha");
  assert.ok(floor.length <= 200_000, `Storm-Eye floor is ${floor.length} B; ceiling is 200000 B`);
  assert.ok(floor.length < legacy.length, "the promoted floor must remain smaller than its rollback");
  assert.equal(floor.length, provenance.assetByteLength);
  assert.deepEqual(provenance.assetDimensions, [1024, 1024]);
  assert.deepEqual(provenance.thirdPartyInputs, []);
  assert.equal(sha256(source), provenance.sourceSha256);
  assert.equal(sha256(floor), provenance.assetSha256);
  assert.equal(provenance.assetSha256.slice(0, 8), "99509f91");
  assert.equal(
    sha256(legacy),
    "031e0e828a198761da3807240615fd87e7f68c6dc769e5ad8c5d77edb1ccc6ce",
    "the legacy floor must remain byte-identical for rollback"
  );

  const packedFloor = packedTextures.match(
    /"floorPit":"data:image\/webp;base64,([^"]+)"/
  );
  assert.ok(packedFloor, "offline arena pack must include the promoted floorPit");
  assert.deepEqual(Buffer.from(packedFloor[1], "base64"), floor);
  assert.match(
    renderer,
    /this\.arenaFloorProfile = floorKey === "floorLattice" \|\| floorKey === "floorPit"\s*\? 1\s*: 0/
  );

  const bindStart = renderer.indexOf("      bindArenaTheme(theme) {");
  const bindEnd = renderer.indexOf("\n      themeColor(", bindStart);
  assert.ok(bindStart >= 0 && bindEnd > bindStart);
  const bindArenaTheme = new Function(
    `"use strict"; return ({ ${renderer.slice(bindStart, bindEnd).trim()} }).bindArenaTheme;`
  )();
  const textureKeys = [
    "floorLattice", "floorClearing", "floorLabyrinth", "floorForts", "floorPit",
    "wallLattice", "wallTopLattice"
  ];
  const subject = {
    arenaTextures: Object.fromEntries(textureKeys.map((key) => [key, { key }])),
    arenaMapTextures: Object.create(null)
  };
  for (const [floorKey, expectedProfile] of [
    ["floorLattice", 1],
    ["floorPit", 1],
    ["floorClearing", 0],
    ["floorLabyrinth", 0],
    ["floorForts", 0]
  ]) {
    bindArenaTheme.call(subject, {
      floor: floorKey,
      wall: "wallLattice",
      wallTop: "wallTopLattice"
    });
    assert.equal(subject.arenaFloorProfile, expectedProfile, `${floorKey} profile`);
  }

  const detailStart = renderer.indexOf("vec3 sampleCombatBandDetail");
  const detailEnd = renderer.indexOf("\n      }", detailStart);
  const bumpStart = renderer.indexOf("vec3 bumpFromAlbedo");
  const bumpEnd = renderer.indexOf("\n      }", bumpStart);
  assert.ok(detailStart >= 0 && detailEnd > detailStart);
  assert.ok(bumpStart >= 0 && bumpEnd > bumpStart);
  assert.equal((renderer.slice(detailStart, detailEnd).match(/texture\(/g) || []).length, 2);
  assert.equal((renderer.slice(bumpStart, bumpEnd).match(/texture\(/g) || []).length, 3);
  const profileStart = renderer.indexOf("if (uFloorProfile > 0.5)");
  const profileEnd = renderer.indexOf("\n            } else {", profileStart);
  assert.ok(profileStart >= 0 && profileEnd > profileStart);
  const profileBranch = renderer.slice(profileStart, profileEnd);
  assert.equal((profileBranch.match(/sampleCombatBandDetail\(/g) || []).length, 1);
  assert.equal((profileBranch.match(/bumpFromAlbedo\(/g) || []).length, 1);
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

test("combat health is rendered over contestants instead of inside the skill HUD", async () => {
  const sourceDocument = await readFile(sourcePath, "utf8");
  const renderer = await readFile(path.join(gameDirectory, "draw-bomber-rift.js"), "utf8");
  const styles = await readFile(path.join(gameDirectory, "show-champion-duel.css"), "utf8");

  assert.match(sourceDocument, /id="character-health-layer"/);
  assert.doesNotMatch(sourceDocument, /id="health-fill"/);
  assert.doesNotMatch(sourceDocument, /id="player-two-health(?:-fill)?"/);
  assert.match(renderer, /syncCharacterHealthDom\(game\.players \|\| \[player\]\)/);
  assert.match(renderer, /const level = \(player\.skillsUnlocked \|\| \[\]\)\.filter\(Boolean\)\.length/);
  assert.match(renderer, /canvasRect\.left \+ uv\[0\] \* canvasRect\.width/);
  assert.match(renderer, /champion === "renekton" \? 2\.55/);
  assert.match(styles, /\.character-health__track/);
  assert.match(styles, /repeating-linear-gradient/);
  assert.match(styles, /#78df48/);
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
    profiles: [{ id: "v1-renekton", name: "V1 Renekton", champion: "renekton" }],
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
  // The training menu selects a bot identity, which selects its compatible
  // champion and policy as one atomic product choice.
  assert.equal(v1Match.selectBotOpponent("v1-renekton"), true);
  assert.equal(v1Match.selectedBot, "v1-renekton");
  assert.equal(v1Match.selectedChampion2, "renekton");
  assert.equal(v1Match.botPolicy.champion, "renekton");
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

test("the modern client presents the V1 opponent as a measured product", async () => {
  const sourceDocument = await readFile(sourcePath, "utf8");
  const startup = await readFile(path.join(gameDirectory, "start-champion-duel.js"), "utf8");
  const onlineRuntime = await readFile(path.join(repositoryRoot, "online", "public", "online-duel.js"), "utf8");
  const client = await readFile(path.join(repositoryRoot, "online", "app", "page.tsx"), "utf8");
  const clientData = await readFile(path.join(repositoryRoot, "online", "app", "riftbomb-client.ts"), "utf8");
  const profile = await readFile(path.join(repositoryRoot, "bot-opponent", "v1", "bot-profile.mjs"), "utf8");

  assert.match(sourceDocument, /id="runtime-bootstrap"[^>]+hidden/);
  assert.doesNotMatch(sourceDocument, /data-match-mode|id="bot-roster"/);
  assert.match(startup, /game\.activateBotOpponent\(\)/);
  assert.match(client, /activeMode === "solo"[\s\S]*OPONENTE DE TREINO/);
  assert.match(client, /bot: TRAINING_BOT\.id/);
  assert.match(clientData, /id: "v1-renekton"/);
  assert.match(onlineRuntime, /game\.selectBotOpponent\(payload\.bot\)/);
  assert.match(profile, /id: "v1-renekton"/);
  assert.match(profile, /champion: "renekton"/);
  assert.match(profile, /level: 4, maximum: 5/);
  assert.match(profile, /100 partidas · seed 42/);
});

test("the obsolete red setup frontend cannot return through source or runtime assets", async () => {
  const [sourceDocument, gameStyles, startup, client, clientStyles, onlineRuntime, onlineStyles] =
    await Promise.all([
      readFile(sourcePath, "utf8"),
      readFile(path.join(gameDirectory, "show-champion-duel.css"), "utf8"),
      readFile(path.join(gameDirectory, "start-champion-duel.js"), "utf8"),
      readFile(path.join(repositoryRoot, "online", "app", "page.tsx"), "utf8"),
      readFile(path.join(repositoryRoot, "online", "app", "globals.css"), "utf8"),
      readFile(path.join(repositoryRoot, "online", "public", "online-duel.js"), "utf8"),
      readFile(path.join(repositoryRoot, "online", "public", "online-duel.css"), "utf8"),
    ]);

  assert.match(sourceDocument, /id="runtime-bootstrap" hidden aria-hidden="true"/);
  assert.doesNotMatch(sourceDocument, /id="intro"|class="intro|UNOFFICIAL FAN PROTOTYPE|Champions of the Bomber Rift/);
  assert.doesNotMatch(gameStyles, /(?:^|[,{]\s*)\.intro\b|#intro|champion-select|arena-select|match-mode-selector|bot-card/);
  assert.match(startup, /window\.self === window\.top && !modelReviewMode/);
  assert.doesNotMatch(client, /LegacyClient|legacy=1|Interface clássica/);
  assert.doesNotMatch(clientStyles, /game-shell--legacy|classic-link|legacy-return/);
  assert.doesNotMatch(onlineRuntime, /online-panel|intro-actions|intro-lede|intro-notes/);
  assert.doesNotMatch(onlineStyles, /online-panel|online-connection|online-action-alert/);
  assert.match(onlineRuntime, /runtime-network-controls/);
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
  assert.match(renderer, /animation\.componentsPerTexel \|\| 4/);
  assert.match(renderer, /layout\.texelCount \* componentsPerTexel/);
  assert.match(renderer, /const componentsPerTexel = cpu\.componentsPerTexel \|\| 4/);
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

test("real ability casts select their authored VAT actions across the roster", async () => {
  const renderer = await readFile(path.join(gameDirectory, "draw-bomber-rift.js"), "utf8");
  const resolverStart = renderer.indexOf("      resolveChampionAnimation(player, t, key) {");
  const resolverEnd = renderer.indexOf("      resolveVladimirAnimation(player, t)", resolverStart);
  assert.ok(resolverStart >= 0 && resolverEnd > resolverStart);

  const ResolverHarness = new Function(
    "clamp",
    "prefersReducedMotion",
    "modelReviewMode",
    "modelReviewTarget",
    "modelReviewAction",
    "requestedModelReviewFrame",
    `return class ResolverHarness {
      constructor() { this.championAnimationStates = new Map(); }
      sampleChampionAction(animation, action, progress) {
        const clipKey = animation.actions[action];
        return clipKey ? { key: action, clipKey, progress } : null;
      }
      ${renderer.slice(resolverStart, resolverEnd).trim()}
    };`
  )(
    (value, min, max) => Math.max(min, Math.min(max, value)),
    true,
    false,
    "",
    "",
    0
  );

  const expectedActions = {
    katarina: ["q", "w", "e", "r"],
    zed: ["q", "w", "e", "r"],
    renekton: ["q", "w", "e", "r"],
    vladimir: ["q", "poolDown", "e", "r"],
    gangplank: ["q", "w", "e", "r"]
  };
  const expectedDurations = {
    katarina: [0.42, 0.42, 0.42, 1.65],
    zed: [0.48, 0.48, 0.52, 0.6],
    renekton: [0.58, 0.56, 0.46, 0.72],
    vladimir: [0.56, 1.45, 0.62, 0.66],
    gangplank: [0.48, 0.4, 0.42, 0.7]
  };
  const correctedRoutes = new Set([
    "katarina:w", "katarina:e", "zed:w", "renekton:w", "gangplank:w"
  ]);

  for (const [champion, actions] of Object.entries(expectedActions)) {
    const metadata = JSON.parse(await readFile(
      path.join(repositoryRoot, "champions", champion, "playable-model",
        `${champion}-model-metadata.json`),
      "utf8"
    ));
    for (let slot = 0; slot < actions.length; slot += 1) {
      const game = await createAuthoritativeDuel({
        hostChampion: champion,
        guestChampion: "katarina",
        seed: 600 + slot
      });
      const player = game.players[0];
      const rival = game.players[1];
      player.skillsUnlocked = [true, true, true, true];
      player.invulnerable = 0;
      player.stunned = 0;
      player.lastDx = 0;
      player.lastDz = 1;
      player.facing = 0;
      rival.x = player.x;
      rival.z = player.z + 0.8;
      rival.alive = true;
      rival.invulnerable = 0;
      game.daggers.push({
        id: 999,
        ownerId: player.id,
        x: rival.x,
        z: rival.z,
        age: 1,
        readyAt: 0,
        life: 5
      });
      if (champion === "zed" && slot === 1) {
        rival.x = player.x - 8;
        rival.z = player.z - 8;
        for (let distance = 1; distance <= 3; distance += 1) {
          const cell = game.cellFromWorld(player.x, player.z + game.tile * distance);
          if (game.grid[cell.r]) game.grid[cell.r][cell.c] = 0;
        }
        game.bombs = [];
      }
      if (champion === "gangplank" && slot === 2) {
        const cell = game.cellFromWorld(player.x, player.z + game.tile);
        if (game.grid[cell.r]) game.grid[cell.r][cell.c] = 0;
        game.bombs = [];
      }

      assert.equal(game.castAbility(slot, player, { buffer: false }), true,
        `${champion} ${"QWER"[slot]} cast must execute`);
      assert.equal(player.abilityAnimAction, "qwer"[slot],
        `${champion} ${"QWER"[slot]} must publish its semantic action`);
      assert.equal(player.abilityAnimDuration, expectedDurations[champion][slot]);
      assert.equal(player.abilityAnimRemaining, expectedDurations[champion][slot]);
      const resolver = new ResolverHarness();
      resolver[`${champion}Animation`] = {
        frameCount: metadata.frameCount,
        actions: metadata.animationActions,
        clips: metadata.animationClips
      };
      const frame = resolver.resolveChampionAnimation(player, 1, champion);
      const expectedAction = actions[slot];
      assert.equal(frame?.key, expectedAction,
        `${champion} ${"QWER"[slot]} must select ${expectedAction}`);
      assert.equal(frame?.clipKey, metadata.animationActions[expectedAction],
        `${champion} ${"QWER"[slot]} must select its authored clip`);

      if (champion === "zed" && slot === 1) {
        const shadow = game.zedShadows.find((candidate) => candidate.kind === "living");
        assert.ok(shadow, "Living Shadow must create a rendered shadow actor");
        assert.equal(shadow.abilityAnimAction, "w");
        assert.equal(shadow.abilityAnimRemaining, 0.48);
        assert.equal(resolver.resolveChampionAnimation(shadow, 1, champion)?.key, "w",
          "Living Shadow must mirror the authored W clip when it appears");
        assert.equal(game.castAbility(1, player, { buffer: false }), true,
          "Living Shadow must support its immediate exchange recast");
        assert.equal(shadow.abilityAnimAction, "w");
        assert.equal(shadow.abilityAnimRemaining, 0.48,
          "the exchanged shadow body must restart the W clip");
        assert.equal(resolver.resolveChampionAnimation(shadow, 1.01, champion)?.key, "w");
      }

      if (correctedRoutes.has(`${champion}:${expectedAction}`)) {
        if (champion === "renekton" && slot === 1) {
          game.updateContestant(player, 0.51);
          assert.ok(player.abilityAnimRemaining > 0.049 && player.abilityAnimRemaining < 0.051,
            "Renekton W must retain its semantic clip through the final 50 ms");
          assert.equal(resolver.resolveChampionAnimation(player, 1.51, champion)?.key, "w",
            "Renekton W must not flicker to Q near recovery");
          game.updateContestant(player, 0.06);
        } else {
          game.updateContestant(player, 1);
        }
        if (champion === "gangplank") game.updateGangplank(1);
        assert.equal(player.abilityAnimAction, "");
        assert.equal(player.abilityAnimRemaining, 0);
        assert.equal(player.abilityAnimDuration, 0);
        assert.equal(resolver.resolveChampionAnimation(player, 2, champion)?.key, "idle",
          `${champion} ${expectedAction} must return to locomotion`);
      }
    }
  }

  const stagedZed = await createAuthoritativeDuel({
    hostChampion: "zed", guestChampion: "katarina", seed: 703
  });
  const [stagedPlayer, stagedTarget] = stagedZed.players;
  stagedZed.p2Human = true;
  stagedPlayer.skillsUnlocked = [true, true, true, true];
  stagedPlayer.invulnerable = 0;
  stagedPlayer.x = 0;
  stagedPlayer.z = 0;
  stagedTarget.x = 0;
  stagedTarget.z = 2;
  stagedTarget.invulnerable = 0;
  for (let row = 1; row < stagedZed.rows - 1; row += 1) {
    for (let column = 1; column < stagedZed.cols - 1; column += 1) {
      stagedZed.grid[row][column] = 0;
    }
  }
  assert.equal(stagedZed.castAbility(3, stagedPlayer, { buffer: false }), true);
  stagedZed.update(0.6);
  assert.equal(stagedPlayer.abilityAnimAction, "rStrike");
  assert.equal(stagedPlayer.abilityAnimDuration, 0.35);
  assert.equal(stagedPlayer.abilityAnimRemaining, 0.35);
  const stagedMetadata = JSON.parse(await readFile(
    path.join(repositoryRoot, "champions", "zed", "playable-model", "zed-model-metadata.json"),
    "utf8"
  ));
  const stagedResolver = new ResolverHarness();
  stagedResolver.zedAnimation = {
    frameCount: stagedMetadata.frameCount,
    actions: stagedMetadata.animationActions,
    clips: stagedMetadata.animationClips
  };
  const strikeFrame = stagedResolver.resolveChampionAnimation(stagedPlayer, 1.6, "zed");
  assert.equal(strikeFrame?.key, "rStrike");
  assert.equal(strikeFrame?.clipKey, stagedMetadata.animationActions.rStrike,
    "the dash phase must route to Zed's authored Spell4_Strike clip");

  const buffered = await createAuthoritativeDuel({
    hostChampion: "gangplank",
    guestChampion: "katarina",
    seed: 704
  });
  const bufferedPlayer = buffered.players[0];
  bufferedPlayer.skillsUnlocked = [true, true, true, true];
  bufferedPlayer.invulnerable = 0;
  bufferedPlayer.wCooldown = 0.1;
  assert.equal(buffered.castAbility(1, bufferedPlayer), true);
  assert.equal(bufferedPlayer.abilityAnimAction, "",
    "a buffered command must not publish an action before execution");
  buffered.updateContestant(bufferedPlayer, 0.11);
  buffered.processAbilityBuffer(0.11);
  assert.equal(bufferedPlayer.abilityAnimAction, "w",
    "the buffered executeAbility path must publish the authored action");
  assert.equal(bufferedPlayer.abilityAnimRemaining, 0.4);

  const rejected = await createAuthoritativeDuel({
    hostChampion: "katarina",
    guestChampion: "katarina",
    seed: 705
  });
  const rejectedPlayer = rejected.players[0];
  const rejectedRival = rejected.players[1];
  rejectedPlayer.skillsUnlocked = [true, true, true, true];
  rejectedPlayer.invulnerable = 0;
  rejected.daggers = [];
  rejected.pickups = [];
  rejectedRival.x = rejectedPlayer.x + rejected.tile * 8;
  rejectedRival.z = rejectedPlayer.z + rejected.tile * 8;
  assert.equal(rejected.castAbility(2, rejectedPlayer, { buffer: false }), false);
  assert.equal(rejectedPlayer.abilityAnimAction, "",
    "a rejected spatial cast must not publish an animation action");
  assert.equal(rejectedPlayer.abilityAnimRemaining, 0);

  const flashbackSequences = [
    { champion: "renekton", first: 1, second: 2, elapsed: 0.47, staleTimer: "renektonSlashAnim" },
    { champion: "gangplank", first: 3, second: 0, elapsed: 0.49, staleTimer: "gangplankUltAnim" }
  ];
  for (const sequence of flashbackSequences) {
    const game = await createAuthoritativeDuel({
      hostChampion: sequence.champion,
      guestChampion: "katarina",
      seed: 710 + sequence.first
    });
    const player = game.players[0];
    const rival = game.players[1];
    player.skillsUnlocked = [true, true, true, true];
    player.invulnerable = 0;
    player.stunned = 0;
    player.lastDx = 0;
    player.lastDz = 1;
    player.facing = 0;
    rival.x = player.x;
    rival.z = player.z + 0.8;
    rival.alive = true;
    rival.invulnerable = 0;
    assert.equal(game.castAbility(sequence.first, player, { buffer: false }), true);
    assert.equal(game.castAbility(sequence.second, player, { buffer: false }), true);
    assert.equal(player.abilityAnimAction, "qwer"[sequence.second]);
    game.updateContestant(player, sequence.elapsed);
    if (sequence.champion === "gangplank") game.updateGangplank(sequence.elapsed);
    assert.ok(player[sequence.staleTimer] > 0,
      `${sequence.champion} must retain its independent procedural timer for this regression`);

    const metadata = JSON.parse(await readFile(
      path.join(repositoryRoot, "champions", sequence.champion, "playable-model",
        `${sequence.champion}-model-metadata.json`),
      "utf8"
    ));
    const resolver = new ResolverHarness();
    resolver[`${sequence.champion}Animation`] = {
      frameCount: metadata.frameCount,
      actions: metadata.animationActions,
      clips: metadata.animationClips
    };
    assert.equal(resolver.resolveChampionAnimation(player, 4, sequence.champion)?.key, "idle",
      `${sequence.champion} must not flash back to an older ability after a newer cast ends`);
  }

  const canceled = await createAuthoritativeDuel({
    hostChampion: "katarina",
    guestChampion: "katarina",
    seed: 720
  });
  const canceledPlayer = canceled.players[0];
  const canceledRival = canceled.players[1];
  canceledPlayer.skillsUnlocked = [true, true, true, true];
  canceledPlayer.invulnerable = 0;
  canceledRival.x = canceledPlayer.x;
  canceledRival.z = canceledPlayer.z + 0.8;
  canceledRival.invulnerable = 0;
  assert.equal(canceled.castAbility(3, canceledPlayer, { buffer: false }), true);
  assert.equal(canceledPlayer.abilityAnimAction, "r");
  canceled.keys.add("KeyD");
  canceled.updateContestant(canceledPlayer, 0.01);
  assert.equal(canceledPlayer.ultChannel, 0, "movement must cancel Death Lotus");
  assert.equal(canceledPlayer.abilityAnimAction, "",
    "canceling Death Lotus must also stop its authored VAT action");
  assert.equal(canceledPlayer.abilityAnimRemaining, 0);
  assert.equal(canceledPlayer.abilityAnimDuration, 0);
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

test("arena modular kit packs eighteen authored texture sources", async () => {
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
    18,
    "the offline build must embed each modular kit source once, including Nacre growth"
  );
});

test("Nacre Hollow renders its authored shell kit instead of generic crates", async () => {
  const document = await readFile(sourcePath, "utf8");
  const renderer = await readFile(path.join(gameDirectory, "draw-bomber-rift.js"), "utf8");
  const nacre = await readFile(
    path.join(gameDirectory, "arena-appearance", "draw-nacre-hollow.js"),
    "utf8"
  );

  assert.match(document, /arena-appearance\/draw-nacre-hollow\.js/);
  assert.match(renderer, /RIFTBOMB_NACRE_APPEARANCE\.isTheme\(theme\)/);
  assert.match(renderer, /nacreAppearance\.drawBreakableTile/);
  assert.match(nacre, /theme\?\.floor === "floorClearing"/);
  assert.match(nacre, /buildGrowthMesh/);
  assert.match(renderer, /this\.meshes\.nacreGrowth/);
  assert.match(renderer, /nacreGrowth:\s*\["nacreGrowth"\]/);
  assert.match(renderer, /uMapId > 4\.5 && uMapId < 5\.5/);
  assert.match(nacre, /drawFloorOrnaments/);
  assert.match(nacre, /drawBreakableTile/);
});

test("the authored black bomb and explosion sequence drive live gameplay", async () => {
  const bombDirectory = path.join(gameDirectory, "arena-appearance", "bomb");
  const [document, renderer, appearance, bombReference, explosionReference, specSource] =
    await Promise.all([
      readFile(sourcePath, "utf8"),
      readFile(path.join(gameDirectory, "draw-bomber-rift.js"), "utf8"),
      readFile(path.join(gameDirectory, "arena-appearance", "draw-black-bomb.js"), "utf8"),
      readFile(path.join(bombDirectory, "black-bomb-reference.png")),
      readFile(path.join(bombDirectory, "black-bomb-explosion-reference.png")),
      readFile(path.join(bombDirectory, "black-bomb-sculpt-spec.json"), "utf8"),
    ]);
  const spec = JSON.parse(specSource);

  assert.equal(bombReference.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(explosionReference.subarray(1, 4).toString("ascii"), "PNG");
  assert.match(document, /arena-appearance\/draw-black-bomb\.js[\s\S]*draw-bomber-rift\.js/);
  assert.match(renderer, /RIFTBOMB_BOMB_APPEARANCE\.drawBomb\(this, bomb/);
  assert.match(renderer, /RIFTBOMB_BOMB_APPEARANCE\.drawExplosion\(this, blast/);
  assert.match(appearance, /function drawArmorPetals/);
  assert.match(appearance, /for \(let index = 0; index < 6; index\+\+\)/);
  assert.match(appearance, /function drawExplosion/);
  assert.match(appearance, /shockRadius/);
  assert.match(appearance, /SMOKE/);
  assert.ok(spec.componentTree.filter((component) => component.id.startsWith("armor-petal-")).length >= 6);
  assert.ok(spec.qualityContract.featureGroups.some((group) => group.id === "detonation-continuity"));
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
  assert.match(document, /id="runtime-bootstrap" hidden/);
  assert.match(document, /id="chrome"/);
  assert.doesNotMatch(document, /id="intro"|UNOFFICIAL FAN PROTOTYPE|Champions of the Bomber Rift/);
});
