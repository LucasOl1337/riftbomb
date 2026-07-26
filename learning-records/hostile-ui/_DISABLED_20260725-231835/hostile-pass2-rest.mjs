/** Remaining hostile scenarios after hang on input-storm. */
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
      introGone: document.getElementById("intro")?.classList.contains("is-gone") || false,
      hearts: document.getElementById("hearts")?.getAttribute("aria-label") || "",
      pause: document.getElementById("pause-toggle")?.getAttribute("aria-pressed") || null,
      round: card?.dataset?.round || null,
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

async function scenario(name, fn, timeoutMs = 45000) {
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
      new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout-${timeoutMs}ms`)), timeoutMs)),
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
  await new Promise((r) => setTimeout(r, 350));
  if (result.break && raw) {
    let dest = path.join(breaksDir, `${result.symptom}.webm`);
    try {
      await fs.access(dest);
      dest = path.join(breaksDir, `${result.symptom}-${name}.webm`);
    } catch {
      /* */
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

await scenario(
  "guide-doubleclick-pageerror",
  async (page, errors) => {
    await start(page, "katarina");
    await page.locator("#open-guide").dblclick({ delay: 20 });
    await page.waitForTimeout(200);
    const s = await snap(page);
    // pageerror alone is not user-visible; only count if live region leaks or guide stuck closed/open wrong
    if (/InvalidState|TypeError/i.test(s.live + s.kicker)) {
      return { break: true, symptom: "guide-error-leaks-to-live-region", detail: { s, errors } };
    }
    return { break: false, detail: { s, errors } };
  },
  20000
);

await scenario(
  "space-bomb-key-with-pause-focused",
  async (page) => {
    await start(page, "ziggs");
    await page.focus("#pause-toggle");
    // Space = bomb key AND activates focused button → toggles pause while planting
    await page.keyboard.press("Space");
    await page.waitForTimeout(100);
    const mid = await snap(page);
    await page.keyboard.press("Space");
    await page.waitForTimeout(100);
    const after = await snap(page);
    // If timer freezes without pause affordance visible — freeze
    // Here pause should show pressed; not counted as break unless score corrupts
    const sc = parseScore(after.scoreline);
    if (sc.b > 3 || sc.r > 3) return { break: true, symptom: "score-overflow", detail: { mid, after } };
    return { break: false, detail: { mid, after } };
  },
  20000
);

// Record a deliberate input storm with screenshot of freeze: fewer presses, detect timer stop while unpaused
await scenario(
  "input-storm-timer-freeze",
  async (page) => {
    await start(page, "katarina");
    const t0 = await snap(page);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("KeyQ");
      await page.keyboard.press("KeyF");
      await page.keyboard.press("KeyE");
      await page.keyboard.press("KeyR");
      await page.keyboard.press("Space");
      await page.keyboard.press("KeyW");
      await page.keyboard.press("KeyA");
      await page.keyboard.press("KeyS");
      await page.keyboard.press("KeyD");
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(1500);
    const t1 = await snap(page);
    // After 1.5s idle post-storm, timer must have dropped unless paused/ended
    const dropped = Number(t1.timer) < Number(t0.timer);
    if (!dropped && t1.pause !== "true" && t1.endHidden) {
      return { break: true, symptom: "timer-frozen-after-input-storm", detail: { t0, t1 } };
    }
    return { break: false, detail: { t0, t1, dropped } };
  },
  25000
);

// Merge with previous report
let previous = { attempts: [], breaks: [] };
try {
  previous = JSON.parse(await fs.readFile(path.join(outDir, "attack-report.json"), "utf8"));
} catch {
  try {
    // seed from known videos
    previous = { attempts: [], breaks: [] };
  } catch {
    /* */
  }
}

const knownVideos = await fs.readdir(breaksDir).catch(() => []);
for (const file of knownVideos) {
  if (!file.endsWith(".webm")) continue;
  const symptom = file.replace(/\.webm$/, "").replace(/-.*$/, "");
  if (![...breaks, ...(previous.breaks || [])].some((b) => (b.video || "").endsWith(file))) {
    breaks.push({
      name: "on-disk",
      break: true,
      symptom: file.replace(/\.webm$/, ""),
      video: path.join(breaksDir, file),
    });
  }
}

const allAttempts = [...(previous.attempts || []), ...attempts];
const allBreaks = [...(previous.breaks || []), ...breaks];
// dedupe by symptom+name
const seen = new Set();
const dedupedBreaks = [];
for (const b of allBreaks) {
  const key = `${b.symptom}::${b.name}`;
  if (seen.has(key)) continue;
  seen.add(key);
  dedupedBreaks.push(b);
}

const report = {
  product: "Riftbomb",
  attackedAt: new Date().toISOString(),
  attemptCount: allAttempts.length,
  breakCount: dedupedBreaks.length,
  breaks: dedupedBreaks,
  attempts: allAttempts,
};
await fs.writeFile(path.join(outDir, "attack-report.json"), JSON.stringify(report, null, 2));
await fs.writeFile(
  path.join(outDir, "ATTEMPTS.md"),
  [
    "# Hostile UI attack — Riftbomb",
    "",
    `When: ${report.attackedAt}`,
    `Attempts logged: ${report.attemptCount}`,
    `Breaks: ${report.breakCount}`,
    "",
    "## Breaks (video evidence)",
    ...dedupedBreaks.map((b) => `- **${b.symptom}** (${b.name}) → \`${b.video || "?"}\``),
    "",
    "## All attempts (this + prior passes)",
    ...allAttempts.map((a) => `- ${a.break ? "BREAK" : "held"} · ${a.name}${a.symptom ? ` → ${a.symptom}` : ""}`),
    "",
    "## Rules of engagement",
    "- Only mouse/keyboard through the UI",
    "- Break = data gone, score/count duplicate, silent freeze, internal leak, destructive without confirm, duplicate entity",
    "- Not counted: ugly, slow, bad copy",
    "",
  ].join("\n")
);

console.log("SUMMARY attempts", allAttempts.length, "breaks", dedupedBreaks.length);
for (const b of dedupedBreaks) console.log(" *", b.symptom, b.video || "");
