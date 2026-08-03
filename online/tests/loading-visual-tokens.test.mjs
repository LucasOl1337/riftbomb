import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(
  new URL("../app/loading.module.css", import.meta.url),
  "utf8",
);

const bannedChromeHex = [
  "#effcff",
  "#03080d",
  "#031015",
  "#69e4f0",
  "#bffaff",
  "#82edf5",
  "#f1c56a",
  "#75e8f0",
  "#d7faff",
];

const requiredTokens = [
  "var(--rb-text)",
  "var(--rb-text-soft)",
  "var(--rb-muted)",
  "var(--rb-canvas)",
  "var(--rb-canvas-soft)",
  "var(--rb-rift)",
  "var(--rb-alloy)",
];

test("loading shell chrome uses War Table --rb-* tokens", () => {
  for (const hex of bannedChromeHex) {
    assert.equal(
      styles.toLowerCase().includes(hex),
      false,
      `banned ad-hoc chrome hex still present: ${hex}`,
    );
  }
  for (const token of requiredTokens) {
    assert.ok(styles.includes(token), `missing product token: ${token}`);
  }
  assert.ok(
    styles.includes("background: var(--rb-canvas)"),
    "page background must use --rb-canvas",
  );
  assert.ok(
    styles.includes("background: var(--rb-rift)"),
    "brand mark must use --rb-rift",
  );
  assert.ok(
    styles.includes("background: var(--rb-alloy)"),
    "progress diamonds must use --rb-alloy",
  );
  assert.ok(
    styles.includes("LOADING_SOFT_COPY_RB_V1"),
    "missing LOADING_SOFT_COPY_RB_V1 marker",
  );
  assert.ok(
    styles.includes("color: color-mix(in srgb, var(--rb-text-soft) 58%, transparent)"),
    "brand small must use --rb-text-soft soft rail",
  );
  assert.ok(
    styles.includes("color: color-mix(in srgb, var(--rb-text-soft) 74%, transparent)"),
    "copy must use --rb-text-soft soft rail",
  );
  assert.ok(
    styles.includes("color: color-mix(in srgb, var(--rb-muted) 54%, transparent)"),
    "proof must use --rb-muted soft rail",
  );
  assert.ok(
    styles.includes("color: color-mix(in srgb, var(--rb-muted) 40%, transparent)"),
    "coordinate must use --rb-muted soft rail",
  );
  for (const leftover of [
    "rgb(209 239 242 / 58%)",
    "rgb(221 241 243 / 74%)",
    "rgb(203 232 235 / 54%)",
    "rgb(203 232 235 / 40%)",
  ]) {
    assert.equal(
      styles.includes(leftover),
      false,
      `loading soft copy still has ad-hoc rgb: ${leftover}`,
    );
  }
});
