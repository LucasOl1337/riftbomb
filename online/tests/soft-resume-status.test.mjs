import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("soft-resume recovery copy stays mode-aware on the War Table status", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");

  assert.match(page, /SOFT_RESUME_STATUS_V1/);
  // Solo keeps the treino-specific recovery line.
  assert.match(
    page,
    /Sessão online anterior falhou\. No treino isso não é necessário — clique em Iniciar treino de novo\./,
  );
  // Online modes must not inherit the treino-only soft-resume line.
  assert.match(page, /SOFT_RESUME_STATUS_CTA_V1/);
  assert.match(
    page,
    /Servidor temporariamente indisponível\. Sua sessão foi mantida — toque em Retomar sessão\./,
  );
  assert.doesNotMatch(
    page,
    /Sua sessão foi mantida — toque em Tentar de novo/,
  );
  assert.match(
    page,
    /A sessão anterior não é mais válida\. Gere um novo link ou entre na fila de novo\./,
  );

  const fnStart = page.indexOf("function formatRuntimeStatus");
  assert.notEqual(fnStart, -1);
  const fnEnd = page.indexOf("function modeFormat", fnStart);
  assert.notEqual(fnEnd, -1);
  const body = page.slice(fnStart, fnEnd);

  // Soft-resume branch must check mode === "solo" *inside* softResume, not OR-glue.
  assert.match(body, /const softResume = \/temporarily unavailable\|no longer accepts\|session was kept\/i/);
  assert.match(body, /if \(softResume\)[\s\S]{0,220}if \(mode === "solo"\)/);
  assert.doesNotMatch(
    body,
    /if \(mode === "solo" \|\| \/temporarily unavailable\|no longer accepts\|session was kept\/i\.test\(runtime\.status\)\)/,
  );
});
