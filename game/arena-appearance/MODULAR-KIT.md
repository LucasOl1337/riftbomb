# Riftbomb modular arena kit

Camera, scale, and language this kit is built for:

| Property | Value |
| --- | --- |
| Camera | High isometric / top-down ¾ (~eye above board looking at origin) |
| Grid | 11×13 Bomberman cells, `tile` world units |
| Cell language | `0` walkable, `1` hard block, `2` soft crate |
| Readability rule | Players, bombs, blasts, crates, pickups must win over ambience |
| Material rule | Stylized PBR-ish albedos, even lighting, no cinematic darkening |

## Pieces

### Floors (world-continuous UV)

| Piece | File | Identity |
| --- | --- | --- |
| `floorLattice` | `textures/ground/floor-salt-lens-combat-band-6ffb0854.webp` | Low-noise sandstone combat bands — Salt Lens Array |
| `floorClearing` | `textures/ground/floor-clearing.webp` | Nacre / turquoise mineral — Nacre Hollow |
| `floorLabyrinth` | `textures/ground/floor-labyrinth.webp` | Frosted steel — Cinderfrost Works |
| `floorForts` | `textures/ground/floor-forts.webp` | **Green** moss/grass turf — Aeolian Bastions |
| `floorPit` | `textures/ground/floor-storm-eye-combat-field-99509f91.webp` | Low-noise navy basalt/stormglass field — Storm-Eye Basin |

### Walls (per-block face UV)

| Piece | Side | Top | Identity |
| --- | --- | --- | --- |
| Lattice | `wall-lattice.webp` | `wall-top-lattice.webp` | Dark basalt stone |
| Clearing | `wall-clearing.webp` | `wall-top-clearing.webp` | Pearl masonry + cyan veins |
| Labyrinth | `wall-labyrinth.webp` | `wall-top-labyrinth.webp` | Frosted industrial plate |
| Forts | `wall-forts.webp` | `wall-top-forts.webp` | Pale limestone bastion |
| Pit | `wall-pit.webp` | `wall-top-pit.webp` | Navy storm basalt |

### Shared gameplay props

| Piece | Role |
| --- | --- |
| Wooden crates | Soft / destructible (shared warm wood — readable vs hard stone) |
| Hard pillars | Indestructible obstacles (wall material of active theme) |
| Perimeter wall ring | Outer bound (same hard material) |
| Side crystals / turrets | Team identity props (tinted by theme accent colors) |
| Skill tokens | Steel + gold bezel, circular ability art |
| Classic power-ups | bomb / range / speed / shield — hard silhouettes, no pink bloom |

## Layout modules (placeHard)

| Scenario | Template id | Silhouette function |
| --- | --- | --- |
| Salt Lens Array | `lattice` | Balanced even pillars — fair lanes |
| Nacre Hollow | `clearing` | Open center — sparse pillars |
| Cinderfrost Works | `labyrinth` | Long corridors — thermal chokes |
| Aeolian Bastions | `forts` | Twin bastion pockets + kill lane |
| Storm-Eye Basin | `pit` | Outer ring + calm eye |

## How to make a new place without painting a whole map

1. Pick or author floor + wall side + wall top plates.
2. Drop them under `textures/` and register in `package-arena-appearance.mjs`.
3. Add a template in `run-champion-bomb-duel.js` with `placeHard` silhouette + theme colors.
4. Run `npm run build` (repacks data URLs into `load-arena-appearance.js`).

Gameplay grid stays the source of truth; art never invents walkable cells.

## Proof trio

The first three arenas are the modular proof set: same rules engine, different material language and hard-block silhouette.
