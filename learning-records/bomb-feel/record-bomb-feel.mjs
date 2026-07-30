// Grava um clipe determinístico da ação central (plantar bomba) para a prova
// antes/depois de game feel. Uso único, autorizado pelo pedido do usuário.
// Uso: node learning-records/bomb-feel/record-bomb-feel.mjs <outDir> <url>
import { chromium } from "playwright";
import fs from "node:fs";

const outDir = process.argv[2] || "learning-records/bomb-feel/raw";
const url = process.argv[3] || "http://127.0.0.1:4177/riftbomb.html";
fs.mkdirSync(outDir, { recursive: true });

// Headed + GPU real: headless cai no SwiftShader (~2fps, câmera lenta 10x).
const browser = await chromium.launch({
  headless: false,
  args: ["--window-size=1300,900", "--use-angle=d3d11", "--ignore-gpu-blocklist"]
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: outDir, size: { width: 1280, height: 720 } }
});
const page = await context.newPage();
const t0 = Date.now();
const log = (msg) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(2)}s] ${msg}`);

await page.goto(url, { waitUntil: "load", timeout: 60000 });
log("page loaded");
await page.waitForSelector("#start-game", { state: "visible", timeout: 30000 });
await page.click("#start-game");
log("start clicked");
await page.waitForSelector("#intro.is-gone", { timeout: 60000 });
log("intro gone — match running");
await page.waitForTimeout(1200);
log("SEQUENCE START");

const sleep = (ms) => page.waitForTimeout(ms);
async function move(keys, ms) {
  for (const key of keys) await page.keyboard.down(key);
  await sleep(ms);
  for (const key of keys) await page.keyboard.up(key);
}
async function bomb() {
  await page.keyboard.press("Space");
  log("BOMB planted");
}

// Ritmo: planta → foge na diagonal → espera a explosão → repete.
await bomb();                       // t≈0.0  explode ~2.35
await move(["KeyW", "KeyD"], 750);
await sleep(1700);
await bomb();                       // t≈2.45 explode ~4.80
await move(["KeyS", "KeyA"], 750);
await sleep(1700);
await bomb();                       // t≈4.90 explode ~7.25
await move(["KeyW", "KeyD"], 750);
await sleep(1700);
await bomb();                       // t≈7.35 explode ~9.70
await move(["KeyS", "KeyA"], 750);
await sleep(1600);
log("SEQUENCE END");

await context.close();
await browser.close();
log("video saved");
