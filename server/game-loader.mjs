import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

globalThis.innerWidth = 1920;
globalThis.clamp = (value, min, max) => Math.max(min, Math.min(max, value));
globalThis.lerp = (a, b, t) => a + (b - a) * t;
globalThis.TAU = Math.PI * 2;
globalThis.skillArtUrl = () => "";
globalThis.Renderer = {
  colors: new Proxy({}, { get: () => [0, 0, 0] }),
  addShock: () => {},
  cameraShake: 0
};

const source = readFileSync(path.join(root, "game/run-champion-bomb-duel.js"), "utf8");
const moduleCode = `${source}\nexport { Game, ARENA_TEMPLATES };`;
const dataUrl = `data:text/javascript;base64,${Buffer.from(moduleCode).toString("base64")}`;
const { Game } = await import(dataUrl);

export { Game };
