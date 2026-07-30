"use strict";

(() => {
  const CUES = new Set([
    "barrelBoom", "bladeHit", "bomb", "cannonBarrage", "cannonImpact",
    "daggerLand", "deathLotus", "deathMark", "dominus", "explosion",
    "gangplankQ", "hemoplague", "hemoplaguePop", "hit", "katQ", "katW",
    "kill", "markPop", "pickup", "powderKeg", "removeScurvy", "renektonDice",
    "renektonE", "renektonQ", "renektonQEmpowered", "renektonW",
    "renektonWEmpowered", "sanguinePool", "shield", "shunpo", "tidesOfBlood",
    "vladimirQ", "vladimirQEmpowered", "voracity", "zedE", "zedQ", "zedSwap",
    "zedW"
  ]);

  const finiteBetween = (value, min, max, fallback = null) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  };

  function normalize(candidate) {
    if (!candidate || !Number.isSafeInteger(candidate.id) || candidate.id <= 0) return null;
    const cue = String(candidate.cue || candidate.action ||
      (candidate.kind === "explosion" ? "explosion" : ""));
    if (!CUES.has(cue)) return null;
    const event = {
      id: candidate.id,
      cue,
      strength: finiteBetween(candidate.strength, 0.5, 1.45, 1),
      x: finiteBetween(candidate.x, -64, 64),
      z: finiteBetween(candidate.z, -64, 64)
    };
    const chainDepth = finiteBetween(candidate.chainDepth, 0, 4);
    if (chainDepth !== null) event.chainDepth = Math.trunc(chainDepth);
    return event;
  }

  function consume({ events = [], cursor = 0, play = () => undefined } = {}) {
    let nextCursor = Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
    let played = 0;
    let playbackErrors = 0;
    const ordered = Array.isArray(events)
      ? events.map(normalize).filter(Boolean).sort((left, right) => left.id - right.id)
      : [];
    const firstNewEvent = ordered.find((event) => event.id > nextCursor);
    const gap = firstNewEvent && firstNewEvent.id > nextCursor + 1
      ? {
          from: nextCursor + 1,
          to: firstNewEvent.id - 1,
          count: firstNewEvent.id - nextCursor - 1
        }
      : null;
    for (const event of ordered) {
      if (event.id <= nextCursor) continue;
      try { play(event); }
      catch { playbackErrors += 1; }
      nextCursor = event.id;
      played += 1;
    }
    return { cursor: nextCursor, played, playbackErrors, gap };
  }

  globalThis.RIFTBOMB_AUTHORITATIVE_AUDIO = Object.freeze({ consume });
})();
