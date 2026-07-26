# Arena art quality bar (permanent)

This is the **detail level** every Imagine texture for Riftbomb arena/props must hit.
The reference crate the user approved lives at:

`raw-imagine/_ref-crate-detail-level.png`

## What “enough detail” means

Not a flat color wash. Not a soft AI wood blob. Match this product-photo crate bar:

| Must have | Why |
|-----------|-----|
| **Readable material micro-detail** | Grain fibers, board seams, knots, wear, nail heads |
| **Clear construction** | Planks as separate boards; braces/frames when the prop has them (e.g. crate X) |
| **Albedo-friendly lighting** | Soft, even light — usable as map, not a heavy 3D product render with hard cast shadows |
| **Edge-to-edge** | No empty border / white studio backdrop on game maps |
| **Native Imagine only** | No upscale, no Lanczos “fake 4K”, no post resize to invent resolution |

## Crate specifics (breakables)

- **Part color separation is mandatory** — frame, X braces, recessed boards, and top lid must read different values (not one washed tan)
- Side: orthographic X face (lighter braces on darker vertical boards) — `02-crate-E-side-x`
- Top: plank lid only, no X, alternating board tones — `02-crate-E-top-planks`
- Engine: mapId 2 samples side + top by face normal
- Warm aged shipping wood (not hextech brass grid unless explicitly requested)
- Mapped lighting must **preserve** local contrast (no global lift that flattens the map)

## Rule for everything else (ground, walls, props, FX)

Same bar: **one level of material read at gameplay distance** — you should be able to tell wood from stone from metal from a thumbnail, with surface structure, not just hue.

1. Generate with Imagine (edit-chain from a quality reference when possible)
2. Drop under `raw-imagine/` with a clear name
3. User or agent promotes → `textures/...` + wire `load-arena-textures.js` / materials
4. Reject soft, muddy, poster-flat, or wrong construction

## Anti-patterns (reject)

- Soft blurry “AI wood”
- Single flat panel with no board seams
- Strong baked perspective + cast shadow on an albedo map
- Hextech/grid theme unless asked
- Upscaled low-res
