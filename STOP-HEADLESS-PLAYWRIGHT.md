# STOP — Playwright hostile-ui / headless_shell

User explicitly forbade auto-running these (2026-07-25):

- learning-records/hostile-ui/*.mjs (moved to _DISABLED_*)
- game/hostile-ui-breaks.test.mjs (renamed .DISABLED)

Reason: agents kept spawning Playwright `headless_shell` in a loop (~50%+ CPU), relaunching after kill.

**Do not** recreate, re-run, or write new Playwright headless scrapers/tests for hostile-ui unless the user says so in the same message.

If you need UI verification, prefer screenshots from a visible browser the user controls, or ask first.
