import fs from "fs";
import path from "path";

const cat = JSON.parse(fs.readFileSync("grokimagineassets/_meta/catalog.json", "utf8"));
const n = Number(process.argv[2] || 4);
const claims = [];

for (const [aspect, info] of Object.entries(cat.aspects)) {
  const dir = path.join("grokimagineassets", aspect);
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 1; i <= info.count; i++) {
    const nn = String(i).padStart(2, "0");
    const slug = info.slugs[i - 1];
    const name = `${aspect}_${nn}_${slug}.jpg`;
    const dest = path.join(dir, name);
    if (!fs.existsSync(dest)) {
      claims.push({ aspect, i, nn, slug, name, dest, prompt: buildPrompt(aspect, slug) });
      if (claims.length >= n) break;
    }
  }
  if (claims.length >= n) break;
}

function buildPrompt(aspect, slug) {
  const base =
    "Square seamless game albedo texture, flat even lighting for PBR, edge-to-edge fill, dense micro material detail, clear tonal separation between surface parts, no characters no props no UI text, orthographic top-down or face-on as appropriate. ";
  const roles = {
    ground: `Arena ground fill themed as "${slug.replace(/-/g, " ")}".`,
    "floor-tile": `Single bomberman floor cell tile themed as "${slug.replace(/-/g, " ")}".`,
    "wall-side": `Indestructible wall SIDE face themed as "${slug.replace(/-/g, " ")}", vertical block construction readable.`,
    "wall-top": `Wall TOP CAP face themed as "${slug.replace(/-/g, " ")}", flat lid surface.`,
    lane: `Mid-lane path strip texture themed as "${slug.replace(/-/g, " ")}".`,
    river: `River liquid surface texture themed as "${slug.replace(/-/g, " ")}", flowing look but seamless.`,
    "stone-turret": `Turret or nexus stone BASE material themed as "${slug.replace(/-/g, " ")}".`
  };
  return base + (roles[aspect] || slug);
}

fs.writeFileSync("grokimagineassets/_meta/claimed.json", JSON.stringify(claims, null, 2));
console.log(JSON.stringify(claims, null, 2));
