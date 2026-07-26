import { readFile } from "node:fs/promises";
import path from "node:path";

const playableChampions = ["katarina", "zed", "renekton", "vladimir", "gangplank"];

const encode = async (filePath) => (await readFile(filePath)).toString("base64");

export async function packagePlayableChampions(repositoryRoot) {
  const entries = await Promise.all(playableChampions.map(async (champion) => {
    const modelDirectory = path.join(repositoryRoot, "champions", champion, "playable-model");
    const [vertices, indices, texture] = await Promise.all([
      encode(path.join(modelDirectory, `${champion}-model-vertices.bin`)),
      encode(path.join(modelDirectory, `${champion}-model-indices.bin`)),
      encode(path.join(modelDirectory, `${champion}-model-texture.webp`))
    ]);

    return `  ${champion}: Object.freeze(${JSON.stringify({
      vertices,
      indices,
      texture: `data:image/webp;base64,${texture}`
    })})`;
  }));

  return `"use strict";\n\nconst PLAYABLE_CHAMPIONS = Object.freeze({\n${entries.join(",\n")}\n});\n`;
}

export { playableChampions };
