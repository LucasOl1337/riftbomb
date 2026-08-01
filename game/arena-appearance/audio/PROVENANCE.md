# Arena audio provenance

## arena-bomb-explosion.mp3

| Field | Value |
|-------|--------|
| Role | Arena bomb detonation (primary Riftbomb explosion SFX) |
| Source | [Freesound #741173 — Big Explosion](https://freesound.org/s/741173/) |
| Author | [qubodup](https://freesound.org/people/qubodup/) |
| License | [CC0 1.0](http://creativecommons.org/publicdomain/zero/1.0/) (public domain) |
| Original duration | ~8.75 s HQ preview |
| Game edit | Trimmed to 3.4 s, 2.5–3.4 s fade-out, loudnorm, 44.1 kHz stereo MP3 160 kb/s |
| Picked as | Candidate #29 from FreeSound fire-explosion shortlist (2026-08-01) |
| **Playback in game** | **Capped to blast visual life (`0.72` s)** in `play-rift-sfx.js` via `visualLife` / envelope — file length ≠ audible length |

### Agent rules (see also repo `Agents.md`)

- Package with `game/arena-appearance/package-arena-sfx.mjs` → `load-arena-sfx.js`.
- Register that script in `game/play-riftbomb.html` **before** `play-rift-sfx.js`.
- Keep sample playback ≤ `blasts[].life` (today `0.72`). Changing blast life requires changing audio window.
- Do not ship file-only changes: run `online` `npm run deploy:build` and verify live `/riftbomb-parts/manifest.json`.

No attribution is legally required under CC0; this file records origin for maintainers.
