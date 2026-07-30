# Changelog

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
