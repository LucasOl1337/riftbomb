import { readFile } from "node:fs/promises";

const sources = [
  // The V1 arena brain wraps the baseline policy, so the bundle inlines it
  // to stay self-contained when load-baseline-bot.js is absent.
  new URL("./baseline-policy.mjs", import.meta.url),
  new URL("./v1/read-rival.mjs", import.meta.url),
  new URL("./v1/personality.mjs", import.meta.url),
  new URL("./v1/v1-memory.mjs", import.meta.url),
  new URL("./v1/danger-timeline.mjs", import.meta.url),
  new URL("./v1/advantage.mjs", import.meta.url),
  new URL("./v1/navigate-arena.mjs", import.meta.url),
  new URL("./v1/open-route.mjs", import.meta.url),
  new URL("./v1/plan-arena-actions.mjs", import.meta.url),
  new URL("./v1/renekton/renekton-memory.mjs", import.meta.url),
  new URL("./v1/renekton/renekton-skills.mjs", import.meta.url),
  new URL("./v1/create-v1-policy.mjs", import.meta.url)
];

function browserSource(source) {
  return source
    .replace(/^import .*?;\r?\n/gm, "")
    .replace(/^export /gm, "");
}

export async function packageV1Bot() {
  const modules = await Promise.all(sources.map((source) => readFile(source, "utf8")));
  return [
    '"use strict";',
    "(() => {",
    // Augments the baseline bundle in place; without it there is no global
    // to extend and game/ falls back to the baseline policy (or no CPU).
    'if (typeof RIFTBOMB_BOTS === "undefined") return;',
    ...modules.map(browserSource),
    "RIFTBOMB_BOTS.createV1Policy = createV1Policy;",
    "RIFTBOMB_BOTS.createRenektonPilot = createRenektonPilot;",
    "})();",
    ""
  ].join("\n");
}
