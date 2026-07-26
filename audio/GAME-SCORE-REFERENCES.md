# Game score references (style DNA, not copyrighted tracks)

**Important:** We do **not** ship rips of Elden Ring, League of Legends, Dark Souls, etc. Those OSTs are copyrighted. This file is a **composition brief** for real-time generative beats in Riftbomb. Audio we ship is **CC-BY free samples** (see `ATTRIBUTION.md`).

Use these profiles when designing or tuning live styles in `play-rift-soundtrack.js`.

---

## How to use this in our engine

| Field | Meaning for our sequencer |
|-------|---------------------------|
| Tempo | `baseBpm` / heat range |
| Harmony | `chords` + `bassRoots` |
| Density | organ / piano / cello / violin / `subBass` |
| Mix | low shelf, dark LPF, reverb wet |
| Phrase | long bows vs ostinato vs stabs |

---

## 1. Elden Ring / FromSoftware exploration

| Trait | Value |
|-------|--------|
| Mood | Lonely, cathedral, dread without panic |
| Tempo | Slow–moderate (≈ 55–80) |
| Harmony | Modal minor, open fifths, sparse changes |
| Lead | Low celli / basses, thin high strings |
| Keys | Soft organ / stone piano, rare |
| Avoid | Swing, coin jingles, busy 16ths |
| Our style map | `gravesong`, `underdark`, `deepwell`, `ashveil`, `forgeglow` |

## 2. League of Legends champion / Summoner’s Rift drama

| Trait | Value |
|-------|--------|
| Mood | Heroic, hextech gloss, combat lift |
| Tempo | Mid–up (≈ 85–120) |
| Harmony | Minor with brighter IV / V lifts |
| Lead | Mid strings + rhythmic keys |
| Keys | Organ/hex pads, piano pulse |
| Avoid | Pure chiptune arps |
| Our style map | `hextech`, `piltover`, `zaun`, `riftcalm`, `stormcall` |

## 3. Noxus / war-march fantasy

| Trait | Value |
|-------|--------|
| Mood | Iron, march, heavy |
| Tempo | Steady march (≈ 70–96) |
| Harmony | Dark minor, root-heavy ostinato |
| Lead | Low cello, short phrases |
| Keys | Sparse |
| Avoid | Airy waltz |
| Our style map | `noxian`, `ironvale`, `hushsteel`, `emberline` |

## 4. Melancholic RPG town / dusk (Zelda late-game, JRPG night)

| Trait | Value |
|-------|--------|
| Mood | Soft, long lines, bittersweet |
| Tempo | Slow (≈ 56–76) |
| Harmony | Minor with gentle major color |
| Lead | Cello + violin duet, long notes |
| Keys | Soft piano, little organ |
| Avoid | Sub-bass weight |
| Our style map | `aurora`, `silver`, `shadow`, `willow`, `duskpetal`, `stillwater`, `riverlight` |

## 5. Dark Souls boss pressure (without ripping the track)

| Trait | Value |
|-------|--------|
| Mood | Choir-weight, dread, slow build |
| Tempo | Slow, then denser with heat |
| Harmony | Minor / diminished color |
| Lead | Thick low strings, rare high scream violin |
| Mix | Dark LPF, long reverb |
| Our style map | `gravesong` (high heat), `voidchoir`, `blackmist`, `bloodmoon` |

## 6. Stealth / shadow (Zed-adjacent)

| Trait | Value |
|-------|--------|
| Mood | Whisper, space between notes |
| Tempo | Very slow (≈ 52–76) |
| Harmony | Sparse voicings |
| Lead | Violin mist over soft cello |
| Our style map | `shadow`, `mistveil`, `blackmist` |

## 7. Light / luminous long bows

| Trait | Value |
|-------|--------|
| Mood | Clear air, no chest-thump |
| Tempo | 60–78 |
| Lead | Violin / cello mid-register, harp/flute color |
| Avoid | Sub-bass, heavy organ |
| Our style map | `glass`, `celestine`, `skyglass`, `crystalspire`, `targon`, `solari` |

## 8. Region / mood cousins (original names, free samples)

| Map | Styles |
|-----|--------|
| Ionia soft | `ionia`, `duskpetal`, `willow` |
| Freljord cold | `freljord` |
| Demacia noble | `demacia` |
| Bilgewater sway | `bilgewater` |
| Travel / open | `silkroad`, `riverlight`, `twilight`, `nocturne` |

---

## Free audio we actually ship

| Pack | License | Path |
|------|---------|------|
| tonejs-instruments multipiano samples | CC BY 3.0 | `game/audio/{cello,violin,piano,organ,contrabass,french-horn,harp,flute}/` |
| Packed offline bank | same | `game/load-sample-bank-data.js` (regenerate: `node game/pack-sample-bank.mjs`) |

Credit (required for CC BY):

> Instrument samples from [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments) (CC BY 3.0).

---

## What we will never do

- Download and redistribute copyrighted game OSTs (Elden Ring, LoL, Zelda, etc.)
- Sample famous themes note-for-note as “our” music
- Claim free packs are the original game recordings

References stay **style DNA**. Sound stays **licensed samples + original arrangement**.
