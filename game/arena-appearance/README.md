# Arena appearance

Shared **arena / chrome** art for Riftbomb. Not champion kits.

## Quality bar (read first)

**`ART-QUALITY.md`** — permanent detail level for every Imagine texture
(reference: `raw-imagine/_ref-crate-detail-level.png`). Planks, grain, braces,
nails; no soft blobs, no upscale.

## Layout

| Path | Use |
|------|-----|
| `textures/ground/` | Floor tiles, hex grid, dirt/metal |
| `textures/crates/` | Breakable Hextech crate albedo / normal / emissive |
| `textures/walls/` | Indestructible wall segments |
| `textures/props/` | Side crystals, orbs, towers |
| `textures/fx/` | Blast masks, trails, shield soft maps |
| `textures/ui/` | Optional HUD bitmaps (prefer CSS when enough) |
| `tiles/` | Atlases (ground/crate sheets) |
| `materials/` | JSON material specs (tint, metal, roughness) |
| `meshes/` | Small arena GLBs (crate, wall, prop) — not champions |
| `audio/` | Arena SFX if not pure synth |
| `fonts/` | Game typefaces if extracted from CSS |
| `lut/` | Optional color-grade LUT for post |

## Do not put here

| Content | Put in |
|---------|--------|
| Champion playable mesh / atlas | `champions/<name>/playable-model/` |
| Skill / portrait icons | `champions/<name>/match-icons/` |
| Khada / raw game extract | `champions/<name>/` kit folders |

## Naming

Prefer lowercase kebab-case + maps suffixes:

- `crate-albedo.webp`
- `crate-normal.webp`
- `crate-emissive.webp`
- `ground-atlas.webp`

## Wiring

Today the arena is still procedural in `draw-bomber-rift.js`. Dropping files here does not auto-load them; load paths should go through the assemble / renderer when art is ready.
