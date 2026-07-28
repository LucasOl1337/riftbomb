import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PART_SIZE = 4 * 1024 * 1024;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const onlineRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(onlineRoot, "..");
const gameSource = path.join(repositoryRoot, "riftbomb.html");
const outputDirectory = path.join(onlineRoot, "public", "riftbomb-parts");
const arenaTextureOutputDirectory = path.join(onlineRoot, "public", "arena-textures");
const championModelOutputDirectory = path.join(onlineRoot, "public", "champion-models");
const arenaTextureBundleSource = path.join(repositoryRoot, "game", "load-arena-textures.js");
const championModelBundleSource = path.join(
  repositoryRoot,
  "game",
  "load-playable-champion-models.js",
);
const championSourceDirectory = path.join(repositoryRoot, "champions");
const playableChampions = Object.freeze([
  "katarina",
  "zed",
  "renekton",
  "vladimir",
  "gangplank",
]);
const arenaTextureSourceDirectory = path.join(repositoryRoot, "game", "Assets", "textures");
const arenaTextureFiles = Object.freeze({
  crateSide: ["crates/crate-albedo.webp", "crate.webp"],
  crateTop: ["crates/crate-top-albedo.webp", "crate-top.webp"],
  floorLattice: ["ground/floor-lattice.webp", "floor-lattice.webp"],
  floorClearing: ["ground/floor-clearing.webp", "floor-clearing.webp"],
  floorLabyrinth: ["ground/floor-labyrinth.webp", "floor-labyrinth.webp"],
  wallSide: ["walls/wall-lattice.webp", "wall.webp"],
  wallTop: ["walls/wall-top-lattice.webp", "wall-top.webp"],
});

execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
  cwd: repositoryRoot,
  stdio: "inherit",
});

function replaceOnce(source, before, after) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected one online packaging match for: ${before.slice(0, 72)}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const replacements = [
  [
    'UI.matchScoreline.textContent = `${p1.name} · ${match.roundWins[0]} — ${match.roundWins[1]} · Red Ziggs`;',
    'UI.matchScoreline.textContent = `${p1.name} · ${match.roundWins[0]} — ${match.roundWins[1]} · ${p2.name}`;',
  ],
  [
    '`Round ${String(match.round).padStart(2, "0")} · ${match.p2Human ? "Local versus" : "CPU controls Red"}`;',
    '`Round ${String(match.round).padStart(2, "0")} · ${match.p2Human ? "Player 2 online/local" : "CPU controls Red"}`;',
  ],
  [
    '        this.selectedChampion = "katarina";\n        this.selectedArena = ARENA_TEMPLATES[0].id;',
    '        this.selectedChampion = "katarina";\n        this.selectedChampion2 = "ziggs";\n        this.selectedArena = ARENA_TEMPLATES[0].id;',
  ],
  [
    '        const champion = id === 1 ? this.selectedChampion : "ziggs";',
    [
      '        const champion = id === 1 ? this.selectedChampion : this.selectedChampion2;',
      '        const championNames = {',
      '          katarina: "Katarina",',
      '          zed: "Zed",',
      '          renekton: "Renekton",',
      '          vladimir: "Vladimir",',
      '          gangplank: "Gangplank",',
      '          ziggs: "Ziggs"',
      '        };',
    ].join("\n"),
  ],
  [
    [
      '          name: id === 1',
      '            ? ({ katarina: "Katarina", zed: "Zed", renekton: "Renekton", vladimir: "Vladimir", gangplank: "Gangplank" }[champion] || "Blue Ziggs")',
      '            : "Red Ziggs",',
    ].join("\n"),
    '          name: `${id === 1 ? "Blue" : "Red"} ${championNames[champion] || "Ziggs"}`,',
  ],
  [
    [
      '      selectChampion(champion) {',
      '        if (!["katarina", "zed", "renekton", "vladimir", "gangplank", "ziggs"].includes(champion) || this.mode !== "intro") return;',
      '        this.selectedChampion = champion;',
      '        void this.renderer.ensureChampionModel?.(champion);',
      '        this.resetPlayers();',
      '        this.presentation.update(this);',
      '      }',
    ].join("\n"),
    [
      '      selectChampion(champion) {',
      '        if (!["katarina", "zed", "renekton", "vladimir", "gangplank", "ziggs"].includes(champion) || this.mode !== "intro") return;',
      '        this.selectedChampion = champion;',
      '        void this.renderer.ensureChampionModel?.(champion);',
      '        this.resetPlayers();',
      '        this.presentation.update(this);',
      '      }',
      '',
      '      selectChampion2(champion) {',
      '        if (!["katarina", "zed", "renekton", "vladimir", "gangplank", "ziggs"].includes(champion) || this.mode !== "intro") return;',
      '        this.selectedChampion2 = champion;',
      '        void this.renderer.ensureChampionModel(champion);',
      '        this.resetPlayers();',
      '        this.presentation.update(this);',
      '      }',
    ].join("\n"),
  ],
  [
    'this.presentation.announce("Player 2 joined · Red Ziggs is local");',
    'this.presentation.announce(`Player 2 joined · ${p2.name} is local`);',
  ],
  [
    'this.presentation.announce("Death Lotus needs Red Ziggs nearby");',
    'this.presentation.announce("Death Lotus needs the rival nearby");',
  ],
  [
    'this.presentation.announce("Death Mark needs Red Ziggs in range");',
    'this.presentation.announce("Death Mark needs the rival in range");',
  ],
  [
    [
      '      UI.live.textContent = game.player.champion !== "ziggs"',
      '        ? `Rift Bomber · ${arenaName}. ${game.player.name} uses WASD, Q/F/E/R and Space. Red Ziggs uses arrows and Enter.`',
      '        : `Rift Bomber · ${arenaName}. Blue Ziggs uses WASD, Q and Shift. Red Ziggs uses arrows and Enter.`;',
    ].join("\n"),
    [
      '      UI.live.textContent =',
      '        `Rift Bomber · ${arenaName}. ${game.players[0].name} versus ${game.players[1].name}.`;',
    ].join("\n"),
  ],
];

let onlineGame = await readFile(gameSource, "utf8");
for (const [before, after] of replacements) {
  onlineGame = replaceOnce(onlineGame, before, after);
}

const embeddedArenaTextures = await readFile(arenaTextureBundleSource, "utf8");
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
  if (metadata.runtime === "vat-v1") {
    const [frames, normals] = await Promise.all([
      readFile(path.join(directory, `${champion}-model-frames.bin`)),
      readFile(path.join(directory, `${champion}-model-normals.bin`)),
    ]);
    Object.assign(payload, {
      frames: frames.toString("base64"),
      normals: normals.toString("base64"),
      animation: {
        runtime: metadata.runtime,
        vertexCount: metadata.vertexCount,
        frameCount: metadata.frameCount,
        textureDimensions: metadata.textureDimensions,
        positionMin: metadata.positionBounds.min,
        positionRange: metadata.positionBounds.range,
        clips: metadata.animationClips,
      },
    });
  }
  return payload;
}

const championModelPayloads = Object.fromEntries(
  await Promise.all(
    playableChampions.map(async (champion) => [
      champion,
      await playableChampionPayload(champion),
    ]),
  ),
);
const embeddedChampionModels = await readFile(championModelBundleSource, "utf8");
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

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
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
  playableChampions.map((champion) =>
    writeFile(
      path.join(championModelOutputDirectory, `${champion}.js`),
      [
        '"use strict";',
        `window.RIFTBOMB_PLAYABLE_CHAMPIONS.${champion} = Object.freeze(${JSON.stringify(championModelPayloads[champion])});`,
        "",
      ].join("\n"),
    ),
  ),
);

for (let index = 0; index < partCount; index += 1) {
  const name = `part-${String(index).padStart(2, "0")}`;
  const start = index * PART_SIZE;
  await writeFile(
    path.join(outputDirectory, name),
    game.subarray(start, start + PART_SIZE),
  );
}

await writeFile(
  path.join(outputDirectory, "manifest.json"),
  `${JSON.stringify({
    version: 1,
    partCount,
    partSize: PART_SIZE,
    byteLength: game.length,
    sha256,
  }, null, 2)}\n`,
);

console.log(`Packed Riftbomb into ${partCount} web parts.`);
