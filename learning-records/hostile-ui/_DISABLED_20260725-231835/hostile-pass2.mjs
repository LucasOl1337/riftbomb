/**
 * Hostile UI pass 2 — fresh browser per scenario, hard timeouts.
 */
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = path.join(root, "learning-records/hostile-ui");
const breaksDir = path.join(outDir, "breaks");
const rawDir = path.join(outDir, "videos-raw");
const BASE = "http://127.0.0.1:4177/riftbomb.html";

const attempts = [];
const breaks = [];

async function snap(page) {
  return page.evaluate(() => {
    const card = document.querySelector(".player-card");
    const end = document.getElementById("end-screen");
    return {
      live: document.getElementById("live-status")?.textContent || "",
      kicker: document.getElementById("event-kicker")?.textContent || "",
      scoreline: document.getElementById("match-scoreline")?.textContent || "",
      waveLabel: document.getElementById("wave-label")?.textContent || "",
      waveNumber: document.getElementById("wave-number")?.textContent || "",
      timer: document.getElementById("enemy-count")?.textContent || "",
      endHidden: end?.hidden ?? true,
      endTitle: document.getElementById("end-title")?.textContent || "",
      endScore: document.getElementById("end-score")?.textContent || "",
      endChain: document.getElementById("end-chain")?.textContent || "",
      guideOpen: !!document.getElementById("combat-guide")?.open,
      introGone: document.getElementById("intro")?.classList.contains("is-gone") || false,
      hearts: document.getElementById("hearts")?.getAttribute("aria-label") || "",
      pause: document.getElementById("pause-toggle")?.getAttribute("aria-pressed") || null,
      round: card?.dataset?.round || null,
      blueBombs: card?.dataset?.blueBombs || null,
      redHealth: card?.dataset?.redHealth || null,
      focusId: document.activeElement?.id || null,
      playerName: document.getElementById("player-name")?.textContent || "",
    };
  });
}

function parseScore(s) {
  const m = String(s).match(/(\d+)\s*[—–-]\s*(\d+)/);
  return m ? { b: +m[1], r: +m[2] } : { b: null, r: null };
}

async function start(page, champ = "katarina") {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  if (champ) await page.click(`.champion-choice[data-champion="${champ}"]`);
  await page.click("#start-game");
  await page.waitForFunction(() => document.getElementById("intro")?.classList.contains("is-gone"), null, {
    timeout: 12000,
  });
  await page.waitForTimeout(200);
}

async function scenario(name, fn) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--use-gl=swiftshader"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: rawDir, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("crash", () => errors.push("PAGE_CRASH"));

  const result = { name, break: false, symptom: null, detail: null, errors, video: null };
  try {
    const outcome = await Promise.race([
      fn(page, errors),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout-60s")), 60000)),
    ]);
    result.detail = outcome?.detail ?? null;
    if (outcome?.break) {
      result.break = true;
      result.symptom = outcome.symptom;
    }
  } catch (e) {
    result.detail = String(e.message || e);
    if (/closed|crash|timeout/i.test(result.detail) || errors.includes("PAGE_CRASH")) {
      result.break = true;
      result.symptom = /timeout/i.test(result.detail) ? "scenario-hang-no-feedback" : "page-crash-under-input-storm";
    }
  }

  const raw = page.video() ? await page.video().path().catch(() => null) : null;
  await page.close().catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await new Promise((r) => setTimeout(r, 400));

  if (result.break && raw) {
    let dest = path.join(breaksDir, `${result.symptom}.webm`);
    try {
      await fs.access(dest);
      dest = path.join(breaksDir, `${result.symptom}-${name}.webm`);
    } catch {
      /* new name */
    }
    try {
      await fs.rename(raw, dest);
      result.video = dest;
    } catch {
      try {
        await fs.copyFile(raw, dest);
        result.video = dest;
      } catch {
        /* */
      }
    }
    breaks.push(result);
    console.log("BREAK", result.symptom, result.video);
  } else {
    if (raw) await fs.unlink(raw).catch(() => {});
    console.log(result.break ? "BREAK" : "ok  ", name, result.symptom || "");
    if (result.break) breaks.push(result);
  }
  attempts.push(result);
}

await fs.mkdir(breaksDir, { recursive: true });
await fs.mkdir(rawDir, { recursive: true });

await scenario("double-open-guide", async (page, errors) => {
  await start(page, "katarina");
  await page.click("#open-guide");
  await page.waitForTimeout(100);
  await page.click("#open-guide", { force: true }).catch(() => {});
  await page.locator("#open-guide").dblclick({ force: true }).catch(() => {});
  await page.waitForTimeout(300);
  const s = await snap(page);
  if (/InvalidState|TypeError|undefined/i.test(s.live + s.kicker)) {
    return { break: true, symptom: "guide-error-leaks-to-live-region", detail: { s, errors } };
  }
  return { break: false, detail: { s, errors } };
});

await scenario("input-storm-short", async (page) => {
  await start(page, "vladimir");
  await page.keyboard.press("ArrowLeft");
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Space");
    await page.keyboard.press("Enter");
    await page.keyboard.press("KeyQ");
    await page.keyboard.press("KeyR");
    await page.keyboard.press("KeyW");
    await page.keyboard.press("ArrowDown");
  }
  await page.waitForTimeout(500);
  const s = await snap(page);
  const sc = parseScore(s.scoreline);
  if (sc.b > 3 || sc.r > 3) return { break: true, symptom: "score-overflow-above-match-target", detail: s };
  if ((sc.b >= 3 || sc.r >= 3) && s.endHidden) {
    return { break: true, symptom: "match-point-without-end-screen", detail: s };
  }
  return { break: false, detail: s };
});

await scenario("tab-hide-pause-trap", async (page) => {
  await start(page, "ziggs");
  const before = await snap(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(300);
  const after = await snap(page);
  const timerStuck = Number(after.timer) === Number(before.timer);
  const showsPaused = after.pause === "true" || /paused/i.test(after.live + after.kicker + after.waveLabel);
  if (timerStuck && !showsPaused && after.endHidden) {
    return { break: true, symptom: "silent-pause-after-tab-return", detail: { before, after } };
  }
  return { break: false, detail: { before, after, showsPaused } };
});

await scenario("self-bomb-score", async (page) => {
  await start(page, "ziggs");
  const before = await snap(page);
  await page.keyboard.press("Space");
  await page.waitForTimeout(5200);
  const after = await snap(page);
  const sc = parseScore(after.scoreline);
  if (sc.b < 0 || sc.r < 0) return { break: true, symptom: "negative-score", detail: { before, after } };
  if (Number(after.waveNumber) < Number(before.waveNumber || 1)) {
    return { break: true, symptom: "round-went-backwards", detail: { before, after } };
  }
  if (
    sc.b > (parseScore(before.scoreline).b || 0) &&
    /self-destructed|0 percent/i.test(after.hearts + after.live + after.kicker)
  ) {
    return { break: true, symptom: "dead-player-awarded-round-win", detail: { before, after } };
  }
  return { break: false, detail: { before, after } };
});

await scenario("rapid-during-fuse", async (page) => {
  await start(page, "ziggs");
  await page.keyboard.press("Space");
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Space");
    await page.keyboard.press("KeyQ");
    await page.keyboard.press("KeyP");
  }
  await page.waitForTimeout(3500);
  const s = await snap(page);
  const sc = parseScore(s.scoreline);
  if (sc.b > 3 || sc.r > 3) return { break: true, symptom: "score-overflow", detail: s };
  return { break: false, detail: s };
});

await scenario("idle-12s", async (page) => {
  await start(page, "katarina");
  const before = await snap(page);
  if (before.pause === "true") await page.keyboard.press("KeyP");
  await page.waitForTimeout(12000);
  const after = await snap(page);
  const stuck = Number(after.timer) >= Number(before.timer) && after.endHidden && after.pause !== "true";
  if (stuck) return { break: true, symptom: "timer-frozen-after-idle", detail: { before, after } };
  return { break: false, detail: { before, after, delta: Number(before.timer) - Number(after.timer) } };
});

await scenario("space-on-focused-pause", async (page) => {
  await start(page, "katarina");
  await page.focus("#pause-toggle");
  const before = await snap(page);
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  const after = await snap(page);
  return { break: false, detail: { before, after } };
});

await scenario("paste-html", async (page) => {
  await start(page, "katarina");
  await page.focus("#bomb-action");
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "<script>alert(1)</script>".repeat(20));
    document.activeElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
  });
  const s = await snap(page);
  if (/<script|alert\(1\)/i.test(s.live + s.kicker + s.scoreline)) {
    return { break: true, symptom: "html-injection-in-ui", detail: s };
  }
  return { break: false, detail: s };
});

await scenario("offline", async (page) => {
  await start(page, "ziggs");
  await page.context().setOffline(true);
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);
  const s = await snap(page);
  await page.context().setOffline(false);
  return { break: false, detail: s };
});

await scenario("reload-mid", async (page) => {
  await start(page, "zed");
  await page.keyboard.press("KeyQ");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#start-game");
  return { break: false, detail: await snap(page) };
});

await scenario("two-tabs", async (page) => {
  await start(page, "katarina");
  const p2 = await page.context().newPage();
  await start(p2, "zed");
  await page.keyboard.press("Space");
  await p2.keyboard.press("Space");
  const a = await snap(page);
  const b = await snap(p2);
  await p2.close();
  return { break: false, detail: { a, b } };
});

await scenario("dbl-start", async (page) => {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator("#start-game").dblclick({ delay: 30 });
  await page.waitForTimeout(1000);
  const s = await snap(page);
  if (!s.introGone) return { break: true, symptom: "double-click-start-fails", detail: s };
  return { break: false, detail: s };
});

await scenario("start-timeout", async (page) => {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.click("#start-game");
  const ok = await page
    .waitForFunction(() => document.getElementById("intro")?.classList.contains("is-gone"), null, { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (!ok) return { break: true, symptom: "start-stuck-calibrating-audio", detail: await snap(page) };
  return { break: false, detail: await snap(page) };
});

await scenario("end-double-rematch", async (page) => {
  await start(page, "ziggs");
  await page.keyboard.press("ArrowUp");
  const t0 = Date.now();
  let last = await snap(page);
  while (Date.now() - t0 < 35000) {
    await page.keyboard.press("Space");
    await page.keyboard.press("Enter");
    await page.keyboard.down("KeyW");
    await page.keyboard.down("ArrowDown");
    await page.waitForTimeout(30);
    await page.keyboard.up("KeyW");
    await page.keyboard.up("ArrowDown");
    last = await snap(page);
    if (!last.endHidden) break;
  }
  if (last.endHidden) return { break: false, detail: { note: "no-end", last } };
  await page.locator("#restart-game").dblclick({ delay: 20 });
  await page.waitForTimeout(600);
  let after = await snap(page);
  if (!after.endHidden) {
    await page.click("#restart-game");
    await page.waitForTimeout(400);
    after = await snap(page);
  }
  const sc = parseScore(after.scoreline);
  if (!after.endHidden) return { break: true, symptom: "rematch-leaves-end-screen", detail: { last, after } };
  if ((sc.b > 0 || sc.r > 0) && /Round 01/i.test(after.waveLabel)) {
    return { break: true, symptom: "rematch-keeps-old-score", detail: { last, after } };
  }
  return { break: false, detail: { last, after } };
});

// UI path that exercises grace-window steal: both plant bombs on same tile after invuln
await scenario("mutual-bomb-draw-vs-first-kill", async (page) => {
  await start(page, "ziggs");
  await page.keyboard.press("ArrowUp");
  // wait out spawn invuln
  await page.waitForTimeout(1400);
  // walk both toward center-ish and plant
  for (let i = 0; i < 25; i++) {
    await page.keyboard.down("KeyW");
    await page.keyboard.down("KeyD");
    await page.keyboard.down("ArrowDown");
    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(40);
    await page.keyboard.up("KeyW");
    await page.keyboard.up("KeyD");
    await page.keyboard.up("ArrowDown");
    await page.keyboard.up("ArrowLeft");
    await page.keyboard.press("Space");
    await page.keyboard.press("Enter");
  }
  await page.waitForTimeout(4000);
  const s = await snap(page);
  return { break: false, detail: s };
});

const priorBreak = path.join(breaksDir, "page-crash-under-input-storm.webm");
try {
  await fs.access(priorBreak);
  if (!breaks.some((b) => b.symptom === "page-crash-under-input-storm")) {
    breaks.push({
      name: "prior-pass",
      break: true,
      symptom: "page-crash-under-input-storm",
      video: priorBreak,
      detail: "reproduced in earlier pass under keyboard input storm",
    });
  }
} catch {
  /* */
}

const report = {
  product: "Riftbomb",
  attackedAt: new Date().toISOString(),
  attemptCount: attempts.length,
  breakCount: breaks.length,
  breaks,
  attempts,
};
await fs.writeFile(path.join(outDir, "attack-report.json"), JSON.stringify(report, null, 2));
await fs.writeFile(
  path.join(outDir, "ATTEMPTS.md"),
  [
    "# Hostile UI attack — Riftbomb",
    "",
    `When: ${report.attackedAt}`,
    `Attempts: ${attempts.length}`,
    `Breaks: ${breaks.length}`,
    "",
    "## Breaks",
    ...(breaks.length
      ? breaks.map((b) => `- **${b.symptom}** (${b.name}) → \`${b.video || "?"}\``)
      : ["- none"]),
    "",
    "## All attempts",
    ...attempts.map((a) => `- ${a.break ? "BREAK" : "held"} · ${a.name}${a.symptom ? ` → ${a.symptom}` : ""}`),
    "",
  ].join("\n")
);

console.log("SUMMARY attempts", attempts.length, "breaks", breaks.length);
for (const b of breaks) console.log(" *", b.symptom, b.video || "");
