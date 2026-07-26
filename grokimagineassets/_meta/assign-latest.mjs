import fs from "fs";
import path from "path";
import os from "os";

const claims = JSON.parse(fs.readFileSync("grokimagineassets/_meta/claimed.json", "utf8"));
const sessionImgs = path.join(
  os.homedir(),
  ".grok/sessions/C%3A%5CProjetos%5Criftbomb/019f9e50-83fb-7502-bec9-8df65f587fb5/images"
);
const imgs = fs
  .readdirSync(sessionImgs)
  .filter((f) => f.endsWith(".jpg"))
  .map((f) => ({ f, p: path.join(sessionImgs, f), t: fs.statSync(path.join(sessionImgs, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);

// Take the N newest that aren't already assigned in this run by size uniqueness
const newest = imgs.slice(0, claims.length).reverse(); // oldest-of-batch first ~ gen order
const assigned = [];
for (let i = 0; i < claims.length && i < newest.length; i++) {
  const c = claims[i];
  fs.mkdirSync(path.dirname(c.dest), { recursive: true });
  fs.copyFileSync(newest[i].p, c.dest);
  assigned.push({ from: newest[i].f, to: c.dest });
}
console.log(JSON.stringify({ assigned, claims: claims.length, newest: newest.map((x) => x.f) }, null, 2));

// rebuild progress
const cat = JSON.parse(fs.readFileSync("grokimagineassets/_meta/catalog.json", "utf8"));
const progress = { aspects: {}, totalDone: 0, totalPlanned: 0, updated: new Date().toISOString() };
for (const [aspect, info] of Object.entries(cat.aspects)) {
  const dir = path.join("grokimagineassets", aspect);
  let done = 0;
  for (let i = 1; i <= info.count; i++) {
    const nn = String(i).padStart(2, "0");
    const name = `${aspect}_${nn}_${info.slugs[i - 1]}.jpg`;
    if (fs.existsSync(path.join(dir, name))) done++;
  }
  progress.aspects[aspect] = { done, target: info.count };
  progress.totalDone += done;
  progress.totalPlanned += info.count;
}
fs.writeFileSync("grokimagineassets/_meta/progress.json", JSON.stringify(progress, null, 2));
console.log("progress", progress.totalDone, "/", progress.totalPlanned);
