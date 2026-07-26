/**
 * Proves skill-token pipeline: real ability art URLs + hybrid DOM overlay wiring.
 * (WebGL pedestal + DOM circular skill icons — not the broken mapId-4 white disc.)
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(dir, "Assets", "skill-token-proof");
mkdirSync(outDir, { recursive: true });

const src = readFileSync(path.join(dir, "draw-bomber-rift.js"), "utf8");
const gameSrc = readFileSync(path.join(dir, "run-champion-bomb-duel.js"), "utf8");
const html = readFileSync(path.join(dir, "play-riftbomb.html"), "utf8");
const css = readFileSync(path.join(dir, "show-champion-duel.css"), "utf8");

function extractAsset(name, key) {
  const start = src.indexOf(`const ${name}`);
  if (start < 0) return null;
  const end = src.indexOf("\n    const ", start + 10);
  const block = src.slice(start, end > start ? end : start + 50000);
  const m = block.match(new RegExp(`${key}:\\s*"(data:image[^"]+)"`));
  return m ? m[1] : null;
}

const champs = [
  ["KATARINA_ASSETS", "katarina"],
  ["ZED_ASSETS", "zed"],
  ["RENEKTON_ASSETS", "renekton"],
  ["VLADIMIR_ASSETS", "vladimir"],
  ["GANGPLANK_ASSETS", "gangplank"]
];
const slots = ["q", "w", "e", "r"];
let ok = 0;
let fail = 0;
const report = [];

for (const [constName, champ] of champs) {
  for (const slot of slots) {
    const url = extractAsset(constName, slot);
    if (!url || !url.startsWith("data:image")) {
      fail++;
      report.push(`${champ}.${slot}: MISSING`);
      continue;
    }
    const comma = url.indexOf(",");
    const b64 = url.slice(comma + 1);
    const buf = Buffer.from(b64, "base64");
    const ext = url.includes("image/webp") ? "webp" : "png";
    const file = path.join(outDir, `${champ}-${slot}.${ext}`);
    writeFileSync(file, buf);
    ok++;
    report.push(`${champ}.${slot}: ${buf.length} bytes → ${path.basename(file)}`);
  }
}

const checks = [
  [src.includes("const RIFTBOMB_SKILL_ART"), "RIFTBOMB_SKILL_ART table"],
  [src.includes("skillArtUrl"), "skillArtUrl helper"],
  [src.includes("syncSkillTokenDom"), "syncSkillTokenDom method"],
  [src.includes("this.syncSkillTokenDom(game.pickups"), "sync called each frame"],
  [!src.includes('mapId = 0, textureOverride') || !/draw\("skillDisc"[^;]*,\s*4,\s*icon\)/.test(src), "no mapId-4 white skillDisc art"],
  [!/draw\("skillDisc"[^\n]*4,\s*icon\)/.test(src), "skillDisc not textured with icon"],
  [gameSrc.includes("art: skillArtUrl"), "spawn passes art URL"],
  [html.includes('id="skill-token-layer"'), "HTML skill-token-layer"],
  [css.includes(".skill-token"), "CSS skill-token class"],
  [css.includes(".skill-token-layer"), "CSS skill-token-layer"]
];

let wiringFail = 0;
for (const [pass, label] of checks) {
  if (!pass) {
    console.error("FAIL", label);
    wiringFail++;
  } else {
    report.push(`WIRING OK: ${label}`);
  }
}

writeFileSync(path.join(outDir, "REPORT.txt"), report.join("\n") + `\n\nOK ${ok} / FAIL ${fail} / WIRING_FAIL ${wiringFail}\n`);
console.log(report.join("\n"));
console.log(`\nPROVED: ${ok} real skill icons extracted; hybrid DOM token wiring ${wiringFail === 0 ? "OK" : "BROKEN"}.`);
console.log(`Proof folder: ${outDir}`);
if (fail > 0 || ok < 16 || wiringFail > 0) process.exit(1);
