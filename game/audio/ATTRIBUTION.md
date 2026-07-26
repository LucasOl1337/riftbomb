# Audio sample attribution

Real multipiano/orchestral samples used by Riftbomb’s adaptive score.

## Source

- Pack: [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments) by Nathaniel Brosowsky
- Sample license: **CC BY 3.0** — https://creativecommons.org/licenses/by/3.0/
- Code in that repo: MIT (we only ship selected sample files)

## Instruments used

- `cello/` — bowed cello
- `violin/` — violin
- `piano/` — acoustic piano
- `organ/` — organ / keyboard pad
- `contrabass/` — low string weight
- `french-horn/` — brass color (optional styles)
- `harp/` — soft pluck color
- `flute/` — airy high color

Style DNA from renowned game scores (Elden Ring, LoL drama, RPG dusk, etc.) is documented in `GAME-SCORE-REFERENCES.md` — **style only**, not ripped OSTs.

## Edits

Samples are used as-distributed `.ogg` files (volume-matched upstream). Riftbomb packs selected notes into `load-sample-bank-data.js` and plays them via Web Audio with pitch-rate mapping and ADSR.

Regenerate pack: `node game/pack-sample-bank.mjs`

## Required credit

> Instrument samples from [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments) (CC BY 3.0), based on public-domain orchestral sources collated by Nathaniel Brosowsky.
