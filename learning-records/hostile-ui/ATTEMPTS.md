# Hostile UI attack — Riftbomb

**When:** 2026-07-26 (local)
**Product:** offline arena duel at `http://127.0.0.1:4177/riftbomb.html`
**Method:** mouse + keyboard only through the page (Playwright headed-off Chromium as hostile user). No direct `game.*` calls during attacks.
**Not fixed.** This is the accusation pass.

## Answer: how long to break it?

**Under 5 minutes** of hostile play for the first hard break (keyboard input storm → hang/crash).  
Grace-window score theft is available the first time both fighters die inside the 0.16s decision window after a first kill.

## Breaks with video

| # | Symptom | Evidence |
|---|---------|----------|
| 1 | **page-crash-under-input-storm** | `learning-records/hostile-ui/breaks/page-crash-under-input-storm.webm` |
| 2 | **scenario-hang-no-feedback** | `learning-records/hostile-ui/breaks/scenario-hang-no-feedback.webm` |
| 3 | **scenario-hang-no-feedback-two-tabs** | `learning-records/hostile-ui/breaks/scenario-hang-no-feedback-two-tabs.webm` |

### What each break is

1. **Crash under input storm** — start a match, spam WASD + Q/F/E/R + Space + arrows/Enter (local P2). The tab/page dies. Silent death of the session = freeze with no recovery UI.
2. **Hang under input storm** — same class of abuse; the session stops responding for 60s+ with no “please wait” / error. Timer/play stall without a message.
3. **Two-tab hang** — open two tabs, both playing; one or both stop responding under concurrent keyboard use.

### Logic break (score) without separate UI video

4. **grace-window-steals-first-kill-win** — after a kill, `roundDecisionTimer = 0.16`. Finalize only checks who is still alive. If the killer dies inside that window, the product announces **Double knockout · draw** and awards **0–0**, erasing the first elimination. Reproduced against `Game` rules (same module the UI runs). Automated test: `game/hostile-ui-breaks.test.mjs`.

5. **start-stays-armed-after-play** — `beginGame` sets `#start-game` disabled, starts the match, then sets `disabled = false` again. Intro is `pointer-events: none`, so pure mouse usually cannot click it, but the destructive control is re-armed mid-match (Space/Enter activation if focus returns). Automated test fails on source today.

## Automated tests (fail today — accusation)

Disabled on disk as `game/hostile-ui-breaks.test.mjs.DISABLED` (see `STOP-HEADLESS-PLAYWRIGHT.md`). To re-enable only with explicit user permission:

```
node --test game/hostile-ui-breaks.test.mjs
```

All three fail on current product:

1. `grace-window-steals-first-kill-win`
2. `start-stays-armed-after-play`
3. `input-storm-must-not-hang-or-crash`

## Attempts that held (no break under the stated definition)

- double-click Start
- champion spam then Start
- bomb spam into wall / capacity overflow
- pause thrash + bomb while paused
- guide open/close, Escape, double open guide (console noise only; no user-visible leak)
- tab-away auto-pause / return
- ability dock double-click
- offline mid-match (offline HTML stays playable)
- browser Back after start (leaves the product — expected)
- idle 12–20s (timer kept advancing when unpaused)
- self-bomb score integrity (no negative score, no dead-player win)
- paste HTML/emoji onto controls (no injection into live UI)
- reload mid-match (clean return to intro)
- audio-blocked / calibrating start (completed)
- Space while pause focused (quirky dual-bind; no score corruption observed)
- force end + double rematch (could not finish a full first-to-3 inside budget; no rematch corruption observed in partial runs)

## Product promises under attack

From UI copy / rules:

- First to **3** round wins
- Match scoreline and round timer
- Pause on tab hide
- Local P2 via arrows
- Offline single-file game

## What does NOT count (skipped on purpose)

Ugly chrome, slow WebGL, awkward copy, “score” tile that is crate count — design, not integrity.

## How to re-run the attack harness

**Stopped.** Scripts live under `_DISABLED_20260725-231835/` and must not be auto-run (headless_shell CPU loop). Only with explicit user permission:

```powershell
python -m http.server 4177 --bind 127.0.0.1
# node learning-records/hostile-ui/_DISABLED_20260725-231835/hostile-pass2.mjs
# node learning-records/hostile-ui/_DISABLED_20260725-231835/hostile-pass2-rest.mjs
# node --test game/hostile-ui-breaks.test.mjs   # after renaming off .DISABLED
```
