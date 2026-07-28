import { execSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PART_SIZE = 4 * 1024 * 1024;
const EXPECTED_PARTS = 10;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const onlineRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(onlineRoot, "..");
const gameSource = path.join(repositoryRoot, "riftbomb.html");
const outputDirectory = path.join(onlineRoot, "public", "riftbomb-parts");

execSync("npm run build", {
  cwd: repositoryRoot,
  stdio: "inherit",
  shell: process.platform === "win32" ? process.env.ComSpec : "/bin/sh",
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
    'UI.matchScoreline.textContent = `${p1.name} · ${match.roundWins[0]} — ${match.roundWins[1]} · ${p2.name}`;',
    'UI.matchScoreline.textContent = `${p1.name} · ${match.roundWins[0]} — ${match.roundWins[1]} · ${p2.name}`;',
  ],
  [
    '`Round ${String(match.round).padStart(2, "0")} · ${match.p2Human ? "Local versus" : "CPU controls Red"}`;',
    '`Round ${String(match.round).padStart(2, "0")} · ${match.p2Human ? "Player 2 online/local" : "CPU controls Red"}`;',
  ],
  [
    '        this.selectedChampion = "katarina";\n        this.selectedArena = ARENA_TEMPLATES[0].id;',
    '        this.selectedChampion = "katarina";\n        this.selectedChampion2 = "gangplank";\n        this.selectedArena = ARENA_TEMPLATES[0].id;',
  ],
  [
    '        const champion = id === 1 ? this.selectedChampion : "gangplank";',
    [
      '        const champion = id === 1 ? this.selectedChampion : this.selectedChampion2;',
      '        const championNames = {',
      '          katarina: "Katarina",',
      '          zed: "Zed",',
      '          renekton: "Renekton",',
      '          vladimir: "Vladimir",',
      '          gangplank: "Gangplank",',
      '        };',
    ].join("\n"),
  ],
  [
    [
      '          name: id === 1',
      '            ? ({ katarina: "Katarina", zed: "Zed", renekton: "Renekton", vladimir: "Vladimir", gangplank: "Gangplank" }[champion] || "Champion")',
      '            : "Red Gangplank",',
    ].join("\n"),
    '          name: `${id === 1 ? "Blue" : "Red"} ${championNames[champion] || "Champion"}`,',
  ],
  [
    [
      '      selectChampion(champion) {',
      '        if (!["katarina", "zed", "renekton", "vladimir", "gangplank"].includes(champion) || this.mode !== "intro") return;',
      '        this.selectedChampion = champion;',
      '        this.resetPlayers();',
      '        this.presentation.update(this);',
      '      }',
    ].join("\n"),
    [
      '      selectChampion(champion) {',
      '        if (!["katarina", "zed", "renekton", "vladimir", "gangplank"].includes(champion) || this.mode !== "intro") return;',
      '        this.selectedChampion = champion;',
      '        this.resetPlayers();',
      '        this.presentation.update(this);',
      '      }',
      '',
      '      selectChampion2(champion) {',
      '        if (!["katarina", "zed", "renekton", "vladimir", "gangplank"].includes(champion) || this.mode !== "intro") return;',
      '        this.selectedChampion2 = champion;',
      '        this.resetPlayers();',
      '        this.presentation.update(this);',
      '      }',
    ].join("\n"),
  ],
  [
    'this.presentation.announce(`${p2?.name || "Player 2"} joined locally`);',
    'this.presentation.announce(`${p2?.name || "Player 2"} joined locally`);',
  ],
  [
    'this.presentation.announce(`Death Lotus needs ${this.players[1]?.name || "the rival"} nearby`);',
    'this.presentation.announce(`Death Lotus needs ${this.players[1]?.name || "the rival"} nearby`);',
  ],
  [
    'this.presentation.announce(`Death Mark needs ${this.players[1]?.name || "the rival"} in range`);',
    'this.presentation.announce(`Death Mark needs ${this.players[1]?.name || "the rival"} in range`);',
  ],
  [
    [
      '      UI.live.textContent =',
      '        `Rift Bomber · ${arenaName}. ${game.player.name} uses WASD, Q/F/E/R and Space. ${game.players[1].name} uses arrows and Enter.`;',
    ].join("\n"),
    [
      '      UI.live.textContent =',
      '        `Rift Bomber · ${arenaName}. ${game.players[0].name} versus ${game.players[1].name}.`;',
    ].join("\n"),
  ],
];

let onlineGame = (await readFile(gameSource, "utf8")).replace(/\r\n/g, "\n");
for (const [before, after] of replacements) {
  onlineGame = replaceOnce(onlineGame, before, after);
}

const game = Buffer.from(onlineGame);
const partCount = Math.ceil(game.length / PART_SIZE);

if (partCount !== EXPECTED_PARTS) {
  throw new Error(
    `Expected ${EXPECTED_PARTS} Riftbomb parts, received ${partCount}. `
      + "Update the loader and this packager together.",
  );
}

await mkdir(outputDirectory, { recursive: true });

for (const entry of await readdir(outputDirectory)) {
  if (/^part-\d+$/.test(entry)) {
    await rm(path.join(outputDirectory, entry));
  }
}

for (let index = 0; index < partCount; index += 1) {
  const name = `part-${String(index).padStart(2, "0")}`;
  const start = index * PART_SIZE;
  await writeFile(
    path.join(outputDirectory, name),
    game.subarray(start, start + PART_SIZE),
  );
}

console.log(`Packed Riftbomb into ${partCount} web parts.`);
