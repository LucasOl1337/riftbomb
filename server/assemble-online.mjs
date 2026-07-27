import { readFile, writeFile, cp, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(repositoryRoot, "game/play-riftbomb.html");
const outputPath = path.join(repositoryRoot, "online.html");
const gameAudioDirectory = path.join(repositoryRoot, "game/audio");
const rootAudioDirectory = path.join(repositoryRoot, "audio");

let document = await readFile(sourcePath, "utf8");

// Reference all assets from the repository root by prefixing game/
document = document.replace(/src="\.\//g, 'src="./game/');
document = document.replace(/href="\.\//g, 'href="./game/');
// Keep the online-duel link pointing at the root online.html
document = document.replace('href="./game/online.html"', 'href="./online.html"');

// Make sure start-champion-duel.js skips its local boot, then attach the online client
document = document.replace(
  '  <script src="./game/start-champion-duel.js"></script>',
  `  <script>window.RIFTBOMB_ONLINE = true;</script>\n` +
  `  <script src="./game/start-champion-duel.js"></script>\n` +
  `  <script src="./game/online-client.js"></script>`
);

await writeFile(outputPath, document);

try {
  await access(gameAudioDirectory);
  await mkdir(rootAudioDirectory, { recursive: true });
  await cp(gameAudioDirectory, rootAudioDirectory, { recursive: true });
  console.log(`Copied audio samples → ${path.relative(repositoryRoot, rootAudioDirectory)}`);
} catch (error) {
  console.warn("Audio samples not copied:", error.message);
}

console.log(`Built ${path.relative(repositoryRoot, outputPath)}`);
