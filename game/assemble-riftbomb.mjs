import { readFile, writeFile, cp, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { packagePlayableChampions } from "../champions/prepare-playable-models/package-playable-champions.mjs";

const gameDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(gameDirectory);
const sourcePath = path.join(gameDirectory, "play-riftbomb.html");
const outputPath = path.join(repositoryRoot, "riftbomb.html");
const playableChampionsPath = path.join(gameDirectory, "load-playable-champion-models.js");
const gameAudioDirectory = path.join(gameDirectory, "audio");
const rootAudioDirectory = path.join(repositoryRoot, "audio");

let document = await readFile(sourcePath, "utf8");
const localStylesheets = [...document.matchAll(/<link rel="stylesheet" href="\.\/([^"]+)">/g)]
  .map((match) => match[1]);
const localScripts = [...document.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)]
  .map((match) => match[1]);

await writeFile(playableChampionsPath, await packagePlayableChampions(repositoryRoot));

for (const stylesheet of localStylesheets) {
  const css = await readFile(path.join(gameDirectory, stylesheet), "utf8");
  document = document.replace(
    `  <link rel="stylesheet" href="./${stylesheet}">`,
    () => `  <style>\n${css.trimEnd()}\n  </style>`
  );
}

for (const script of localScripts) {
  const source = await readFile(path.join(gameDirectory, script), "utf8");
  document = document.replace(
    `  <script src="./${script}"></script>`,
    () => `  <script>\n${source.trimEnd()}\n  </script>`
  );
}

await writeFile(outputPath, document);

// Copy real instrument samples next to the built HTML so ./audio/ resolves.
try {
  await access(gameAudioDirectory);
  await mkdir(rootAudioDirectory, { recursive: true });
  await cp(gameAudioDirectory, rootAudioDirectory, { recursive: true });
  console.log(`Copied audio samples → ${path.relative(repositoryRoot, rootAudioDirectory)}`);
} catch (error) {
  console.warn("Audio samples not copied:", error.message);
}

console.log(`Built ${path.relative(repositoryRoot, outputPath)}`);
