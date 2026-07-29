import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("recovers invalid landing routes with a playable CTA", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("app/not-found.tsx", root), "utf8"),
    readFile(new URL("app/not-found.module.css", root), "utf8"),
  ]);

  assert.match(page, /<main/);
  assert.match(page, /href="\/"/);
  assert.match(page, /Entrar na arena/);
  assert.match(page, /aria-labelledby="not-found-title"/);
  assert.match(styles, /min-height:\s*100dvh/);
  assert.match(styles, /clearing\.webp/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(styles, /focus-visible/);
});
