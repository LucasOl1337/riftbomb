import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("keeps crawlers focused on the canonical playable landing", async () => {
  const robots = await readFile(new URL("public/robots.txt", root), "utf8");

  assert.match(robots, /^User-agent: \*\r?\nAllow: \/$/m);
  assert.match(robots, /^Disallow: \/api\/$/m);
  assert.match(robots, /^Disallow: \/riftbomb\.html$/m);
  assert.match(robots, /^Disallow: \/riftbomb-parts\/$/m);
  assert.match(
    robots,
    /^Sitemap: https:\/\/bombpvp\.com\/sitemap\.xml$/m,
  );
});
