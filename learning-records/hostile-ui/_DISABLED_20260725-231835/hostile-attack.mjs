/**
 * Hostile UI attack — mouse/keyboard only. One video per confirmed break.
 */
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = path.join(root, "learning-records/hostile-ui");
const videoRaw = path.join(outDir, "videos-raw");
const videoBreaks = path.join(outDir, "breaks");
const BASE = "http://127.0.0.1:4177/riftbomb.html";

const attempts = [];
const breaks = [];

const looksBroken = (t) =>
  /TypeError|ReferenceError|undefined is not|null is not|NaN|Internal Server|stack trace|Cannot read|PAGE_CRASH/i.test(
    String(t || "")
  );

function parseScore(scoreline) {
  const m = String(scoreline).match(/(\d+)\s*[—–-]\s*(\d+)/);
  return m ? { blue: Number(m[1]), red: Number(m[2]) } : { blue: null, red: null };
}

async function snap(page) {
  return page.evaluate(() => {
    const card = document.querySelector(".player-card");
    const end = document.getElementById("end-screen");
    const guide = document.getElementById("combat-guide");
    return {
      live: document.getElementById("live-status")?.textContent || "",
      kicker: document.getElementById("event-kicker")?.textContent || "",
      scoreline: document.getElementById("match-scoreline")?.textContent || "",
      waveLabel: document.getElementById("wave-label")?.textContent || "",
      waveNumber: document.getElementById("wave-number")?.textContent || "",
      timer: document.getElementById("enemy-count")?.textContent || "",
      crates: document.getElementById("score")?.textContent || "",
      playerName: document.getElementById("player-name")?.textContent || "",
      endHidden: end?.hidden ?? true,
      endTitle: document.getElementById("end-title")?.textContent || "",
      endScore: document.getElementById("end-score")?.textContent || "",
      endChain: document.getElementById("end-chain")?.textContent || "",
      guideOpen: !!guide?.open,
      introGone: document.getElementById("intro")?.classList.contains("is-gone") || false,
      chromeHidden: document.getElementById("chrome")?.classList.contains("is-hidden") || false,
      startDisabled: !!document.getElementById("start-game")?.disabled,
      startText: (document.getElementById("start-game")?.textContent || "").trim(),
      focusId: document.activeElement?.id || document.activeElement?.tagName || null,
      round: card?.dataset?.round || null,
      blueBombs: card?.dataset?.blueBombs || null,
      redBombs: card?.dataset?.redBombs || null,
      redHealth: card?.dataset?.redHealth || null,
      heartsLabel: document.getElementById("hearts")?.getAttribute("aria-label") || "",
      pausePressed: document.getElementById("pause-toggle")?.getAttribute("aria-pressed") || null,
    };
  });
}

async function startFresh(page, champion = null) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForSelector("#start-game", { timeout: 20000 });
  if (champion) {
    await page.click(`.champion-choice[data-champion="${champion}"]`, { timeout: 5000 });
    await page.waitForTimeout(80);
  }
  await page.click("#start-game", { timeout: 5000 });
  await page.waitForFunction(
    () => document.getElementById("intro")?.classList.contains("is-gone"),
    null,
    { timeout: 12000 }
  );
  await page.waitForTimeout(250);
}

async function safeKeys(page, codes, holdMs = 40) {
  if (page.isClosed()) throw new Error("page closed");
  for (const code of codes) {
    await page.keyboard.down(code);
  }
  await page.waitForTimeout(holdMs);
  for (const code of codes) {
    try {
      await page.keyboard.up(code);
    } catch {
      /* ignore */
    }
  }
}

async function saveBreakVideo(page, symptom) {
  const video = page.video();
  const raw = video ? await video.path().catch(() => null) : null;
  try {
    await page.close({ runBeforeUnload: false });
  } catch {
    /* */
  }
  if (!raw) return null;
  await new Promise((r) => setTimeout(r, 500));
  const dest = path.join(videoBreaks, `${symptom}.webm`);
  try {
    await fs.rename(raw, dest);
  } catch {
    try {
      await fs.copyFile(raw, dest);
    } catch {
      return null;
    }
  }
  return dest;
}

async function discardVideo(page) {
  const video = page.video();
  const raw = video ? await video.path().catch(() => null) : null;
  try {
    await page.close({ runBeforeUnload: false });
  } catch {
    /* */
  }
  if (raw) {
    await new Promise((r) => setTimeout(r, 200));
    await fs.unlink(raw).catch(() => {});
  }
}

async function withScenario(browser, name, fn) {
  const result = { name, break: false, symptom: null, detail: null, consoleErrors: [], video: null };
  let context;
  let page;
  try {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: { dir: videoRaw, size: { width: 1280, height: 720 } },
    });
    page = await context.newPage();
  } catch (error) {
    result.break = true;
    result.symptom = "browser-dead-before-scenario";
    result.detail = String(error);
    breaks.push(result);
    attempts.push(result);
    console.log("BREAK", result.symptom, name);
    return result;
  }

  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("crash", () => consoleErrors.push("PAGE_CRASH"));

  try {
    const outcome = await Promise.race([
      fn(page),
      new Promise((_, reject) => setTimeout(() => reject(new Error("scenario-timeout-90s")), 90000)),
    ]);
    result.consoleErrors = consoleErrors.slice(0, 20);
    result.detail = outcome?.detail ?? null;
    if (outcome?.break) {
      result.break = true;
      result.symptom = outcome.symptom;
      breaks.push(result);
      result.video = await saveBreakVideo(page, outcome.symptom);
      console.log("BREAK", outcome.symptom, result.video);
    } else {
      await discardVideo(page);
      console.log("ok  ", name);
    }
  } catch (error) {
    const msg = String(error?.message || error);
    result.detail = msg;
    result.consoleErrors = consoleErrors.slice(0, 20);
    const crashed = /closed|crash|PAGE_CRASH|Browser closed|scenario-timeout/i.test(msg);
    if (crashed) {
      result.break = true;
      result.symptom = /timeout/i.test(msg) ? "scenario-hang-no-feedback" : "page-crash-under-input-storm";
      breaks.push(result);
      try {
        result.video = await saveBreakVideo(page, result.symptom);
      } catch {
        /* */
      }
      console.log("BREAK", result.symptom, result.video || "(no video)");
    } else {
      console.log("ERR ", name, msg.slice(0, 160));
      await discardVideo(page).catch(() => {});
    }
  }

  await context.close().catch(() => {});
  attempts.push(result);
  return result;
}

async function main() {
  await fs.mkdir(videoRaw, { recursive: true });
  await fs.mkdir(videoBreaks, { recursive: true });

  let browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--use-gl=swiftshader"],
  });

  const run = async (name, fn) => {
    if (!browser.isConnected()) {
      browser = await chromium.launch({
        headless: true,
        args: ["--disable-dev-shm-usage", "--use-gl=swiftshader"],
      });
    }
    return withScenario(browser, name, fn);
  };

  await run("double-click-start", async (page) => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.locator("#start-game").dblclick({ delay: 40 });
    await page.waitForTimeout(1200);
    const s = await snap(page);
    if (looksBroken(s.live + s.kicker) || !s.introGone) {
      return { break: true, symptom: "double-click-start-fails", detail: s };
    }
    return { break: false, detail: s };
  });

  await run("champion-spam-then-start", async (page) => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    for (const c of ["zed", "renekton", "vladimir", "ziggs", "katarina"]) {
      await page.click(`.champion-choice[data-champion="${c}"]`);
    }
    await page.click("#start-game");
    await page.waitForFunction(() => document.getElementById("intro")?.classList.contains("is-gone"));
    const s = await snap(page);
    if (!/Katarina/i.test(s.playerName + s.scoreline) || looksBroken(s.live)) {
      return { break: true, symptom: "champion-select-desync", detail: s };
    }
    return { break: false, detail: s };
  });

  await run("bomb-spam-wall", async (page) => {
    await startFresh(page, "ziggs");
    for (let i = 0; i < 15; i++) {
      await safeKeys(page, ["KeyA"], 30);
      await page.keyboard.press("Space");
      await page.keyboard.press("KeyQ");
    }
    await page.waitForTimeout(600);
    const s = await snap(page);
    if (looksBroken(s.live + s.kicker) || Number(s.blueBombs) > 5) {
      return { break: true, symptom: "bomb-count-overflow", detail: s };
    }
    return { break: false, detail: s };
  });

  await run("pause-thrash", async (page) => {
    await startFresh(page, "katarina");
    await page.keyboard.press("KeyP");
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Space");
      await page.keyboard.press("KeyQ");
    }
    await page.keyboard.press("KeyP");
    await page.keyboard.press("KeyP");
    await page.keyboard.press("KeyP");
    await page.waitForTimeout(200);
    const s = await snap(page);
    if (looksBroken(s.live + s.kicker)) {
      return { break: true, symptom: "pause-thrash-error-leak", detail: s };
    }
    return { break: false, detail: s };
  });

  await run("guide-trap", async (page) => {
    await startFresh(page, "zed");
    await page.keyboard.press("KeyH");
    await page.waitForTimeout(150);
    for (const k of ["Space", "KeyQ", "Escape", "Enter", "KeyP"]) await page.keyboard.press(k);
    await page.keyboard.press("KeyH");
    await page.waitForTimeout(150);
    let s = await snap(page);
    if (s.guideOpen) {
      await page.click("#close-guide").catch(() => {});
      await page.waitForTimeout(100);
      s = await snap(page);
    }
    if (s.guideOpen) return { break: true, symptom: "guide-refuses-to-close", detail: s };
    return { break: false, detail: s };
  });

  await run("tab-away-return", async (page) => {
    await startFresh(page, "renekton");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(300);
    await page.keyboard.press("Space");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(200);
    const s = await snap(page);
    if (looksBroken(s.live + s.kicker)) {
      return { break: true, symptom: "tab-switch-error-leak", detail: s };
    }
    // product auto-pauses on hide; if not paused, that's soft but not counted unless crash
    return { break: false, detail: s };
  });

  await run("local-pvp-chaos", async (page) => {
    await startFresh(page, "vladimir");
    await page.keyboard.press("ArrowLeft");
    for (let i = 0; i < 20; i++) {
      if (page.isClosed()) {
        return { break: true, symptom: "page-crash-under-input-storm", detail: { i } };
      }
      await page.keyboard.press("Space");
      await page.keyboard.press("Enter");
      await page.keyboard.press("KeyQ");
      await page.keyboard.press("KeyF");
      await page.keyboard.press("KeyE");
      await page.keyboard.press("KeyR");
      await safeKeys(page, i % 2 ? ["KeyW", "ArrowDown"] : ["KeyD", "ArrowRight"], 25);
    }
    await page.waitForTimeout(800);
    const s = await snap(page);
    const score = parseScore(s.scoreline);
    if (looksBroken(s.live + s.kicker)) {
      return { break: true, symptom: "pvp-chaos-error-leak", detail: s };
    }
    if (score.blue > 3 || score.red > 3) {
      return { break: true, symptom: "pvp-chaos-score-overflow", detail: s };
    }
    if ((score.blue >= 3 || score.red >= 3) && s.endHidden) {
      return { break: true, symptom: "match-point-without-end-screen", detail: s };
    }
    return { break: false, detail: s };
  });

  await run("ability-doubleclick", async (page) => {
    await startFresh(page, "katarina");
    for (const id of ["#bomb-action", "#dash-action", "#mine-action", "#ult-action"]) {
      await page.locator(id).dblclick({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(400);
    const s = await snap(page);
    if (looksBroken(s.live + s.kicker)) {
      return { break: true, symptom: "ability-doubleclick-error", detail: s };
    }
    return { break: false, detail: s };
  });

  await run("offline-midmatch", async (page) => {
    await startFresh(page, "ziggs");
    await page.context().setOffline(true);
    await page.waitForTimeout(400);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Space");
      await page.keyboard.press("KeyD");
    }
    const offline = await snap(page);
    await page.context().setOffline(false);
    await page.waitForTimeout(200);
    const online = await snap(page);
    if (looksBroken(offline.live) || looksBroken(online.live) || !online.introGone) {
      return { break: true, symptom: "offline-corrupts-session", detail: { offline, online } };
    }
    return { break: false, detail: { offline, online } };
  });

  await run("browser-back-after-start", async (page) => {
    await page.goto("http://127.0.0.1:4177/", { waitUntil: "domcontentloaded" });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.click("#start-game");
    await page.waitForFunction(() => document.getElementById("intro")?.classList.contains("is-gone"));
    await page.goBack();
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ url: location.href, hasStart: !!document.getElementById("start-game") }));
    return { break: false, detail: after };
  });

  await run("idle-20s", async (page) => {
    await startFresh(page, "katarina");
    // clear pause if any
    const before = await snap(page);
    if (before.pausePressed === "true") await page.keyboard.press("KeyP");
    await page.waitForTimeout(20000);
    const after = await snap(page);
    const t0 = Number(before.timer);
    const t1 = Number(after.timer);
    const stuck = Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0 && after.endHidden;
    const paused = after.pausePressed === "true" || /paused/i.test(after.live + after.kicker);
    if (stuck && !paused) {
      return { break: true, symptom: "timer-frozen-after-idle", detail: { before, after } };
    }
    if (looksBroken(after.live + after.kicker)) {
      return { break: true, symptom: "idle-error-leak", detail: { before, after } };
    }
    return { break: false, detail: { before, after, delta: t0 - t1 } };
  });

  await run("self-bomb", async (page) => {
    await startFresh(page, "ziggs");
    await page.keyboard.press("Space");
    await page.waitForTimeout(3000);
    const afterBlast = await snap(page);
    await page.waitForTimeout(2800);
    const afterRound = await snap(page);
    const score = parseScore(afterRound.scoreline);
    if (looksBroken(afterBlast.live + afterRound.live)) {
      return { break: true, symptom: "self-bomb-error-leak", detail: { afterBlast, afterRound } };
    }
    if (score.blue > 3 || score.red > 3) {
      return { break: true, symptom: "round-win-overflow", detail: { afterRound } };
    }
    return { break: false, detail: { afterBlast, afterRound } };
  });

  await run("force-end-double-restart", async (page) => {
    await startFresh(page, "ziggs");
    await page.keyboard.press("ArrowUp");
    const startAt = Date.now();
    let last = await snap(page);
    while (Date.now() - startAt < 40000) {
      await page.keyboard.press("Space");
      await page.keyboard.press("Enter");
      await safeKeys(page, ["KeyW", "KeyD", "ArrowLeft", "ArrowDown"], 30);
      last = await snap(page);
      if (!last.endHidden) break;
      const sc = parseScore(last.scoreline);
      if (sc.blue >= 3 || sc.red >= 3) {
        await page.waitForTimeout(2500);
        last = await snap(page);
        if (!last.endHidden) break;
      }
    }
    if (last.endHidden) return { break: false, detail: { note: "match-not-finished", last } };

    await page.locator("#restart-game").dblclick({ delay: 25 });
    await page.waitForTimeout(500);
    let after = await snap(page);
    if (!after.endHidden) {
      await page.click("#restart-game");
      await page.waitForTimeout(400);
      after = await snap(page);
    }
    const sc = parseScore(after.scoreline);
    if (!after.endHidden) {
      return { break: true, symptom: "rematch-leaves-end-screen", detail: { last, after } };
    }
    if ((sc.blue > 0 || sc.red > 0) && /Round 01/i.test(after.waveLabel)) {
      return { break: true, symptom: "rematch-keeps-old-score", detail: { last, after } };
    }
    if (Number(after.waveNumber) > 10) {
      return { break: true, symptom: "rematch-round-number-explodes", detail: after };
    }
    return { break: false, detail: { last, after } };
  });

  await run("paste-garbage", async (page) => {
    await startFresh(page, "katarina");
    await page.focus("#bomb-action");
    const junk = "<img src=x onerror=alert(1)>".repeat(30) + "\u{1F4A3}".repeat(80);
    await page.evaluate((text) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      document.activeElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
    }, junk);
    const s = await snap(page);
    if (looksBroken(s.live + s.kicker) || /<img|onerror/i.test(s.live + s.kicker + s.scoreline)) {
      return { break: true, symptom: "paste-html-leaks-into-ui", detail: s };
    }
    return { break: false, detail: s };
  });

  await run("tab-cycle-space", async (page) => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      if ((await page.evaluate(() => document.activeElement?.id)) === "start-game") break;
    }
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.getElementById("intro")?.classList.contains("is-gone"), null, {
      timeout: 12000,
    });
    for (let i = 0; i < 20; i++) await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => ({
      id: document.activeElement?.id,
      text: (document.activeElement?.textContent || "").trim().slice(0, 40),
    }));
    const before = await snap(page);
    await page.keyboard.press("Space");
    await page.waitForTimeout(600);
    const after = await snap(page);
    if (/Rift Bomber started/i.test(after.live + after.kicker)) {
      return { break: true, symptom: "space-reactivates-start-wipes-match", detail: { focused, before, after } };
    }
    const b = parseScore(before.scoreline);
    const a = parseScore(after.scoreline);
    if ((b.blue > 0 || b.red > 0) && a.blue === 0 && a.red === 0 && after.endHidden) {
      return { break: true, symptom: "score-wiped-without-confirmation", detail: { focused, before, after } };
    }
    return { break: false, detail: { focused, before, after } };
  });

  await run("pause-button-doubleclick", async (page) => {
    await startFresh(page, "katarina");
    await page.locator("#pause-toggle").dblclick({ force: true });
    await page.locator("#pause-toggle").dblclick({ force: true });
    const s = await snap(page);
    if (looksBroken(s.live + s.kicker)) return { break: true, symptom: "pause-button-error", detail: s };
    return { break: false, detail: s };
  });

  await run("audio-blocked-start", async (page) => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.click("#start-game");
    const started = await page
      .waitForFunction(() => document.getElementById("intro")?.classList.contains("is-gone"), null, { timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    const s = await snap(page);
    if (!started) return { break: true, symptom: "start-stuck-calibrating-audio", detail: s };
    return { break: false, detail: s };
  });

  await run("reload-midmatch", async (page) => {
    await startFresh(page, "zed");
    await page.keyboard.press("Space");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#start-game");
    const s = await snap(page);
    if (looksBroken(s.live) || (s.introGone && s.chromeHidden && !s.startText)) {
      return { break: true, symptom: "reload-leaves-broken-shell", detail: s };
    }
    return { break: false, detail: s };
  });

  await run("two-tabs", async (page) => {
    await startFresh(page, "katarina");
    const pageB = await page.context().newPage();
    await startFresh(pageB, "zed");
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Space");
      await pageB.keyboard.press("Space");
    }
    const a = await snap(page);
    const b = await snap(pageB);
    await pageB.close();
    if (looksBroken(a.live) || looksBroken(b.live)) {
      return { break: true, symptom: "two-tabs-error-leak", detail: { a, b } };
    }
    return { break: false, detail: { a, b } };
  });

  // Focused probe: after start, is Start still enabled under a hidden intro?
  await run("start-still-armed-midmatch", async (page) => {
    await startFresh(page, "katarina");
    await page.waitForTimeout(500);
    const state = await page.evaluate(() => {
      const start = document.getElementById("start-game");
      const intro = document.getElementById("intro");
      return {
        disabled: start?.disabled,
        introVisibility: intro ? getComputedStyle(intro).visibility : null,
        introPointerEvents: intro ? getComputedStyle(intro).pointerEvents : null,
        startVisibility: start ? getComputedStyle(start).visibility : null,
      };
    });
    // Hostile: force-click through pointer-events is NOT allowed. Only real path:
    // temporarily the product re-enables Start after beginGame — if pointer-events none, OK.
    if (state.disabled === false && state.introPointerEvents !== "none" && state.introVisibility !== "hidden") {
      return { break: true, symptom: "start-button-still-clickable-midmatch", detail: state };
    }
    return { break: false, detail: state };
  });

  // Score integrity after self-elim via Space stay
  await run("score-after-self-elim", async (page) => {
    await startFresh(page, "ziggs");
    const before = await snap(page);
    await page.keyboard.press("Space");
    // wait fuse + transition
    await page.waitForTimeout(5500);
    const after = await snap(page);
    const sc = parseScore(after.scoreline);
    // Red should have 1 or draw keeps 0-0 and next round
    if (sc.blue < 0 || sc.red < 0) {
      return { break: true, symptom: "negative-score", detail: { before, after } };
    }
    // If player died (hearts empty or round advanced) score must not invent wins for dead side incorrectly
    if (sc.blue >= 1 && /eliminated|self-destructed|0 percent/i.test(after.heartsLabel + after.live + after.kicker)) {
      // blue scored while dead? only possible if round already next - check wave
    }
    if (Number(after.waveNumber) < Number(before.waveNumber || 1)) {
      return { break: true, symptom: "round-went-backwards", detail: { before, after } };
    }
    return { break: false, detail: { before, after } };
  });

  await browser.close().catch(() => {});

  const report = {
    product: "Riftbomb",
    attackedAt: new Date().toISOString(),
    baseUrl: BASE,
    attemptCount: attempts.length,
    breakCount: breaks.length,
    breaks,
    attempts,
  };
  await fs.writeFile(path.join(outDir, "attack-report.json"), JSON.stringify(report, null, 2));
  await fs.writeFile(
    path.join(outDir, "ATTEMPTS.md"),
    [
      "# Hostile UI attack log — Riftbomb",
      "",
      `When: ${report.attackedAt}`,
      `Attempts: ${attempts.length}`,
      `Breaks found: ${breaks.length}`,
      "",
      "## Breaks (with video)",
      ...(breaks.length
        ? breaks.map((b) => `- **${b.symptom}** (${b.name}) → \`${b.video || "no-video"}\``)
        : ["- none"]),
      "",
      "## Every attempt",
      ...attempts.map((a) => `- ${a.break ? "BREAK" : "held"} · **${a.name}**${a.symptom ? ` → ${a.symptom}` : ""}`),
      "",
      "## What counts as break here",
      "Data gone, score/count duplicate, silent freeze, internal error leak, destructive action without confirm, duplicate entities.",
      "Not counted: ugly, slow, bad copy.",
      "",
    ].join("\n")
  );

  console.log("\n=== SUMMARY ===");
  console.log("attempts", attempts.length, "breaks", breaks.length);
  for (const b of breaks) console.log(" *", b.symptom, b.video);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
