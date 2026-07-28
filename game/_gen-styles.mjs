import fs from "node:fs";

function S(id, label, blurb, baseBpm, minBpm, maxBpm, swing, mix, sections, chords, bassRoots, celloOstinato, celloMelody, violinMelody, density) {
  return {
    id, label, blurb, baseBpm, minBpm, maxBpm, swing, mix, sections, chords, bassRoots,
    celloOstinato, celloMelody, violinMelody, density
  };
}

const sec = (names, intensities) =>
  names.map((name, i) => ({ bar: [0, 8, 20, 36, 50, 60][i], name, intensity: intensities[i] }));

// The selectable score is intentionally limited to the three approved tracks.
const styles = {
  silver: S("silver", "Silver Thread", "Long bows · light duet · airy", 72, 64, 88, 0.06,
    { string: 1.12, keys: 0.48, low: 0.6, dark: 5600, reverb: 0.5 },
    sec(["Silver air", "Thread", "Long line", "Duet silver", "Lift", "Drift"], [0.18, 0.34, 0.5, 0.66, 0.8, 0.42]),
    [[48, 52, 55], [45, 48, 52], [50, 53, 57], [47, 50, 54]], [48, 45, 50, 47],
    [0, 0, 5, 0, 0, 7, 5, 3],
    [55, 57, 59, 57, 55, 52, 55, 57, 59, 60, 59, 57, 55, 52, 53, 55],
    [64, 62, 60, 62, 64, 67, 64, 62, 60, 59, 60, 62, 64, 62, 60, 57],
    { organ: 0.35, piano: 0.25, celloOst: 0.55, celloMel: 1.05, violin: 0.95, halfViolin: 0.9, subBass: 0, harp: 0.55, flute: 0.2, horn: 0.15, drive: 0 }),

  bloodmoon: S("bloodmoon", "Blood Moon", "Ritual dark · thin violin", 58, 50, 72, 0.04,
    { string: 1.12, keys: 0.55, low: 2.4, dark: 3400, reverb: 0.74 },
    sec(["Rite", "Red hush", "Circle", "Omen", "Eclipse blood", "Still"], [0.14, 0.3, 0.48, 0.66, 0.84, 0.36]),
    [[40, 43, 47], [45, 48, 52], [38, 41, 45], [43, 47, 50]], [28, 33, 26, 31],
    [0, 0, 0, 7, 0, 5, 0, 3],
    [40, 41, 43, 41, 40, 38, 40, 43, 45, 43, 41, 40, 38, 36, 38, 40],
    [55, 53, 52, 53, 55, 57, 55, 53, 52, 50, 52, 55, 57, 55, 52, 48],
    { organ: 0.85, piano: 0.2, celloOst: 0.75, celloMel: 0.7, violin: 0.65, halfViolin: 0.55, subBass: 0.7, harp: 0.05, flute: 0, horn: 0.2, drive: 0 }),

  skyglass: S("skyglass", "Skyglass", "Airy violin · flute color", 70, 62, 86, 0.05,
    { string: 1.05, keys: 0.45, low: 0.35, dark: 6200, reverb: 0.6 },
    sec(["Sky open", "Glass air", "Float", "Arc", "Sun line", "Clear"], [0.16, 0.32, 0.5, 0.66, 0.82, 0.38]),
    [[50, 53, 57], [52, 55, 59], [48, 52, 55], [47, 50, 54]], [50, 52, 48, 47],
    [0, 0, 5, 0, 0, 7, 5, 12],
    [57, 59, 60, 59, 57, 55, 57, 59, 60, 62, 60, 57, 55, 52, 55, 57],
    [69, 71, 72, 71, 69, 67, 69, 71, 72, 74, 72, 69, 67, 64, 67, 69],
    { organ: 0.2, piano: 0.25, celloOst: 0.35, celloMel: 0.6, violin: 1.15, halfViolin: 1.05, subBass: 0, harp: 0.4, flute: 0.85, horn: 0.1, drive: 0 })
};

function emit() {
  const pad = " ".repeat(10);
  return Object.entries(styles)
    .map(([id, style]) => `${pad}${id}: Object.freeze(${JSON.stringify(style)}),`)
    .join("\n");
}

const p = "game/play-rift-soundtrack.js";
let src = fs.readFileSync(p, "utf8");
const start = src.indexOf("        // Selectable score");
const legacyStart = src.indexOf("        // Selectable suite styles");
const markerStart = start >= 0 ? start : legacyStart;
const end = src.indexOf("        this.styleId = ");
if (markerStart < 0 || end < 0) {
  console.error("markers", markerStart, end);
  process.exit(1);
}
const block = `        // Selectable score — three approved tracks using the shared real-sample bank.\n        this.styles = Object.freeze({\n${emit()}\n        });\n`;
src = src.slice(0, markerStart) + block + src.slice(end);
fs.writeFileSync(p, src);
console.log("styles:", Object.keys(styles).length, Object.keys(styles).join(", "));
