import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("connection failure offers an actionable retry CTA on the primary control", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");

  assert.match(page, /CONNECTION_ERROR_RETRY_V1/);
  assert.match(page, /TENTAR DE NOVO/);
  assert.match(page, /data-connection-retry/);
  assert.match(
    page,
    /runtime\.tone === "error" && !runtime\.matchmaking && runtime\.role === "offline"/,
  );
  assert.match(page, /Tentar de novo após falha de conexão/);
  assert.match(page, /status: "Tentando de novo…"/);
  // Must not wipe a soft-resume session via chooseOffline on retry.
  assert.doesNotMatch(
    page,
    /tone === "error"[\s\S]{0,220}sendCommand\("clear-connection-error"\)/,
  );
});
