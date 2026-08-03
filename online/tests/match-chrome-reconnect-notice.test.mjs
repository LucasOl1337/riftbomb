import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("match chrome surfaces mid-match rival reconnect as a PT-BR status notice", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/war-table.css", root), "utf8"),
  ]);

  assert.match(page, /MATCH_CHROME_RECONNECT_NOTICE_V1/);
  assert.match(page, /data-match-reconnect-notice/);
  assert.match(page, /className="match-reconnect-notice"/);
  assert.match(page, /Oponente reconectou\. A partida continua\./);

  // Notice lives inside match-chrome, not only on the hidden War Table cluster.
  const chromeStart = page.indexOf('className="match-chrome"');
  assert.notEqual(chromeStart, -1);
  const chromeEnd = page.indexOf("</div>", chromeStart);
  const chrome = page.slice(chromeStart, chromeEnd + 6);
  assert.match(chrome, /data-match-reconnect-notice/);
  assert.match(chrome, /reconnected\|Match continues/);
  assert.match(chrome, /role="status"/);
  // Error alert path stays distinct (do not reopen).
  assert.match(chrome, /data-match-connection-alert/);
  assert.match(chrome, /SAIR DA PARTIDA/);

  const fnStart = page.indexOf("function formatRuntimeStatus");
  const fnEnd = page.indexOf("function modeFormat", fnStart);
  const body = page.slice(fnStart, fnEnd);
  assert.match(body, /MATCH_CHROME_RECONNECT_NOTICE_V1/);
  assert.match(body, /reconnected\|Match continues/);
  assert.match(body, /Oponente reconectou\. A partida continua\./);
  // Generic match copy remains as fallback.
  assert.match(body, /Partida em andamento\./);

  assert.match(styles, /MATCH_CHROME_RECONNECT_NOTICE_V1/);
  assert.match(styles, /\.match-reconnect-notice/);
  assert.match(styles, /border:\s*1px solid var\(--rb-success\)/);
});
