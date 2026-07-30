import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("recovers landing failures without abandoning the playable entry", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("app/error.tsx", root), "utf8"),
    readFile(new URL("app/not-found.module.css", root), "utf8"),
  ]);

  assert.match(page, /^"use client";/);
  assert.match(page, /onClick=\{reset\}/);
  assert.match(page, /Tentar novamente/);
  assert.match(page, /href="\/"/);
  assert.match(page, /Voltar à entrada/);
  assert.match(page, /aria-labelledby="error-title"/);
  assert.match(styles, /\.signal/);
  assert.match(styles, /\.actions/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(styles, /secondaryCta:focus-visible/);
});
