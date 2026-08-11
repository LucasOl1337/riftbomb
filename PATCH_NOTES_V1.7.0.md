# Riftbomb v1.7.0 — content-addressed delivery and a boot chain that cannot ship undecodable bytes

![Riftbomb v1.7.0 release art](https://github.com/LucasOl1337/riftbomb/blob/v1.7.0/artifacts/release-v1.7.0/cover.png?raw=true)

This release follows v1.6.0 with a single focused change to how the published
game reaches the browser. Every executable in the arena boot chain is now named
by the SHA-256 of the exact bytes it serves, and no served byte depends on a
custom `Content-Encoding` header surviving the asset host.

## Player-facing changes

- A stale or mis-decoded loader can no longer produce a blank arena. The shell,
  the arena loader, the online bridge loader and the online runtime are each
  pinned by content hash, so a browser either gets the exact build the shell
  expects or gets nothing to cache.
- Deploys no longer depend on Cloudflare preserving a hand-written
  `Content-Encoding: br` rule for the boot scripts, champion models and champion
  SFX banks. Previously, if that rule was dropped or rewritten by the asset
  host, the browser received Brotli bytes as if they were JavaScript and the
  game failed to start.
- Repeat visits get correct caching instead of merely aggressive caching. The
  fingerprinted boot assets are served `immutable` for one year, and a new build
  changes the URL rather than relying on cache invalidation.

## Delivery and packaging

- `online/scripts/package-riftbomb.mjs` now fingerprints and emits the whole
  boot chain: `riftbomb-loader-<sha256>.js` → `online-duel-loader-<sha256>.js`
  → `online-duel-<sha256>.js`. Each link's URL is rewritten into its parent, so
  the chain is self-consistent by construction.
- The packager deletes obsolete fingerprinted boot assets on every run, so
  `online/public/` cannot accumulate orphaned executables across builds.
- Champion model scripts, VAT binaries and champion SFX banks are fingerprinted
  over the bytes actually published rather than over a compressed intermediate.
- `online/scripts/compress-online-runtime.mjs` was removed and its invocation
  dropped from `online/scripts/build-verified.sh`. Transport compression is now
  the edge's responsibility, which is the only layer that can negotiate it with
  the client.
- `online/public/_headers` no longer declares any `Content-Encoding`. It
  declares cache policy only.
- The three fingerprinted boot asset families are gitignored. They are build
  output, and `npm run build` regenerates them from tracked sources before the
  Vinext build and before the deploy gates, in CI exactly as locally.

## Executable guarantees added

- `online/tests/client-shell.test.mjs` walks the published boot chain from
  `riftbomb.html`, verifies each link's SHA-256 against its filename, and parses
  each one with `node:vm`. A Brotli blob served under a `.js` name now fails the
  build instead of reaching a player.
- `online/tests/pvp-source.test.mjs` asserts that `_headers` contains no
  `Content-Encoding` directive at all, that published champion SFX bytes are
  byte-identical to their tracked source, and that published model and VAT bytes
  equal their expected decoded payload exactly.
- The previous assertions that required published bytes to be *smaller* than
  decoded bytes were removed, because they encoded the failure mode this release
  fixes.

## Deploy pipeline unblocked

- `online/server/package.json` was missing the `stage:release` script that
  `online/server/tests/stage-release.test.mjs` requires, even though
  `online/server/deploy/stage-release.mjs` exists and runs. That single missing
  entry failed `npm run test:release-gates`, which the workflow runs **before**
  `wrangler`, so the deploy job had been dying before publish on every push to
  `main` since before v1.6.0. Adding the script restores the gate to 13/13.
- This is a pre-existing defect, unrelated to the boot-chain work. It is
  included here because without it merging this release does not deploy.

## Tooling

- Added `game/human-playtest-prototype/`, a throwaway terminal prototype for the
  proposed human-in-the-loop playtest collaboration loop, behind
  `npm run prototype:human-playtest`. It opens no browser, calls no model,
  writes no files and persists no state; it exists to pressure-test the state
  model before any real controller is built.
- `.humanlayer/tasks/` and `.grok-fable/` are gitignored as agent scratch.

## Agent and session attribution

Sessions were reconciled against the local stores for Claude
(`~/.claude/projects`), Codex (`~/.codex/sessions` and the Orca-hosted
`codex-runtime-home`), Grok (`~/.grok/sessions` plus the in-repo `.grok-fable`
slots), Pi (`~/.pi/agent/sessions`), Hermes/HumanLayer (`.humanlayer/`) and
Orca, filtered to this repository and to the window after `v1.6.0`
(2026-08-03 12:44 -03:00).

- **Unattributed authoring session (2026-08-03 and 2026-08-05)** — the entire
  code payload of this release. The human-playtest prototype and its npm script
  were written on 2026-08-03 15:48–15:52; the packaging, headers, shell and test
  changes were written on 2026-08-05 11:51–11:59. No session record for either
  window survives in any local agent store, so no agent is credited. The work
  itself is fully reviewable in the diff and is reproduced byte-for-byte by a
  clean build.
- **Grok** — 12 sessions on 2026-08-09 (8 via the `grok-fable` slots `load`,
  `build`, `headers`, `prediction`, `observability`, `runtimeobs`, `default`,
  `riftbomb-map`). All read-only: network path, prediction/reconciliation,
  startup/load, packaging, headers and observability inventories with
  file:line citations. No file in this release was written by Grok.
- **Claude** — 2 sessions on 2026-08-09 (`4c7b34cc`, `b7398e8b`), running the
  Riptide RPI research skills. Wrote only
  `.humanlayer/tasks/improve-user-experience-and-optimize-network-performance/`
  research documents, which are gitignored and ship nothing.
- **Hermes / HumanLayer** — the RPI ticket, research questions, research
  synthesis and design discussion for the next UX and network-performance
  effort. Planning output only; no implementation is included here.
- **Codex** — last session in this repository was 2026-08-01, before `v1.6.0`.
  No work in this release.
- **Pi** — last session in this repository was 2026-07-29, before `v1.6.0`.
  No work in this release.
- **Orca** — hosts the Codex runtime; no session with this repository as its
  working directory after `v1.6.0`.

## Validation

All suites were run on the release content, not reported from an agent summary.

- Root repository gate: **216/216** passed (`npm test`, which builds the offline
  artifact first).
- Online Worker, packaging and client contracts: **121/121** passed
  (`npm --prefix online run test:root-ready`, which runs the full verified build
  including `package-riftbomb.mjs` and the Vinext artifact validation).
- Authoritative server: **75/75** passed across the core, health-response,
  matchmaking, queue, rate-limit, rematch, resume, runtime-loading,
  serialization and transport suites.
- Online lint: **0 errors**, 10 warnings (three `next/image` choices in
  `page.tsx` and seven unused generated helpers in `bot-v1.js`), down from 11
  warnings at v1.4.0.
- Build reproducibility: a full clean build regenerated the 111 MB offline
  artifact and the entire online package with no change to `git status`, the
  same manifest `f0fbadad…` and the same loader hash `3323b9d6…`.
- Boot chain integrity, verified in `online/dist/client/`:
  `riftbomb.html` → `riftbomb-loader-3323b9d6….js` →
  `online-duel-loader-8f8e0114….js` → `online-duel-8cfab442….js`, each hash
  matching its bytes and each file parsing as JavaScript.
- Release gates: **13/13** passed after the `stage:release` fix
  (`npm --prefix online run test:release-gates`). They were 12/13 at v1.6.0.
- Deploy path audited: `online/scripts/build-verified.sh` runs
  `package-riftbomb.mjs` before the Vinext build, and the workflow runs
  `npm run build` before `test:release-gates` and before `wrangler`. The
  gitignored boot assets are therefore regenerated in CI ahead of both gates.
- Production state confirmed against the live origin, not assumed:
  `https://bombpvp.com/riftbomb-parts/manifest.json` already returns
  `f0fbadad…`, and
  `https://bombpvp.com/riftbomb-loader-3323b9d6….js` returns `200`,
  `text/javascript`, 4424 bytes — directly executable, no custom encoding.
- No Playwright headless or `headless_shell` process was used.

## Known limitations and operations

- **Origin bytes grew where the edge may not compress.** Publishing decoded
  bytes raised the stored champion payload from 36.49 MB to 56.89 MB. The 1.13 MB
  of champion JavaScript is auto-compressed by Cloudflare, but the 53.13 MB of
  VAT `.bin` binaries are `application/octet-stream`, which Cloudflare does not
  auto-compress by default — about **19 MB per full-roster cold load** that
  v1.6.0 shipped compressed. This is a deliberate trade of bytes for
  correctness: the previous scheme was unrecoverable when the encoding header
  was lost. The durable fix is a Cloudflare compression rule for
  `/champion-models/*.bin`, or moving VAT payloads to a container that is
  compressed in transit. It is not addressed in this release.
- Only the selected champions' models are fetched per match, so the practical
  per-match delta is a fraction of the roster figure above. It has not been
  measured per champion.
- The unfingerprinted `riftbomb-loader.js`, `online-duel-loader.js` and
  `online-duel.js` are still published alongside their fingerprinted copies.
  They are the packager's tracked source templates and are no longer referenced
  by the boot chain; removing them from the published output is a follow-up.
- The UX and network-performance work designed in the Hermes RPI documents
  (connection state machine, measured connection quality, keyframe-plus-delta
  snapshots) is planned, not implemented.
- The Worker and the authoritative Oracle origin must still be deployed together
  because the protocol does not negotiate gameplay-rule versions.
- **This release documents and version-controls what production already runs.**
  `bombpvp.com` was updated by a manual `npm run deploy` while `main` stayed on
  `v1.6.0`, because the CI deploy job had been failing at the release gates.
  Production therefore led the repository for the whole window. The v1.6.0
  release note's claim of live manifest `139d1d1f…` has been stale since then.
  Merging this branch makes `main`, CI and the live site agree again; it is not
  expected to change what players receive.
- Publication is not complete until `bombpvp.com` serves the new manifest hash;
  a green deploy job alone is not evidence. Verify with
  `curl -fsS https://bombpvp.com/riftbomb-parts/manifest.json`.
