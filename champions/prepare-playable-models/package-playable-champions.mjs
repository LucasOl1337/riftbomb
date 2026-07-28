import { readFile } from "node:fs/promises";
import path from "node:path";

const playableChampions = ["katarina", "zed", "renekton", "vladimir", "gangplank"];

const encode = async (filePath) => (await readFile(filePath)).toString("base64");

export async function packagePlayableChampions(repositoryRoot) {
  const entries = await Promise.all(playableChampions.map(async (champion) => {
    const modelDirectory = path.join(repositoryRoot, "champions", champion, "playable-model");
    const [vertices, indices, texture, metadataSource] = await Promise.all([
      encode(path.join(modelDirectory, `${champion}-model-vertices.bin`)),
      encode(path.join(modelDirectory, `${champion}-model-indices.bin`)),
      encode(path.join(modelDirectory, `${champion}-model-texture.webp`)),
      readFile(path.join(modelDirectory, `${champion}-model-metadata.json`), "utf8")
    ]);
    const metadata = JSON.parse(metadataSource);
    const payload = {
      vertices,
      indices,
      texture: `data:image/webp;base64,${texture}`
    };
    if (metadata.runtime === "vat-v1") {
      const [frames, normals] = await Promise.all([
        encode(path.join(modelDirectory, `${champion}-model-frames.bin`)),
        encode(path.join(modelDirectory, `${champion}-model-normals.bin`))
      ]);
      Object.assign(payload, {
        frames,
        normals,
        animation: {
          runtime: metadata.runtime,
          vertexCount: metadata.vertexCount,
          frameCount: metadata.frameCount,
          textureDimensions: metadata.textureDimensions,
          positionMin: metadata.positionBounds.min,
          positionRange: metadata.positionBounds.range,
          clips: metadata.animationClips
        }
      });
    }

    return `  ${champion}: Object.freeze(${JSON.stringify(payload)})`;
  }));

  return `"use strict";\n\nconst PLAYABLE_CHAMPIONS = Object.freeze({\n${entries.join(",\n")}\n});\n`;
}

export { playableChampions };
