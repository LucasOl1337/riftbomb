# Storm-Eye combat-field floor

Generated on 2026-07-30 with the built-in OpenAI `imagegen` tool. The promoted source is
`25-floor-storm-eye-combat-field-imagegen-v3.png`; it was reduced from the native
1254×1254 RGB output to 1024×1024 with Lanczos and encoded as WebP quality 85/method 6.
No Riot or League of Legends asset was supplied, referenced or copied.

## Original generation prompt

Create one completely original, production-ready square RGB game-ground albedo for
Riftbomb's Storm-Eye Basin. Use an exact orthographic top-down, edge-to-edge full-board
composition for a high-isometric competitive action game. The material is dark,
desaturated navy basalt and restrained stormglass, with a broad calm center occupying
roughly 60% of the image, subtly darker worn margins and low-frequency mineral flow.
Use flat, even albedo lighting, sparse micro-wear and a quiet macro hierarchy.

Do not reproduce League of Legends, Riot, Summoner's Rift or protected game assets. Do
not add a portal, vortex, eye, concentric rings, radial focal point, glyphs, runes, grid,
lanes, characters, props, text, logos, watermark, directional light, baked shadows,
bloom, emissive cracks or saturated cyan, magenta, red or gold. The runtime shader owns
the animated storm rings; the albedo must remain non-semantic.

## Exposure edit passes

The first output had the right material hierarchy but was rejected at mean luminance
0.1698. An edit requesting mean 0.27–0.29 overshot to 0.4677 and was also rejected. The
second edit darkened that candidate toward medium-dark slate navy and reduced the broad
center contrast. The promoted source measured mean luminance 0.2295, global deviation
0.0387, macro 64×64 deviation 0.02235, high-pass mean 0.01805 and center/periphery delta
0.01952. It is 6.2% brighter than the legacy floor but far quieter at arena scale.

Rejected candidate SHA-256 values:

- dark first generation: `f17dd39d798525d1533178ddc4d178b9f4db9898e735ba1f4b28610ce4a71fa3`;
- overexposed first edit: `701603cb06c5b0d28a96c4b1f34671abd4b9a18a89b7421187b4b5a847ccf8fc`.

## Promotion record

- Native source SHA-256: `0bb25f43c6bce82734ca9c9a2fc01055f6f1752e93fc3cc98397dfd4f0b3d1e8`
- Runtime WebP SHA-256: `99509f91a6208a6c843dc5d8ce25c6287e28d6066cd5a4f6b50e6798783e0717`
- Runtime path: `textures/ground/floor-storm-eye-combat-field-99509f91.webp`
- Runtime size: 156,720 bytes
- Runtime dimensions/channels: 1024×1024 RGB, no alpha
- Legacy rollback: `textures/ground/floor-pit.webp`, unchanged, 221,712 bytes,
  SHA-256 `031e0e828a198761da3807240615fd87e7f68c6dc769e5ad8c5d77edb1ccc6ce`
- Third-party asset inputs: none
- Rights basis: original output generated for this Riftbomb project
- Encoder: ImageMagick 7.1.2 Q16-HDRI, Lanczos resize, WebP quality 85 / method 6
