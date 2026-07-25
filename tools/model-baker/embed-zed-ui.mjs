import fs from "node:fs";
import path from "node:path";

const [htmlPath = "riftbomb-symphony.html", assetDir = "art/zed-game-model/ui"] = process.argv.slice(2);
let html = fs.readFileSync(htmlPath, "utf8");

const files = {
  portrait: "zed-portrait.webp",
  passive: "zed-passive.webp",
  q: "zed-q.webp",
  w: "zed-w.webp",
  e: "zed-e.webp",
  r: "zed-r.webp"
};

for (const [key, file] of Object.entries(files)) {
  const data = fs.readFileSync(path.join(assetDir, file)).toString("base64");
  const pattern = new RegExp(`(${key}: ")data:image\\/webp;base64,[^"]*(")`);
  if (!pattern.test(html)) throw new Error(`Missing ZED_ASSETS.${key} marker in ${htmlPath}`);
  html = html.replace(pattern, `$1data:image/webp;base64,${data}$2`);
}

fs.writeFileSync(htmlPath, html);
console.log(JSON.stringify({ html: htmlPath, embedded: files }, null, 2));
