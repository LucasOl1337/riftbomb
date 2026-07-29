import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..", "..");
const requested = process.argv.slice(2).map((value) => value.toLowerCase());

const roster = {
  katarina: { id: 55000 },
  zed: { id: 238000 },
  renekton: { id: 58000 },
  vladimir: { id: 8000 },
  gangplank: { id: 41000 }
};

const champions = requested.length ? requested : Object.keys(roster);
for (const champion of champions) {
  if (!roster[champion]) throw new Error(`Unknown roster champion: ${champion}`);
}

const readGlb = (bytes) => {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) {
    throw new Error("Model Viewer response is not a glTF 2.0 binary");
  }
  const jsonLength = bytes.readUInt32LE(12);
  const jsonType = bytes.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a) throw new Error("GLB has no JSON chunk");
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").trim());
  const binaryHeader = 20 + jsonLength;
  const binaryLength = bytes.readUInt32LE(binaryHeader);
  const binaryType = bytes.readUInt32LE(binaryHeader + 4);
  if (binaryType !== 0x004e4942) throw new Error("GLB has no binary chunk");
  return { json, binary: bytes.subarray(binaryHeader + 8, binaryHeader + 8 + binaryLength) };
};

const extractChampionTexture = (bytes) => {
  const { json, binary } = readGlb(bytes);
  const material = json.materials.find((candidate) =>
    candidate.name !== "Crate_Mat" && candidate.pbrMetallicRoughness?.baseColorTexture
  );
  if (!material) throw new Error("No champion base-color material found in GLB");
  const texture = json.textures[material.pbrMetallicRoughness.baseColorTexture.index];
  const image = json.images[texture.source];
  const view = json.bufferViews[image.bufferView];
  const start = view.byteOffset || 0;
  return {
    bytes: binary.subarray(start, start + view.byteLength),
    mimeType: image.mimeType
  };
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: scriptDirectory,
    stdio: "inherit",
    shell: false,
    ...options
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}`);
};

for (const champion of champions) {
  const { id } = roster[champion];
  const sourceUrl = `https://cdn.modelviewer.lol/lol/models/${champion}/${id}/model.glb`;
  process.stdout.write(`Importing ${champion} from ${sourceUrl}\n`);
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`${sourceUrl} returned HTTP ${response.status}`);
  const glb = Buffer.from(await response.arrayBuffer());
  const championDirectory = path.join(repositoryRoot, "champions", champion);
  const playableDirectory = path.join(championDirectory, "playable-model");
  const glbPath = path.join(championDirectory, `${champion}-base-animated.glb`);
  await fs.mkdir(playableDirectory, { recursive: true });
  await fs.writeFile(glbPath, glb);

  const texture = extractChampionTexture(glb);
  if (texture.mimeType !== "image/png") {
    throw new Error(`${champion} texture is ${texture.mimeType}; importer currently expects image/png`);
  }
  const temporaryTexture = path.join(playableDirectory, `${champion}-model-texture.source.png`);
  const webpTexture = path.join(playableDirectory, `${champion}-model-texture.webp`);
  await fs.writeFile(temporaryTexture, texture.bytes);
  run("magick", [temporaryTexture, "-quality", "92", webpTexture]);
  await fs.unlink(temporaryTexture);

  run(process.execPath, [
    path.join(scriptDirectory, "bake-playable-champion.mjs"),
    champion,
    glbPath,
    playableDirectory
  ]);
  run(process.execPath, [
    path.join(scriptDirectory, "check-pose-integrity.mjs"),
    playableDirectory,
    "--quiet"
  ]);
}

process.stdout.write(`Imported ${champions.length} Model Viewer champion(s) with complete clip catalogs.\n`);
