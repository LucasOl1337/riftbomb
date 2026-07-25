import fs from "node:fs/promises";
import path from "node:path";

const [htmlPath, bakedDirectory] = process.argv.slice(2);
if (!htmlPath || !bakedDirectory) {
  throw new Error("Usage: node embed-katarina.mjs <game.html> <baked-directory>");
}

const encode = async (fileName) => (await fs.readFile(path.join(bakedDirectory, fileName))).toString("base64");
const [vertices, indices, texture] = await Promise.all([
  encode("katarina-model-vertices.bin"),
  encode("katarina-model-indices.bin"),
  encode("katarina-model-texture.webp")
]);

let html = await fs.readFile(htmlPath, "utf8");
const replacements = [
  [
    /const KATARINA_MODEL_VERTICES = "[^"]*";/,
    `const KATARINA_MODEL_VERTICES = "${vertices}";`
  ],
  [
    /const KATARINA_MODEL_INDICES = "[^"]*";/,
    `const KATARINA_MODEL_INDICES = "${indices}";`
  ],
  [
    /const KATARINA_MODEL_TEXTURE = "data:image\/webp;base64,[^"]*";/,
    `const KATARINA_MODEL_TEXTURE = "data:image/webp;base64,${texture}";`
  ]
];

for (const [pattern, replacement] of replacements) {
  if (!pattern.test(html)) throw new Error(`Missing HTML embed target: ${pattern}`);
  html = html.replace(pattern, replacement);
}

await fs.writeFile(htmlPath, html, "utf8");
console.log(JSON.stringify({
  html: htmlPath,
  embeddedBytes: {
    vertices: Math.floor(vertices.length * 0.75),
    indices: Math.floor(indices.length * 0.75),
    texture: Math.floor(texture.length * 0.75)
  }
}, null, 2));
