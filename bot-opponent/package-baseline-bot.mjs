import { readFile } from "node:fs/promises";

const sources = [
  new URL("./sense-arena.mjs", import.meta.url),
  new URL("./build-world-view.mjs", import.meta.url),
  new URL("./baseline-policy.mjs", import.meta.url)
];

function browserSource(source) {
  return source
    .replace(/^import .*?;\r?\n/gm, "")
    .replace(/^export /gm, "");
}

export async function packageBaselineBot() {
  const modules = await Promise.all(sources.map((source) => readFile(source, "utf8")));
  return [
    '"use strict";',
    "const RIFTBOMB_BOTS = (() => {",
    ...modules.map(browserSource),
    "return Object.freeze({ buildWorldView, createBaselinePolicy });",
    "})();",
    ""
  ].join("\n");
}
