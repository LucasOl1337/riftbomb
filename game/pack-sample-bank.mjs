import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const gameDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(gameDirectory, "audio");
const out = path.join(gameDirectory, "load-sample-bank-data.js");
const manifestOut = path.join(gameDirectory, "audio", "sample-manifest.json");

const instruments = fs
  .readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const lines = [
  '"use strict";',
  "// Auto-generated real instrument samples (CC BY 3.0 — tonejs-instruments).",
  "// Regenerate with: node game/pack-sample-bank.mjs",
  "window.RIFTBOMB_SAMPLE_BANK = Object.freeze({"
];

const manifest = {};
let total = 0;
let count = 0;

for (const instrument of instruments) {
  const directory = path.join(root, instrument);
  const notes = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".ogg"))
    .map((name) => name.replace(/\.ogg$/, ""))
    .sort();
  if (!notes.length) continue;
  manifest[instrument] = notes;
  for (const note of notes) {
    const buffer = fs.readFileSync(path.join(directory, `${note}.ogg`));
    const key = `${instrument}/${note}`;
    lines.push(`  ${JSON.stringify(key)}: "data:audio/ogg;base64,${buffer.toString("base64")}",`);
    total += buffer.length;
    count += 1;
  }
}

lines.push("});");
lines.push("");
lines.push(`window.RIFTBOMB_SAMPLE_MANIFEST = Object.freeze(${JSON.stringify(manifest, null, 2)});`);

fs.writeFileSync(out, lines.join("\n"));
fs.writeFileSync(manifestOut, JSON.stringify(manifest, null, 2));
console.log(
  `Packed ${count} samples → ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1e6).toFixed(2)} MB JS, ${(total / 1e6).toFixed(2)} MB audio)`
);
console.log(`Manifest instruments: ${Object.keys(manifest).join(", ")}`);
