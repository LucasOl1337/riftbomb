import fs from "node:fs/promises";
import path from "node:path";

const [htmlPath, bakedDirectory] = process.argv.slice(2);
if (!htmlPath || !bakedDirectory) {
  throw new Error("Usage: node embed-zed.mjs <game.html> <baked-directory>");
}

const encode = async (name) => (await fs.readFile(path.join(bakedDirectory, name))).toString("base64");
const [vertices, indices, texture] = await Promise.all([
  encode("zed-model-vertices.bin"),
  encode("zed-model-indices.bin"),
  encode("zed-model-texture.webp")
]);

let html = await fs.readFile(htmlPath, "utf8");
const replacements = [
  [/const ZED_MODEL_VERTICES = "[^"]*";/, `const ZED_MODEL_VERTICES = "${vertices}";`],
  [/const ZED_MODEL_INDICES = "[^"]*";/, `const ZED_MODEL_INDICES = "${indices}";`],
  [/const ZED_MODEL_TEXTURE = "data:image\/webp;base64,[^"]*";/,
    `const ZED_MODEL_TEXTURE = "data:image/webp;base64,${texture}";`]
];

for (const [pattern, replacement] of replacements) {
  if (!pattern.test(html)) throw new Error(`Missing Zed embed marker: ${pattern}`);
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
