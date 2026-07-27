# Native Imagine arena set — clarity pass

Generated as native sources with the built-in image generation workflow. No upscale or synthetic resize was used.

## Intended hierarchy

1. Champions and gameplay FX
2. Warm destructible wood
3. Cold solid boundary stone
4. Dark quiet floor

## Files

- `04-crate-F-side-x-native.png` — crate side, orthographic X construction
- `04-crate-F-top-planks-native.png` — crate top, plank lid
- `05-ground-B-grid-steel-native.png` — dark modular arena floor
- `06-wall-B-side-slate-native.png` — boundary wall side
- `06-wall-B-top-cap-native.png` — boundary wall top cap

## Native output sizes

- Square sources: 1254×1254
- Wall-side source: 1536×1024

The built-in generator did not return 4K despite the 4K prompt. These files intentionally remain at their native generated resolution: the project quality policy forbids synthetic upscale.

The images are raw source assets. Promote selected versions to `art/crates/`, `art/walls/` or `art/ground/` and wire them into the arena loader only after an in-game readability check.
