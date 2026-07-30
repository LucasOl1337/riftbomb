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
    // Not frozen: the V1 bundle (load-v1-bot.js) augments this object with
    // createV1Policy / createRenektonPilot when it is loaded.
    "return { buildWorldView, createBaselinePolicy };",
    "})();",
    ""
  ].join("\n");
}
