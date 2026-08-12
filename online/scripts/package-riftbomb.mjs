import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOfflineGamePublication } from "./offline-game-publication.mjs";

const rootBuildReady = process.argv[2] === "--root-build-ready";
if (process.argv.length > (rootBuildReady ? 3 : 2)) {
  throw new Error("Usage: package-riftbomb.mjs [--root-build-ready]");
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const onlineRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(onlineRoot, "..");

await createOfflineGamePublication().publish({
  repositoryRoot,
  onlineRoot,
  rootBuildReady,
});
