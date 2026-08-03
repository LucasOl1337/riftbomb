import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  brotliCompressSync,
  brotliDecompressSync,
  constants as zlibConstants,
} from "node:zlib";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const onlineRoot = path.resolve(scriptDirectory, "..");

async function compressScript(name) {
  const sourcePath = path.join(onlineRoot, "public", name);
  const artifactPath = path.join(onlineRoot, "dist", "client", name);
  const source = await readFile(sourcePath);
  const artifact = await readFile(artifactPath);
  if (!artifact.equals(source)) {
    throw new Error(
      `The Vinext artifact changed ${name} before compression; refusing to replace an unknown payload.`,
    );
  }

  const compressed = brotliCompressSync(source, {
    params: {
      [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
      [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
    },
  });
  if (compressed.byteLength >= source.byteLength) {
    throw new Error(
      `Brotli did not reduce ${name} (${compressed.byteLength} >= ${source.byteLength} bytes).`,
    );
  }
  if (!brotliDecompressSync(compressed).equals(source)) {
    throw new Error(`Brotli round-trip changed ${name}.`);
  }

  await writeFile(artifactPath, compressed);
  console.log(
    `Compressed ${name} for production: ${source.byteLength} → ${compressed.byteLength} B `
      + `(-${source.byteLength - compressed.byteLength} B).`,
  );
}

for (const name of ["online-duel.js", "online-duel-loader.js"]) {
  await compressScript(name);
}
