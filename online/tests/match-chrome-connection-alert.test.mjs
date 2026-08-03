import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("match chrome surfaces mid-match connection failures as an alert", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/war-table.css", root), "utf8"),
  ]);

  assert.match(page, /MATCH_CHROME_CONNECTION_ALERT_V1/);
  assert.match(page, /data-match-connection-alert/);
  assert.match(page, /className="match-connection-alert"/);
  assert.match(page, /role="alert"/);

  // Alert lives inside match-chrome, not only on the hidden War Table cluster.
  const chromeStart = page.indexOf('className="match-chrome"');
  assert.notEqual(chromeStart, -1);
  const chromeEnd = page.indexOf("</div>", chromeStart);
  const chrome = page.slice(chromeStart, chromeEnd + 6);
  assert.match(chrome, /data-match-connection-alert/);
  assert.match(chrome, /formatRuntimeStatus\(runtime, activeMode\)/);
  assert.match(chrome, /runtime\.tone === "error"/);
  assert.match(chrome, /SAIR DA PARTIDA/);

  // Mid-match disconnect copy must be PT-BR and phase-gated.
  const fnStart = page.indexOf("function formatRuntimeStatus");
  const fnEnd = page.indexOf("function modeFormat", fnStart);
  const body = page.slice(fnStart, fnEnd);
  assert.match(body, /runtime\.phase === "match"/);
  assert.match(body, /Oponente desconectou\. Aguardando reconexão…/);
  assert.match(body, /Oponente saiu\. A partida continua com CPU no lugar\./);
  assert.match(body, /Conexão perdida\. Use SAIR DA PARTIDA e entre de novo\./);

  assert.match(styles, /MATCH_CHROME_CONNECTION_ALERT_V1/);
  assert.match(styles, /\.match-connection-alert/);
  assert.match(styles, /\.match-chrome[\s\S]{0,220}display:\s*flex/);
});
