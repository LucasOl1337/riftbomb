# Riftbomb arena visual pre-production

## Creative north star

Riftbomb arenas should feel like original competitive worlds rather than
decorated grids. The visual target is a modern WebGL2 scene with authored
materials, restrained atmosphere and a strong silhouette language, while
player position, bombs, blast lanes, crates and pickups remain readable in a
fraction of a second.

The production rule is simple: visual spectacle may frame gameplay, but it
must never recolor or obscure gameplay signals.

## Five arena identities

| Arena | Lore | Material language | Procedural signature |
| --- | --- | --- | --- |
| Salt Lens Array | A black-salt observatory built to measure fractures between worlds. | Basalt, smoked glass, mineral salt and sparse copper heat. | Optical contours crossing survey lines. |
| Nacre Hollow | A sunken shell-garden where mineral growth records old tides. | Pearl, nacre, dark turquoise stone and cyan veins. | Two slow interference pools. |
| Cinderfrost Works | A polar foundry that keeps its furnaces alive beneath permanent ice. | Frosted steel, blue-black plate and rare orange conduits. | Cold conduits with hot intersection pulses. |
| Aeolian Bastions | A storm archive suspended between stone towers. | Pale masonry, oxidized steel and skyglass. | Directional wind bands and charged nodes. |
| Storm-Eye Basin | A ring-shaped collector around a deceptively calm center. | Dark navy plate, storm glass and magenta charge. | Rotating outer arcs around a quiet eye. |

The first three arenas have dedicated authored floor albedos and production
keyframes. Aeolian Bastions shares the Cinderfrost macro material, and
Storm-Eye Basin shares the Salt Lens macro material; both retain unique
procedural motifs and palettes.

## Rendering architecture

- One arena-surface shader pass covers the full board in one draw call.
- Five motifs share one GLSL program and differ through uniforms.
- Floor albedo uses world-continuous UVs; cell geometry still communicates the
  movement grid.
- Arena atmosphere is disabled automatically when dynamic resolution falls
  below the medium tier.
- `prefers-reduced-motion` removes rhythmic pulsing and freezes ambient motion.
- Gameplay bloom, hit shockwaves and blast colors remain neutral and
  independent from the selected biome.

## Competitive budgets

| Budget | Target |
| --- | ---: |
| Environmental ambience | 1 draw call |
| Authored floor textures loaded online | 3 WebP files |
| Arena texture GPU allocations | 7 shared allocations |
| Active shockwaves | 4 maximum |
| Low-tier arena ambience | Disabled |
| Motion-reduced animation speed | Zero |

## Asset map

- `raw-imagine/07-salt-lens-array-keyframe.png`
- `raw-imagine/09-nacre-hollow-keyframe.png`
- `raw-imagine/11-cinderfrost-works-keyframe.png`
- `textures/ground/floor-lattice.webp`
- `textures/ground/floor-clearing.webp`
- `textures/ground/floor-labyrinth.webp`

## Originality and commercial boundary

The arena names, lore, shader motifs and generated environment materials in
this package are original Riftbomb work. Existing Riot champion names, meshes,
textures and related marks remain third-party content and must be licensed or
replaced before commercial release.
