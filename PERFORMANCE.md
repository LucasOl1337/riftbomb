# Riftbomb performance scorecard

Measured on 2026-07-27. The baseline is `cf65d6c`; the optimized code is
`cd61f78`.

## Final score

| User-visible operation | Before | After | Change |
| --- | ---: | ---: | ---: |
| Initial download + parse to boot attempt | 2,052.7 ms | 87.7 ms median | -95.7% |
| Create room signaling | 128.7 ms median | 28.0 ms median | -78.2% |
| Open room offer | 66.3 ms median | 16.4 ms median | -75.3% |
| Join room / store answer | 57.0 ms median | 14.4 ms median | -74.7% |
| Host reads the saved answer | 50.2 ms median | 17.6 ms median | -64.9% |

Riftbomb has no search or document-save operation. Room signaling is the
product's closest create/open/save path.

## Rounds

| Round | Commit | Bottleneck and change | Measurement |
| ---: | --- | --- | --- |
| 1 | `0a82390` | Fetch the initial game parts in parallel. | Production download median: 8,428.29 ms sequential → 2,896.34 ms parallel (-65.6%), against the same ten files. |
| 2 | `045b2f6` | Remove the 111-sample media bank from the online boot payload. | Boot marker median: 1,832.4 → 331.5 ms (-81.9%); payload: 40,764,104 → 9,529,223 B. |
| 3 | `7b8db74` | Stream the five arena textures separately. | Boot marker median: 331.5 → 245.5 ms (-25.9%); payload: 9,529,223 → 6,252,850 B. |
| 4 | `7148860` | Load only the champion models selected for the match. | Boot marker median: 245.5 → 80.0 ms (-67.4%); payload: 6,252,850 → about 671,077 B. |
| 5 | `757c648` | Reduce the optional sampled-media request set. | Fetch + decode median: 1,512.3 → 327.7 ms (-78.3%); 111 → 33 samples. |
| 6 | `cd61f78` | Cache D1 schema setup per worker and clean expired rooms only on create. | Join median: 57.0 → 14.4 ms (-74.7%); worst observed join: 731.0 → 31.3 ms (-95.7%). |

The consolidated release initial web part is 686,731 B, down 98.3% from the original
40,764,104 B initial parts. Arena textures and selected champion models still
load when they are genuinely needed.

## Raw runs and method

### Initial loader

The loader records `performance.now()` immediately before fetching the web
parts. `data-riftbomb-fetch-ms` is set after all part bodies are read;
`data-riftbomb-ready-ms` is set by the reconstructed document after its
scripts have parsed and run. The cloud browser has no WebGL2, so this is
strictly a download-and-parse-to-boot-attempt marker, not a claim that a match
frame rendered.

- Original marker: `fetch=495.6`, `ready=2052.7` ms.
- After round 1 ready runs: `1385.4`, `2418.5`, `1832.4` ms; median
  `1832.4`.
- After round 2 ready runs: `394.4`, `331.5`, `308.9` ms; median `331.5`.
- After round 3 ready runs: `286.3`, `243.1`, `245.5` ms; median `245.5`.
- After round 4 ready runs: `81.2`, `75.8`, `80.0` ms; median `80.0`.
- Final forced-query runs: `87.7`, `84.9`, `97.8` ms; median `87.7`.

Round 1 also used `online/scripts/benchmark-riftbomb-load.mjs` against the
same production files:

- Sequential totals: `13246.28`, `7288.21`, `8428.29` ms; median
  `8428.29`.
- Parallel totals: `7457.00`, `2896.34`, `2181.83` ms; median `2896.34`.

### Removed sampled-media benchmark

This historical benchmark measured the former sampled-media subsystem. That
subsystem and its OGG inventory have since been removed from the product.

- Before: `978.7`, `2415.2`, `1512.3` ms; median `1512.3`; 111 requests;
  21,534,132 response bytes observed; 85 decodes and 26 decoder failures.
- After: `327.7`, `335.0`, `316.5` ms; median `327.7`; 33 requests;
  7,590,339 response bytes; 33 decodes and zero failures.

The repository contains 23,422,499 B across all 111 source OGGs. The browser
reported fewer response bytes in the old full-bank run and failed to decode
26 of them. Both sides used the same harness; the after set contains every
sample Gravesong can request and all 33 decoded successfully.

### Room signaling

Each of five browser runs created a room, opened its offer, stored a guest
answer, read the answer as host, and closed the room. Timing wraps the real
same-origin `fetch` plus JSON read.

| Operation | Before runs (ms) | Before median | After runs (ms) | After median |
| --- | --- | ---: | --- | ---: |
| Create | 128.7, 131.4, 98.9, 180.9, 117.2 | 128.7 | 97.4, 26.0, 28.0, 26.2, 30.4 | 28.0 |
| Open | 53.2, 185.3, 66.3, 94.1, 57.2 | 66.3 | 32.2, 16.4, 15.6, 15.4, 16.6 | 16.4 |
| Join | 57.0, 731.0, 37.2, 547.8, 34.7 | 57.0 | 31.3, 14.1, 13.9, 15.4, 14.4 | 14.4 |
| Host read | 37.3, 382.1, 44.9, 210.4, 50.2 | 50.2 | 22.8, 15.2, 16.1, 17.6, 20.8 | 17.6 |

## Verification boundary

The consolidated release passes 33 repository tests and 8 online tests. Full lobby click
through and first rendered match frame could not be timed in the available
cloud Chrome because WebGL2 is unavailable. The report therefore does not
invent an end-to-end match-start number; it reports the loader and real
signaling operations that were directly measurable.
