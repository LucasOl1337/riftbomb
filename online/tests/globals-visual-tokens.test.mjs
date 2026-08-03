import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

const rootBlock = styles.slice(0, styles.indexOf("}") + 1);

const bannedRootHex = [
  "#03080d",
  "#08121a",
  "#0c1b25",
  "#e9f2f2",
  "#8ea5ad",
  "#b5c5ca",
  "#72d4dc",
  "#a6f5f4",
  "#d1ae69",
  "#f3d494",
  "#df7777",
];

const requiredRootTokens = [
  "var(--rb-canvas)",
  "var(--rb-canvas-soft)",
  "var(--rb-surface)",
  "var(--rb-surface-soft)",
  "var(--rb-line)",
  "var(--rb-line-strong)",
  "var(--rb-text)",
  "var(--rb-muted)",
  "var(--rb-text-soft)",
  "var(--rb-rift)",
  "var(--rb-alloy)",
  "var(--rb-alloy-bright)",
  "var(--rb-danger)",
];

test("globals.css :root bridges legacy names to War Table --rb-* tokens", () => {
  assert.ok(
    styles.includes("GLOBALS_ROOT_RB_BRIDGE_V1"),
    "missing GLOBALS_ROOT_RB_BRIDGE_V1 marker",
  );
  for (const hex of bannedRootHex) {
    assert.equal(
      rootBlock.toLowerCase().includes(hex),
      false,
      `banned ad-hoc root hex still present: ${hex}`,
    );
  }
  for (const token of requiredRootTokens) {
    assert.ok(rootBlock.includes(token), `missing product token in :root: ${token}`);
  }
  assert.ok(rootBlock.includes("--ink-0: var(--rb-canvas)"), "--ink-0 must alias --rb-canvas");
  assert.ok(rootBlock.includes("--cyan: var(--rb-rift)"), "--cyan must alias --rb-rift");
  assert.ok(rootBlock.includes("--gold: var(--rb-alloy)"), "--gold must alias --rb-alloy");
  assert.ok(rootBlock.includes("--danger: var(--rb-danger)"), "--danger must alias --rb-danger");
});
