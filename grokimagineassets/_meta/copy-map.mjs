import fs from "fs";
import path from "path";

const sessionImgs = path.join(
  process.env.USERPROFILE || "",
  ".grok/sessions/C%3A%5CProjetos%5Criftbomb/019f9e50-83fb-7502-bec9-8df65f587fb5/images"
);

// args: destDir prefix startIndex slug1 slug2 ...
// copies newest N images? better: pass explicit source files via JSON map
const mapPath = process.argv[2];
const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
// map: [{src, dest}]
for (const { src, dest } of map) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log("->", dest);
}
