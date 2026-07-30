import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const loadingSource = await readFile(
  new URL("../app/loading.tsx", import.meta.url),
  "utf8",
);
const loadingStyles = await readFile(
  new URL("../app/loading.module.css", import.meta.url),
  "utf8",
);

test("root loading state keeps the commercial promise visible", () => {
  assert.match(loadingSource, /role="status"/);
  assert.match(loadingSource, /aria-live="polite"/);
  assert.match(loadingSource, /Montando sua arena\./);
  assert.match(loadingSource, /PvP em tempo real · sem download/);
  assert.match(loadingStyles, /url\("\/client\/arenas\/lattice\.webp"\)/);
});

test("root loading state covers mobile and reduced motion", () => {
  assert.match(loadingStyles, /min-height:\s*100dvh/);
  assert.match(loadingStyles, /@media \(max-width: 560px\)/);
  assert.match(
    loadingStyles,
    /@media \(max-height: 620px\) and \(orientation: landscape\)/,
  );
  assert.match(loadingStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(loadingStyles, /\.progress span\s*\{[\s\S]*animation: none/);
});
