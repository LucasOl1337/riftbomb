# DISABLED — do NOT run Playwright hostile-ui here

These scripts (hostile-pass2.mjs, hostile-pass2-rest.mjs, probe-grace-window.mjs, hostile-attack.mjs)
were burning 50%+ CPU via headless_shell (Playwright Chromium) in a loop spawned by a Grok agent.

User request 2026-07-25: stop permanently. Scripts moved into this folder.

To re-enable intentionally: move the .mjs files back to the parent folder and run manually.
DO NOT auto-run from agents without explicit user permission.
