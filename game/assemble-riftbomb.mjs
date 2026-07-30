import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { packagePlayableChampions } from "../champions/prepare-playable-models/package-playable-champions.mjs";
import { packageBaselineBot } from "../bot-opponent/package-baseline-bot.mjs";

const gameDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(gameDirectory);
const sourcePath = path.join(gameDirectory, "play-riftbomb.html");
const outputPath = path.join(repositoryRoot, "riftbomb.html");
const playableChampionsPath = path.join(gameDirectory, "load-playable-champion-models.js");
const baselineBotPath = path.join(gameDirectory, "load-baseline-bot.js");

async function writeGeneratedArtifact(targetPath, contents) {
  const temporaryPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.tmp`
  );
  try {
    await writeFile(temporaryPath, contents);
    // Same-directory rename publishes the complete artifact in one filesystem step.
    // Readers keep seeing the previous bundle until the replacement is ready.
    await rename(temporaryPath, targetPath);
  } finally {
    try {
      await rm(temporaryPath, { force: true });
    } catch (error) {
      console.warn(`Could not clean temporary artifact ${path.basename(temporaryPath)}:`, error);
    }
  }
}

let document = await readFile(sourcePath, "utf8");
const localStylesheets = [...document.matchAll(/<link rel="stylesheet" href="\.\/([^"]+)">/g)]
  .map((match) => match[1]);
const localScripts = [...document.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)]
  .map((match) => match[1]);

await writeFile(playableChampionsPath, await packagePlayableChampions(repositoryRoot));
await writeFile(baselineBotPath, await packageBaselineBot());

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

await writeGeneratedArtifact(outputPath, document);

console.log(`Built ${path.relative(repositoryRoot, outputPath)}`);
