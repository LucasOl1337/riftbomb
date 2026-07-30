import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";
import {
  katarinaDaggerPresentation,
  packageKatarinaDagger,
} from "../../champions/prepare-playable-models/package-playable-champions.mjs";

const PART_SIZE = 4 * 1024 * 1024;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const onlineRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(onlineRoot, "..");
const gameSource = path.join(repositoryRoot, "riftbomb.html");
const matchRulesSource = path.join(repositoryRoot, "game", "run-champion-bomb-duel.js");
const shellSource = path.join(onlineRoot, "riftbomb-shell.html");
const shellOutput = path.join(onlineRoot, "public", "riftbomb.html");
const outputDirectory = path.join(onlineRoot, "public", "riftbomb-parts");
const arenaTextureOutputDirectory = path.join(onlineRoot, "public", "arena-textures");
const championModelOutputDirectory = path.join(onlineRoot, "public", "champion-models");
const arenaTextureBundleSource = path.join(
  repositoryRoot,
  "game",
  "arena-appearance",
  "load-arena-appearance.js"
);
const championModelBundleSource = path.join(
  repositoryRoot,
  "game",
  "load-playable-champion-models.js",
);
const v1BotBundleSource = path.join(repositoryRoot, "game", "load-v1-bot.js");
const championSourceDirectory = path.join(repositoryRoot, "champions");
const playableChampions = Object.freeze([
  "katarina",
  "zed",
  "renekton",
  "vladimir",
  "gangplank",
]);
const arenaTextureSourceDirectory = path.join(
  repositoryRoot,
  "game",
  "arena-appearance",
  "textures",
);
const arenaTextureFiles = Object.freeze({
  crateSide: ["crates/crate-albedo.webp", "crate.webp"],
  crateTop: ["crates/crate-top-albedo.webp", "crate-top.webp"],
  floorLattice: [
    "ground/floor-salt-lens-combat-band-6ffb0854.webp",
    "floor-salt-lens-combat-band-6ffb0854.webp",
  ],
  floorClearing: ["ground/floor-clearing-v3.webp", "floor-clearing-v3.webp"],
  nacreGrowth: ["props/nacre-growth-albedo.webp", "nacre-growth-albedo.webp"],
  nacreScene: ["background/nacre-hollow-scene.webp", "nacre-hollow-scene.webp"],
  floorLabyrinth: ["ground/floor-labyrinth.webp", "floor-labyrinth.webp"],
  floorForts: ["ground/floor-forts.webp", "floor-forts.webp"],
  floorPit: [
    "ground/floor-storm-eye-combat-field-99509f91.webp",
    "floor-storm-eye-combat-field-99509f91.webp",
  ],
  wallLattice: ["walls/wall-lattice.webp", "wall-lattice.webp"],
  wallClearing: ["walls/wall-clearing.webp", "wall-clearing.webp"],
  wallLabyrinth: ["walls/wall-labyrinth.webp", "wall-labyrinth.webp"],
  wallForts: ["walls/wall-forts.webp", "wall-forts.webp"],
  wallPit: ["walls/wall-pit.webp", "wall-pit.webp"],
  wallTopLattice: ["walls/wall-top-lattice.webp", "wall-top-lattice.webp"],
  wallTopClearing: ["walls/wall-top-clearing.webp", "wall-top-clearing.webp"],
  wallTopLabyrinth: ["walls/wall-top-labyrinth.webp", "wall-top-labyrinth.webp"],
  wallTopForts: ["walls/wall-top-forts.webp", "wall-top-forts.webp"],
  wallTopPit: ["walls/wall-top-pit.webp", "wall-top-pit.webp"],
});

const rootBuildReady = process.argv[2] === "--root-build-ready";
if (process.argv.length > (rootBuildReady ? 3 : 2)) {
  throw new Error("Usage: package-riftbomb.mjs [--root-build-ready]");
}

if (!rootBuildReady) {
  const buildCommand = process.platform === "win32"
    ? ["cmd.exe", ["/d", "/s", "/c", "npm run build"]]
    : ["npm", ["run", "build"]];
  execFileSync(buildCommand[0], buildCommand[1], { cwd: repositoryRoot, stdio: "inherit" });
}

function replaceOnce(source, before, after) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected one online packaging match for: ${before.slice(0, 72)}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const replacements = [
  [
    'this.presentation.announce("Death Lotus needs Red Ziggs nearby");',
    'this.presentation.announce("Death Lotus needs the rival nearby");',
  ],
  [
    'this.presentation.announce("Death Mark needs Red Ziggs in range");',
    'this.presentation.announce("Death Mark needs the rival in range");',
  ],
  [
    'this.presentation.announce("Player 2 joined · Red Ziggs is local");',
    'this.presentation.announce(`Player 2 joined · ${p2.name} is local`);',
  ],
];

let onlineGame = (await readFile(gameSource, "utf8")).replace(/\r\n/g, "\n");
for (const [before, after] of replacements) {
  if (after.includes("selectChampion2(champion)") && onlineGame.includes("selectChampion2(champion)")) continue;
  if (onlineGame.includes(before)) onlineGame = replaceOnce(onlineGame, before, after);
}

// The V1 pilot bundle ships as a separate asset: the solo CPU gets the
// trained bot without inflating the initial PvP payload. The external tag
// keeps the original load order (after the baseline, before the rules);
// if the asset ever fails to load, the CPU falls back to the baseline.
const v1BotBundle = (await readFile(v1BotBundleSource, "utf8")).replace(/\r\n/g, "\n");
const v1PolicyMarker = "RIFTBOMB_BOTS.createV1Policy = createV1Policy;";
const v1PolicyIndex = onlineGame.indexOf(v1PolicyMarker);
const v1ScriptStart = onlineGame.lastIndexOf("  <script>\n", v1PolicyIndex);
const v1ScriptClosing = "  </script>\n";
const v1ScriptEnd = onlineGame.indexOf(v1ScriptClosing, v1PolicyIndex);
if (v1PolicyIndex < 0 || v1ScriptStart < 0 || v1ScriptEnd < 0) {
  throw new Error("Unable to locate the embedded V1 bot bundle");
}
onlineGame =
  onlineGame.slice(0, v1ScriptStart) +
  '  <script src="/bot-v1.js"></script>\n' +
  onlineGame.slice(v1ScriptEnd + v1ScriptClosing.length);

// Keep the editable match rules readable while avoiding a raw-shell payload
// penalty online. Whitespace-only minification preserves public identifiers
// and syntax, limiting this optimization to one well-tested embedded module.
const readableMatchRules = (await readFile(matchRulesSource, "utf8")).replace(/\r\n/g, "\n");

const compactMatchRules = await transform(readableMatchRules, {
  loader: "js",
  minifyWhitespace: true,
  minifyIdentifiers: false,
  minifySyntax: false,
  legalComments: "none",
});
onlineGame = replaceOnce(
  onlineGame,
  `  <script>\n${readableMatchRules.trimEnd()}\n  </script>`,
  `  <script>\n${compactMatchRules.code.trimEnd()}\n  </script>`,
);

const embeddedArenaTextures = (await readFile(arenaTextureBundleSource, "utf8")).replace(/\r\n/g, "\n");
const arenaTextureAliasesAt = embeddedArenaTextures.indexOf(
  "const ARENA_TEXTURES = Object.freeze({",
);
if (arenaTextureAliasesAt < 0) {
  throw new Error("Arena texture aliases are missing from the generated bundle.");
}
const onlineArenaTextureSources = Object.fromEntries(
  Object.entries(arenaTextureFiles).map(([key, [, outputName]]) => [
    key,
    `/arena-textures/${outputName}`,
  ]),
);
onlineGame = replaceOnce(
  onlineGame,
  `  <script>\n${embeddedArenaTextures.trimEnd()}\n  </script>`,
  [
    "  <script>",
    '    "use strict";',
    `    const ARENA_TEXTURE_SOURCE = Object.freeze(${JSON.stringify(onlineArenaTextureSources)});`,
    embeddedArenaTextures
      .slice(arenaTextureAliasesAt)
      .trimEnd()
      .split("\n")
      .map((line) => `    ${line}`)
      .join("\n"),
    "  </script>",
  ].join("\n"),
);

// Workers static assets hard-cap at 25 MiB per file. VAT frames/normals are
// shipped as separate .bin assets so base64 JS never blows past that limit.
const WORKERS_ASSET_MAX_BYTES = 25 * 1024 * 1024;
const embeddedChampionModels = (await readFile(championModelBundleSource, "utf8")).replace(/\r\n/g, "\n");
const katarinaDagger = await packageKatarinaDagger(repositoryRoot);

function compactConstantAlpha(buffer, componentBytes, label) {
  const sourcePixelBytes = componentBytes * 4;
  const targetPixelBytes = componentBytes * 3;
  if (buffer.byteLength % sourcePixelBytes !== 0) {
    throw new Error(`${label} does not contain complete RGBA texels`);
  }
  const compact = Buffer.allocUnsafe(buffer.byteLength / 4 * 3);
  for (
    let sourceOffset = 0, targetOffset = 0;
    sourceOffset < buffer.byteLength;
    sourceOffset += sourcePixelBytes, targetOffset += targetPixelBytes
  ) {
    for (let alphaOffset = sourceOffset + targetPixelBytes;
      alphaOffset < sourceOffset + sourcePixelBytes;
      alphaOffset += 1) {
      if (buffer[alphaOffset] !== 0xff) {
        throw new Error(`${label} has a non-constant alpha component`);
      }
    }
    buffer.copy(compact, targetOffset, sourceOffset, sourceOffset + targetPixelBytes);
  }
  return compact;
}

async function playableChampionPayload(champion) {
  const directory = path.join(championSourceDirectory, champion, "playable-model");
  const [vertices, indices, texture, metadataSource] = await Promise.all([
    readFile(path.join(directory, `${champion}-model-vertices.bin`)),
    readFile(path.join(directory, `${champion}-model-indices.bin`)),
    readFile(path.join(directory, `${champion}-model-texture.webp`)),
    readFile(path.join(directory, `${champion}-model-metadata.json`), "utf8"),
  ]);
  const metadata = JSON.parse(metadataSource);
  const payload = {
    vertices: vertices.toString("base64"),
    indices: indices.toString("base64"),
    texture: `data:image/webp;base64,${texture.toString("base64")}`,
  };
  if (champion === "katarina") {
    payload.dagger = katarinaDagger.geometry;
    payload.daggerParts = katarinaDagger.parts;
    payload.daggerPresentation = katarinaDaggerPresentation;
  }
  const binaryAssets = [];
  if (metadata.runtime === "vat-v1") {
    const [rgbaFrames, rgbaNormals] = await Promise.all([
      readFile(path.join(directory, `${champion}-model-frames.bin`)),
      readFile(path.join(directory, `${champion}-model-normals.bin`)),
    ]);
    const frames = compactConstantAlpha(rgbaFrames, Uint16Array.BYTES_PER_ELEMENT, `${champion} frames`);
    const normals = compactConstantAlpha(rgbaNormals, Uint8Array.BYTES_PER_ELEMENT, `${champion} normals`);
    const framesName = `${champion}-frames.bin`;
    const normalsName = `${champion}-normals.bin`;
    for (const [label, buffer] of [
      [framesName, frames],
      [normalsName, normals],
    ]) {
      if (buffer.byteLength >= WORKERS_ASSET_MAX_BYTES) {
        throw new Error(
          `${label} is ${buffer.byteLength} bytes; Workers assets must stay under ${WORKERS_ASSET_MAX_BYTES}`,
        );
      }
    }
    binaryAssets.push(
      { name: framesName, buffer: frames },
      { name: normalsName, buffer: normals },
    );
    Object.assign(payload, {
      framesUrl: `/champion-models/${framesName}`,
      normalsUrl: `/champion-models/${normalsName}`,
      animation: {
        runtime: metadata.runtime,
        vertexCount: metadata.vertexCount,
        frameCount: metadata.frameCount,
        textureDimensions: metadata.textureDimensions,
        componentsPerTexel: 3,
        positionMin: metadata.positionBounds.min,
        positionRange: metadata.positionBounds.range,
        // Required by resolveChampionAnimation — without actions the mesh
        // loads but every frame returns null and champions go invisible.
        actions: metadata.animationActions,
        clips: metadata.animationClips,
      },
    });
  }
  return { payload, binaryAssets };
}

const championModelBundles = Object.fromEntries(
  await Promise.all(
    playableChampions.map(async (champion) => [
      champion,
      await playableChampionPayload(champion),
    ]),
  ),
);
const onlineChampionModelSources = Object.fromEntries(
  playableChampions.map((champion) => [
    champion,
    `/champion-models/${champion}.js`,
  ]),
);
onlineGame = replaceOnce(
  onlineGame,
  `  <script>\n${embeddedChampionModels.trimEnd()}\n  </script>`,
  [
    "  <script>",
    '    "use strict";',
    "    window.RIFTBOMB_PLAYABLE_CHAMPIONS = Object.create(null);",
    "    const PLAYABLE_CHAMPIONS = window.RIFTBOMB_PLAYABLE_CHAMPIONS;",
    `    const PLAYABLE_CHAMPION_MODEL_SOURCES = Object.freeze(${JSON.stringify(onlineChampionModelSources)});`,
    "  </script>",
  ].join("\n"),
);

const game = Buffer.from(onlineGame);
const partCount = Math.ceil(game.length / PART_SIZE);
const sha256 = createHash("sha256").update(game).digest("hex");
const partsPath = `/riftbomb-parts/${sha256}`;
const versionedPartsDirectory = path.join(outputDirectory, sha256);

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(versionedPartsDirectory, { recursive: true });
await rm(arenaTextureOutputDirectory, { recursive: true, force: true });
await mkdir(arenaTextureOutputDirectory, { recursive: true });
await Promise.all(
  Object.values(arenaTextureFiles).map(([sourceName, outputName]) =>
    cp(
      path.join(arenaTextureSourceDirectory, sourceName),
      path.join(arenaTextureOutputDirectory, outputName),
    ),
  ),
);
await rm(championModelOutputDirectory, { recursive: true, force: true });
await mkdir(championModelOutputDirectory, { recursive: true });
await Promise.all(
  playableChampions.flatMap((champion) => {
    const { payload, binaryAssets } = championModelBundles[champion];
    const scriptBytes = Buffer.from(
      [
        '"use strict";',
        `window.RIFTBOMB_PLAYABLE_CHAMPIONS.${champion} = Object.freeze(${JSON.stringify(payload)});`,
        "",
      ].join("\n"),
    );
    if (scriptBytes.byteLength >= WORKERS_ASSET_MAX_BYTES) {
      throw new Error(
        `${champion}.js is ${scriptBytes.byteLength} bytes; Workers assets must stay under ${WORKERS_ASSET_MAX_BYTES}`,
      );
    }
    return [
      writeFile(path.join(championModelOutputDirectory, `${champion}.js`), scriptBytes),
      ...binaryAssets.map(({ name, buffer }) =>
        writeFile(path.join(championModelOutputDirectory, name), buffer),
      ),
    ];
  }),
);

for (let index = 0; index < partCount; index += 1) {
  const name = `part-${String(index).padStart(2, "0")}`;
  const start = index * PART_SIZE;
  await writeFile(
    path.join(versionedPartsDirectory, name),
    game.subarray(start, start + PART_SIZE),
  );
}

const manifest = {
  version: 2,
  partCount,
  partSize: PART_SIZE,
  byteLength: game.length,
  sha256,
  partsPath,
};
const shell = replaceOnce(
  await readFile(shellSource, "utf8"),
  "__RIFTBOMB_MANIFEST__",
  JSON.stringify(manifest).replaceAll("&", "&amp;").replaceAll("'", "&#39;"),
);
await Promise.all([
  writeFile(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  ),
  writeFile(shellOutput, shell),
]);

await writeFile(path.join(onlineRoot, "public", "bot-v1.js"), v1BotBundle);

console.log(`Packed Riftbomb into ${partCount} web parts.`);
