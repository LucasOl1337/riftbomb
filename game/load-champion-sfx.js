"use strict";

// CHAMPION_SFX_SPLIT_V1 — keep large voice banks out of the critical HTML.
const RIFTBOMB_CHAMPION_SFX_BANK_MANIFEST = Object.freeze({
  "katarina": "./champions/katarina/sfx/riftbomb-sfx-bank.js"
});
// KATARINA_SFX_SLEEP_V1 — keep the packaged bank intact, but do not load it
// until it is retuned and explicitly re-enabled.
const RIFTBOMB_CHAMPION_SFX_BANK_ENABLED = Object.freeze({
  "katarina": false
});
globalThis.RIFTBOMB_CHAMPION_SFX_BANK_MANIFEST = RIFTBOMB_CHAMPION_SFX_BANK_MANIFEST;
globalThis.RIFTBOMB_CHAMPION_SFX_BANK_ENABLED = RIFTBOMB_CHAMPION_SFX_BANK_ENABLED;
globalThis.RIFTBOMB_CHAMPION_SFX_BANKS = globalThis.RIFTBOMB_CHAMPION_SFX_BANKS || Object.create(null);
