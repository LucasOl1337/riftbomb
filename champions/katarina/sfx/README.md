# Katarina — champion SFX

Exclusive audio bank for **Katarina**. Other champions get the same layout under `champions/<name>/sfx/`.

## Layout

```
champions/katarina/sfx/
├── README.md
├── PROVENANCE.md          # license + file log
├── sfx-map.json           # game effect ↔ catalog label ↔ files
└── pt-br/                 # ready PT-BR samples (gitignored empties ok)
    ├── q-cast-01.mp3
    ├── r-cast-01.mp3
    └── …
```

## Mapping model

| Layer | Role |
|-------|------|
| **Game effect** | What `sfx.effect("katQ")` already fires in combat |
| **LoLSound label** | Human catalog name on the site (Q cast, Move Standard…) |
| **files[]** | Zero or more variants; runtime picks one at random |

See `sfx-map.json` for the full Katarina table.

### Core Riftbomb ↔ catalog

| Game effect | LoLSound section | Label (PT_BR catalog) |
|-------------|------------------|------------------------|
| `shunpo` | MOVEMENT | Move Standard |
| `bladeHit` / `hit` | ATTACK | Attack General / Basic Attack cast |
| `katQ` | ABILITIES | Q cast |
| `daggerLand` | ABILITIES | (impact layer; often SFX not VO) |
| `katW` | ABILITIES | W cast |
| `deathLotus` | ABILITIES | R cast |
| `voracity` | ATTACK | Crit Attack cast (proxy) |

## Runtime

1. `package-champion-sfx.mjs` embeds samples that exist into `game/load-champion-sfx.js`.
2. `play-rift-sfx.js` loads them with arena samples.
3. For a mapped effect, **sample wins**; if missing/decoding, **synth profile** keeps playing.

## Import workflow

From the repo root:

```bash
node champions/import-lolsound-champion-sfx.mjs katarina pt_BR
node champions/package-champion-sfx.mjs
```

That pulls the base-skin bank from LoLSound (`/api/v1/champions/.../sounds?language=pt_BR`), writes `pt-br/*.m4a`, updates `sfx-map.json` + `PROVENANCE.md`, then package embeds into `game/load-champion-sfx.js`.
