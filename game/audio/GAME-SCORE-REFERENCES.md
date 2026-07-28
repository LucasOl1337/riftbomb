# Riftbomb score references

Riftbomb ships three original real-time arrangements built from the licensed sample bank.
No copyrighted game soundtrack recordings are included.

## Approved score

| Track | Composition profile |
|-------|---------------------|
| `Silver Thread` (`silver`) | Long bows, light cello/violin duet, airy dynamics |
| `Blood Moon` (`bloodmoon`) | Slow ritual pulse, dark low register, thin violin |
| `Skyglass` (`skyglass`) | Open high strings, flute color, minimal low-end weight |

These are the only selectable styles in `game/play-rift-soundtrack.js`. The generator in
`game/_gen-styles.mjs` intentionally contains the same three definitions so a regeneration
cannot restore retired tracks.

## Shared sample bank

| Pack | License | Path |
|------|---------|------|
| tonejs-instruments multipiano samples | CC BY 3.0 | `game/audio/{cello,violin,piano,organ,contrabass,french-horn,harp,flute}/` |
| Packed offline bank | same | `game/load-sample-bank-data.js` |

Credit:

> Instrument samples from [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments) (CC BY 3.0).

The instrument samples are shared by all three arrangements and therefore remain in the
repository even though the retired compositions were deleted.
