import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("kept soft-resume failure retries via resume-session, not a fresh lobby", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");

  assert.match(page, /SOFT_RESUME_RETRY_V1/);
  assert.match(page, /data-soft-resume-retry/);
  assert.match(page, /RETOMAR SESSÃO/);
  assert.match(page, /sendCommand\("resume-session"\)/);
  assert.match(page, /Retomar sessão online mantida após falha temporária/);

  const fnStart = page.indexOf("function launchSelectedMode");
  assert.notEqual(fnStart, -1);
  const fnEnd = page.indexOf("const leaveLobby", fnStart);
  assert.notEqual(fnEnd, -1);
  const body = page.slice(fnStart, fnEnd);

  // Soft-resume kept-session branch must live inside the sticky offline error cleanup.
  assert.ok(body.includes('runtime.tone === "error" && runtime.role === "offline"'));
  assert.ok(body.includes('sendCommand("resume-session")'));
  assert.ok(body.includes("SOFT_RESUME_RETRY_V1"));
  assert.match(
    body,
    /temporarily unavailable\|session was kept[\s\S]{0,280}sendCommand\("resume-session"\)/,
  );
  // Invalid-session copy must NOT take the resume-session short-circuit.
  assert.match(body, /!\/no longer accepts\/i\.test\(runtime\.status\)/);
  // Solo stays on the normal treino launch path.
  assert.match(body, /activeMode !== "solo"/);
  // Still ban chooseOffline wipe on retry.
  assert.doesNotMatch(
    body,
    /tone === "error"[\s\S]{0,220}sendCommand\("clear-connection-error"\)/,
  );
});
