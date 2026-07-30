# Riftbomb v1.3.0 — reliable online combat and trained Renekton CPU

This release consolidates the overnight agent work into one production line:
the trained V1 CPU opponent, online reliability rounds 9–15, two authored
arena floors, the completed 20-round performance program, and the latest
landing/game-feel QA evidence.

## Player-facing changes

- Renekton's V1 CPU pilot now evaluates advantage, reads rival habits, plans
  safe dashes and executes champion-specific combos. In the recorded seeded
  training run it improved from 0% to 100% wins against the baseline policy.
- Ability casts preserve their authored Q/W/E/R animation identity online.
- Movement and one-shot actions survive packet loss with independent bounded
  sequence, ACK and replay streams.
- A reload can resume the authenticated player seat, match state and transport
  cursors without exposing the resume bearer to URLs or the game bridge.
- Zed's Death Mark now has authoritative commitment, dash, mark and delayed-pop
  phases, including spell-shield and post-mortem settlement behavior.
- Salt Lens and Storm-Eye received readable, original arena floors with
  provenance and payload budgets enforced by tests.
- Landing, loading, not-found and recovery states retain a direct playable CTA
  across desktop and mobile layouts.

## Performance and delivery

- The 20-round sequential performance program is preserved in
  [`PerformanceSwarm.md`](PerformanceSwarm.md), including budgets, benchmarks
  and the final before/after scorecard.
- Arena textures remain lazy and bounded to five initial requests per selected
  theme.
- The published game keeps its fingerprinted one-part loader, with the trained
  bot delivered as the separate `/bot-v1.js` asset.
- Server clocks, serialization, room reads, rate limits and runtime loading are
  bounded and observable.

## Validation

- Root game and repository gate: 190/190 tests.
- Online Worker, packaging and client contracts: 76/76 tests.
- Authoritative server: core, lazy runtime, serialization, rate limiting,
  WebSocket transport, rematch, matchmaking and resume suites all pass.
- No Playwright headless or `headless_shell` process was used.

## Operational note

The Worker and Oracle authoritative origin must be deployed together because
the current protocol does not negotiate gameplay-rule versions. The GitHub
Actions Cloudflare credential used before this release returns API error 9106;
the owner's local Wrangler OAuth session is the verified deployment path until
that repository secret is rotated.
