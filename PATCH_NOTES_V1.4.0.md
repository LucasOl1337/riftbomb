# Riftbomb v1.4.0 — authored arenas, dagger identity and full performance consolidation

![Riftbomb v1.4.0 release art](https://github.com/LucasOl1337/riftbomb/blob/v1.4.0/artifacts/release-v1.4.0/cover.png?raw=true)

This release follows v1.3.0 with a focused visual pass for the playable arena,
the completed performance swarm, and a single audited release line that keeps
the latest online and offline behavior together.

## Player-facing changes

- Katarina now ships with an authored, readable dagger mesh and presentation
  data. The broad blade remains legible in the arena instead of collapsing into
  a pickup-like silhouette.
- Nacre Hollow has a depth-tested scene with authored nacre growth, reef pieces,
  wet stone and a readable combat floor. The runtime keeps the arena grid and
  collision rules intact while the scene gains real depth and material identity.
- The black bomb presentation has a documented authored reference and a
  material pipeline for the in-game bomb and explosion silhouette.
- The consolidated landing and game shell remove the obsolete frontend path,
  retain direct playable entry, and keep the latest arena and champion art in
  the published bundle.

## Performance and delivery

- The 20-round performance program is complete and integrated in the release
  line. Its ledger and scorecard remain in
  [`PerformanceSwarm.md`](PerformanceSwarm.md).
- Critical game boot is now five static requests cold (four on a warm revisit),
  with a measured critical payload of about 743 KB raw.
- Arena texture boot is bounded to five selected-theme requests, down from 17,
  and the measured selected-theme payload is 2,634,254 B.
- The lobby JavaScript graph is 289,213 B raw / 89,968 B gzip, down from
  331,629 B raw / 103,296 B gzip.
- Published champion VAT binaries are 55,708,794 B across the roster, 25%
  below the original five-champion set.
- Authoritative room clocks, grid snapshots, JSON broadcasts, D1 room writes,
  runtime loading, WebSocket message work and telemetry remain bounded by
  executable tests and benchmarks.

## Agent and session attribution

- **Codex** — the only attributable agent in local/remote Git evidence. The
  post-v1.3.0 visual stream covers the Katarina dagger (`197f8ad`, `1137631`,
  `c8f94c1`, `c9a3f94`), landing consolidation (`6000435`), bundle refresh
  (`7ced852`) and Nacre Hollow (`a4d4fa8`, `ac24769`, `f242547`). The Codex
  performance swarm contributes the 20 sequential rounds and is integrated by
  merge `9e00fff`.
- **Claude, ZCode, Wispr Flow, GROK, PI, FIRSTMATE, WSL, OpenCode and Trae
  Work** — no attributable branch, commit author, reflog entry or repository
  handoff was found locally or on `origin` after `v1.3.0`; no work is assigned
  to these sessions in this release.

## Validation

- Root repository gate: 197/197 tests passed.
- Online Worker, packaging and client contracts: 77/77 tests passed.
- Authoritative server: 53 unique assertions passed across core, lazy runtime,
  serialization, rate limiting, WebSocket transport, rematch, matchmaking and
  resume suites.
- Online lint: 0 errors; 11 non-blocking warnings remain (the known native
  image choices and unused generated bot helpers).
- Git history audit: all 20 recorded performance-round commits and all 39
  commits in the terminal performance chain are ancestors of the release
  branch.
- No Playwright headless or `headless_shell` process was used.

## Known limitations and operations

- The physical-device/mobile QA matrix still contains pending checks, and the
  Zed Death Mark visual QA row remains marked in progress in the historical
  ledger. These are documented follow-ups, not silently treated as verified.
- The GitHub Actions Cloudflare workflow has failed on the recent `main` pushes
  with the previously documented Cloudflare API 9106 credential error. The
  release is therefore prepared with the verified local build and must use the
  authenticated deployment path only after that path succeeds.
- The Worker and authoritative Oracle origin must be deployed together because
  the current protocol does not negotiate gameplay-rule versions.
