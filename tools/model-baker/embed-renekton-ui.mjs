import fs from "node:fs";
import path from "node:path";

const [
  htmlPath = "game/draw-bomber-rift.js",
  assetDir = "champions/renekton/match-icons",
  requestedChampion = "renekton"
] = process.argv.slice(2);
let html = fs.readFileSync(htmlPath, "utf8");

const champion = requestedChampion.toLowerCase();
if (!['renekton', 'vladimir'].includes(champion)) throw new Error(`Unsupported champion: ${requestedChampion}`);
const constant = champion.toUpperCase();
const marker = `const ${constant}_ASSETS = {`;
const objectStart = html.indexOf(marker);
const objectEnd = html.indexOf("\n    };", objectStart);
if (objectStart < 0 || objectEnd < 0) throw new Error(`Missing ${constant}_ASSETS object in ${htmlPath}`);
let assetObject = html.slice(objectStart, objectEnd + 7);

const files = {
  portrait: `${champion}-portrait.webp`,
  passive: `${champion}-passive.webp`,
  q: `${champion}-q.webp`,
  w: `${champion}-w.webp`,
  e: `${champion}-e.webp`,
  r: `${champion}-r.webp`
};

for (const [key, file] of Object.entries(files)) {
  const data = fs.readFileSync(path.join(assetDir, file)).toString("base64");
  const pattern = new RegExp(`(${key}: ")data:image\\/webp;base64,[^"]*(")`);
  if (!pattern.test(assetObject)) throw new Error(`Missing ${constant}_ASSETS.${key} marker in ${htmlPath}`);
  assetObject = assetObject.replace(pattern, `$1data:image/webp;base64,${data}$2`);
}

html = html.slice(0, objectStart) + assetObject + html.slice(objectEnd + 7);

fs.writeFileSync(htmlPath, html);
console.log(JSON.stringify({ html: htmlPath, embedded: files }, null, 2));
