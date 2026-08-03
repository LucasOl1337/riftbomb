import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("arena boot failure offers an actionable reload CTA", async () => {
  const loader = await readFile(new URL("public/riftbomb-loader.js", root), "utf8");

  assert.match(loader, /LOADER_ERROR_RETRY_V1/);
  assert.match(loader, /Não foi possível carregar o jogo\./);
  assert.match(loader, /data-loader-retry|dataset\.loaderRetry/);
  assert.match(loader, /Tentar de novo/);
  assert.match(loader, /location\.reload\(\)/);
  assert.match(loader, /role", "alert"|setAttribute\("role", "alert"\)/);
  assert.doesNotMatch(
    loader,
    /status\.textContent = "Não foi possível carregar o jogo\. Atualize a página\."/,
  );
});
