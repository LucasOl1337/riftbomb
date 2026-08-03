import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(
  new URL("../app/not-found.module.css", import.meta.url),
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
  "#071318",
  "#041014",
  "#a0f5f8",
];

const requiredTokens = [
  "var(--rb-text)",
  "var(--rb-text-soft)",
  "var(--rb-canvas)",
  "var(--rb-canvas-soft)",
  "var(--rb-rift)",
  "var(--rb-alloy)",
  "var(--rb-line-strong)",
];

test("not-found / error recovery chrome uses War Table --rb-* tokens", () => {
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
    styles.includes("RECOVERY_CTA_ALLOY_V1"),
    "missing RECOVERY_CTA_ALLOY_V1 marker",
  );
  assert.ok(
    styles.includes("background: var(--rb-alloy)"),
    "primary recovery CTA must use --rb-alloy",
  );
  assert.ok(
    styles.includes("background: var(--rb-alloy-bright)"),
    "primary recovery CTA hover must use --rb-alloy-bright",
  );
  assert.ok(
    styles.includes("outline: 3px solid var(--rb-alloy)"),
    "focus ring must use --rb-alloy",
  );
  // primary .cta block must not keep rift fill (brand mark may still use --rb-rift)
  const ctaIdx = styles.indexOf("RECOVERY_CTA_ALLOY_V1");
  const ctaHoverIdx = styles.indexOf(".cta:hover", ctaIdx);
  assert.ok(ctaIdx >= 0 && ctaHoverIdx > ctaIdx, "cta alloy block bounds");
  const ctaBlock = styles.slice(ctaIdx, ctaHoverIdx);
  assert.equal(
    ctaBlock.includes("var(--rb-rift)"),
    false,
    "primary .cta fill must not use --rb-rift",
  );
  assert.ok(
    styles.includes("border-top: 0.025em solid var(--rb-alloy)"),
    "bomb fuse must use --rb-alloy",
  );
  assert.ok(
    styles.includes("RECOVERY_SECONDARY_CTA_RB_V1"),
    "missing RECOVERY_SECONDARY_CTA_RB_V1 marker",
  );
  assert.ok(
    styles.includes("color: var(--rb-text-soft)"),
    "secondary recovery CTA must use --rb-text-soft",
  );
  assert.ok(
    styles.includes("border: 1px solid var(--rb-line-strong)"),
    "secondary recovery CTA border must use --rb-line-strong",
  );
  const secIdx = styles.indexOf("RECOVERY_SECONDARY_CTA_RB_V1");
  const secActiveIdx = styles.indexOf(".secondaryCta:active", secIdx);
  assert.ok(secIdx >= 0 && secActiveIdx > secIdx, "secondary CTA block bounds");
  const secBlock = styles.slice(secIdx, secActiveIdx);
  for (const leftover of [
    "rgb(221 241 243 / 86%)",
    "rgb(3 12 16 / 28%)",
    "rgb(117 232 240 / 28%)",
    "rgb(117 232 240 / 10%)",
    "rgb(117 232 240 / 48%)",
    "rgb(43 199 212 / 12%)",
  ]) {
    assert.equal(
      secBlock.includes(leftover),
      false,
      `secondary CTA still has ad-hoc rgb: ${leftover}`,
    );
  }
  assert.ok(
    secBlock.includes("var(--rb-rift)"),
    "secondary hover must keep product rift accent via tokens",
  );
  assert.ok(
    styles.includes("RECOVERY_SOFT_COPY_RB_V1"),
    "missing RECOVERY_SOFT_COPY_RB_V1 marker",
  );
  assert.ok(
    styles.includes("color: color-mix(in srgb, var(--rb-text-soft) 58%, transparent)"),
    "brand small must use --rb-text-soft soft rail",
  );
  assert.ok(
    styles.includes("color: color-mix(in srgb, var(--rb-text) 92%, transparent)"),
    "code must use --rb-text soft rail",
  );
  assert.ok(
    styles.includes("color: color-mix(in srgb, var(--rb-text-soft) 74%, transparent)"),
    "copy must use --rb-text-soft soft rail",
  );
  assert.ok(
    styles.includes("color: color-mix(in srgb, var(--rb-muted) 50%, transparent)"),
    "hint must use --rb-muted soft rail",
  );
  assert.ok(
    styles.includes("color: color-mix(in srgb, var(--rb-muted) 40%, transparent)"),
    "coordinate must use --rb-muted soft rail",
  );
  for (const leftover of [
    "rgb(209 239 242 / 58%)",
    "rgb(238 252 255 / 92%)",
    "rgb(221 241 243 / 74%)",
    "rgb(203 232 235 / 50%)",
    "rgb(203 232 235 / 40%)",
  ]) {
    assert.equal(
      styles.includes(leftover),
      false,
      `soft recovery copy still has ad-hoc rgb: ${leftover}`,
    );
  }
  assert.ok(
    styles.includes("var(--rb-muted)"),
    "recovery soft copy must reference --rb-muted",
  );
});
