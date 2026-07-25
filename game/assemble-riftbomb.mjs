import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const gameDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(gameDirectory);
const sourcePath = path.join(gameDirectory, "play-riftbomb.html");
const outputPath = path.join(repositoryRoot, "riftbomb.html");

const stylesheet = "show-champion-duel.css";
const scripts = [
  "animate-bomber-rift-background.js",
  "draw-bomber-rift.js",
  "play-rift-soundtrack.js",
  "run-champion-duel.js",
  "start-champion-duel.js"
];

let document = await readFile(sourcePath, "utf8");
const css = await readFile(path.join(gameDirectory, stylesheet), "utf8");

document = document.replace(
  `  <link rel="stylesheet" href="./${stylesheet}">`,
  () => `  <style>\n${css.trimEnd()}\n  </style>`
);

for (const script of scripts) {
  const source = await readFile(path.join(gameDirectory, script), "utf8");
  document = document.replace(
    `  <script src="./${script}"></script>`,
    () => `  <script>\n${source.trimEnd()}\n  </script>`
  );
}

await writeFile(outputPath, document);
console.log(`Built ${path.relative(repositoryRoot, outputPath)}`);
