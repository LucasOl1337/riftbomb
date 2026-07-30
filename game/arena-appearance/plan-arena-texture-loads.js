"use strict";

function arenaTextureKeysForTheme(theme) {
  if (theme?.soft === "nacreGrowth") {
    return ["nacreGrowth", theme.floor, theme.wall, theme.wallTop];
  }
  return [...new Set([
    "crate",
    "crateTop",
    theme?.soft,
    theme?.floor || "floorLattice",
    theme?.wall || "wallLattice",
    theme?.wallTop || "wallTopLattice"
  ].filter(Boolean))];
}

globalThis.RIFTBOMB_ARENA_TEXTURE_PLAN = Object.freeze({
  forTheme: arenaTextureKeysForTheme
});
