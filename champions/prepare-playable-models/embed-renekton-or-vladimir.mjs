import fs from "node:fs/promises";
import path from "node:path";

const [htmlPath, bakedDirectory, requestedChampion = "renekton"] = process.argv.slice(2);
if (!htmlPath || !bakedDirectory) {
  throw new Error("Usage: node embed-renekton-or-vladimir.mjs <game-source> <baked-directory> [renekton|vladimir]");
}

const champion = requestedChampion.toLowerCase();
if (!['renekton', 'vladimir'].includes(champion)) throw new Error(`Unsupported champion: ${requestedChampion}`);
const constant = champion.toUpperCase();

const encode = async (name) => (await fs.readFile(path.join(bakedDirectory, name))).toString("base64");
const [vertices, indices, texture] = await Promise.all([
  encode(`${champion}-model-vertices.bin`),
  encode(`${champion}-model-indices.bin`),
  encode(`${champion}-model-texture.webp`)
]);

let html = await fs.readFile(htmlPath, "utf8");
const replacements = [
  [new RegExp(`const ${constant}_MODEL_VERTICES = "[^"]*";`), `const ${constant}_MODEL_VERTICES = "${vertices}";`],
  [new RegExp(`const ${constant}_MODEL_INDICES = "[^"]*";`), `const ${constant}_MODEL_INDICES = "${indices}";`],
  [new RegExp(`const ${constant}_MODEL_TEXTURE = "data:image\\/webp;base64,[^"]*";`),
    `const ${constant}_MODEL_TEXTURE = "data:image/webp;base64,${texture}";`]
];

for (const [pattern, replacement] of replacements) {
  if (!pattern.test(html)) throw new Error(`Missing ${constant} embed marker: ${pattern}`);
  html = html.replace(pattern, replacement);
}

await fs.writeFile(htmlPath, html);
console.log(JSON.stringify({
  html: htmlPath,
  embeddedBytes: {
    vertices: Buffer.from(vertices, "base64").byteLength,
    indices: Buffer.from(indices, "base64").byteLength,
    texture: Buffer.from(texture, "base64").byteLength
  }
}, null, 2));
