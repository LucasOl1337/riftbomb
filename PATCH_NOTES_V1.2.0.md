# Riftbomb v1.2.0 — arenas, speed and online foundation

This release consolidates the latest production PvP lobby, the arena visual
package, six measured performance rounds and the modular bot foundation.

## Player-facing changes

- Five arenas now have distinct original names, lore, palettes and animated
  environmental signatures.
- Salt Lens Array, Nacre Hollow and Cinderfrost Works use dedicated authored
  materials instead of one repeated floor.
- Floor art spans the whole board continuously while movement cells stay easy
  to read.
- Arena ambience automatically scales down on slower devices and respects
  reduced-motion preferences.
- Online matches keep independent champion selection and controls for both
  players, with no pause during PvP.
- The host chooses the arena; the guest chooses a champion and confirms
  readiness.

## Speed

- Initial download and parse-to-boot attempt: **2,052.7 ms → 87.7 ms**.
- The former 23 MB media bank is no longer part of the game.
- Create room: **128.7 ms → 28.0 ms**.
- Open room: **66.3 ms → 16.4 ms**.
- Join room: **57.0 ms → 14.4 ms**.
- Host confirmation read: **50.2 ms → 17.6 ms**.
- Initial payload: **40,764,104 B → about 0.7 MB**.

## Technical changes

- Game parts load in parallel behind a dynamic, hashed manifest.
- Combat feedback uses lightweight procedural effects with no media bank.
- Arena WebP materials stream separately from the initial game document.
- Only the champion models selected for the match load.
- D1 schema setup is cached per worker; expired-room cleanup runs only when a
  room is created.
- A one-draw-call arena shader provides five procedural motifs.
- Online packaging now supports any valid part count and verifies payload
  length and SHA-256 before boot.
- Added a read-only bot `WorldView`, intent contract and baseline policy without
  freezing live match entities.

## Compatibility and safety

- No hitbox, bomb timing, scoring rule or PvP protocol was intentionally
  changed.
- Gameplay bloom and shockwave colors remain biome-neutral for competitive
  clarity.
- Low-tier rendering disables the environmental pass before it can hurt
  responsiveness.
