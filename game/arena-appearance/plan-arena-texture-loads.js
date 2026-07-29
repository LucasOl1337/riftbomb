"use strict";

function arenaTextureKeysForTheme(theme) {
  return [...new Set([
    "crate",
    "crateTop",
    theme?.floor || "floorLattice",
    theme?.wall || "wallLattice",
    theme?.wallTop || "wallTopLattice"
  ])];
}

globalThis.RIFTBOMB_ARENA_TEXTURE_PLAN = Object.freeze({
  forTheme: arenaTextureKeysForTheme
});
