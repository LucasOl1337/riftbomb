# Changelog

## 2026-08-11

### Release v1.7.0

- Fingerprinted the whole published boot chain by SHA-256 of the served bytes:
  `riftbomb.html` → arena loader → online bridge loader → online runtime.
- Removed every `Content-Encoding` declaration and the manual Brotli
  pre-compression step, so no served byte depends on a custom encoding header
  surviving the asset host.
- Added executable coverage that walks the published chain, verifies each hash
  and parses each link, replacing the assertions that required compressed bytes.
- Added the throwaway `game/human-playtest-prototype/` collaboration-loop
  prototype behind `npm run prototype:human-playtest`.
- Added complete player-facing, agent-attribution and operational notes in
  [`PATCH_NOTES_V1.7.0.md`](PATCH_NOTES_V1.7.0.md).

## 2026-08-03

### Release v1.6.0

- Consolidated the canonical runtime in production with runtime, packaging and
  asset optimizations, PvP UX work, deploy gates and reconnection,
  accessibility and match-flow fixes.

## 2026-07-31

### Release v1.5.0

- Added mouse aim on desktop and drag aim on mobile, with hover targeting for
  Shunpo, Death Lotus and Death Mark.
- Carried aim over the reliable protocol so the authoritative server and client
  prediction resolve identically.

### Release v1.4.0

- Added authored Katarina dagger presentation, the depth-tested Nacre Hollow
  arena scene and the black-bomb material/reference pipeline.
- Consolidated the post-v1.3.0 visual stream with the full 20-round performance
  program and its executable budgets.
- Added complete player-facing, agent-attribution and operational notes in
  [`PATCH_NOTES_V1.4.0.md`](PATCH_NOTES_V1.4.0.md).

## 2026-07-30

### Release v1.3.0

- Consolidated online reliability rounds 9–15: authored ability routing,
  causal movement ACK/replay, authenticated session resume, reliable one-shot
  actions and authoritative Zed Death Mark commitment.
- Added the trained Renekton V1 CPU pilot with advantage evaluation, rival
  modeling, personality and deterministic training coverage.
- Added the authored Salt Lens and Storm-Eye floors with provenance, payload
  budgets and release verification.
- Preserved the complete 20-round performance ledger and the local landing and
  game-feel QA evidence produced by the overnight agents.
- Added complete player-facing and operational notes in
  [`PATCH_NOTES_V1.3.0.md`](PATCH_NOTES_V1.3.0.md).

## 2026-07-28

### Combat HP clarity

- Standardized playable champions on a visible `100 / 100 HP` scale.
- Changed arena bombs from unconditional instant elimination to 35 damage.
- Added exact P1 and P2 health readouts and critical-health signaling.
- Preserved existing champion damage and healing through a documented legacy-value compatibility boundary.
- Added the canonical combat and balance reference in [`game/combat-system.md`](game/combat-system.md).
- Added implementation notes in [`game/patch-note-2026-07-28-combat-hp.md`](game/patch-note-2026-07-28-combat-hp.md).

### Release v1.2.0

- Consolidated the five-arena visual foundation with all six measured
  performance rounds.
- Added three authored floor materials, world-continuous UVs and a shared
  one-draw-call environmental shader.
- Restored the dynamic hashed loader manifest while retaining the optimized
  one-part initial payload and parallel fetch path.
- Added the modular bot WorldView, intent contract and baseline policy with
  snapshot isolation for live blast and pickup objects.
- Added complete player-facing release notes in
  [`PATCH_NOTES_V1.2.0.md`](PATCH_NOTES_V1.2.0.md).
- Removed the selectable score, its media bank, lobby fields and runtime
  implementation.
- Replaced the flat arena thumbnails with isometric previews built from each
  arena's real layout and authored materials.

## 2026-07-27

### Performance

- Parallelized the ten-part online game download (`0a82390`).
- Deferred the optional media bank from the initial online payload (`045b2f6`).
- Moved arena textures out of the initial game payload (`7b8db74`).
- Loaded only the champion models selected for the match (`7148860`).
- Reduced optional sampled-media requests and added regression coverage
  (`757c648`).
- Cached room schema initialization and removed redundant expired-room cleanup
  from reads and joins (`cd61f78`).

The complete before/after measurements and raw runs are in
[`PERFORMANCE.md`](PERFORMANCE.md).
