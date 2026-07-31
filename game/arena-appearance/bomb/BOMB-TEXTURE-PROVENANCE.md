# Bomb shell texture provenance

| File | Role | Native size | Source |
|------|------|-------------|--------|
| `raw-imagine/42-bomb-hero-round-shell-native.jpg` | Hero prop reference (Imagine) | 1024×1024 | Grok Imagine product shot |
| `raw-imagine/43-bomb-shell-petal-armor-4k-prompt-native.jpg` | Runtime albedo source | 1024×1024 | Grok Imagine seamless |
| `textures/props/bomb-shell-albedo.webp` | GPU albedo (mapId 7) | 1024×1024 | Native WebP |
| `raw-imagine/44-bomb-shell-fastener-panels-native.jpg` | Alternate material | 1024×1024 | Grok Imagine seamless |

## PPI / texel density (what “high res” means here)

We do **not** need a 4096-pixel file. The bomb is ~0.76 world units across; crates map a full face albedo onto a ~1 tile face. Quality is **texels per world unit on the prop**, not absolute image size.

- Runtime albedo: **1024²** (same class as floors/crates).
- Shader mapId 7: local UV `vLocal * 0.5 + 0.5` → ~one albedo face across the shell diameter (readable panels/screws at gameplay camera).
- Mesh: denser `bombSphere` so the silhouette is round enough for that density to show.

Fake upscale to 4K is rejected (`ART-QUALITY.md`). If panels ever look soft, raise mesh density or bump strength — not invent resolution.
