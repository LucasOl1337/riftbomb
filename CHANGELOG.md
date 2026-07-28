# Changelog

## 2026-07-28

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

## 2026-07-27

### Performance

- Parallelized the ten-part online game download (`0a82390`).
- Deferred the online soundtrack bank until music is requested (`045b2f6`).
- Moved arena textures out of the initial game payload (`7b8db74`).
- Loaded only the champion models selected for the match (`7148860`).
- Loaded and cached only the exact samples used by the selected soundtrack
  style, with full-loop source-pitch regression coverage (`757c648`).
- Cached room schema initialization and removed redundant expired-room cleanup
  from reads and joins (`cd61f78`).

The complete before/after measurements and raw runs are in
[`PERFORMANCE.md`](PERFORMANCE.md).
