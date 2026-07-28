import { readFile } from "node:fs/promises";
import vm from "node:vm";

const rules = await readFile(new URL("../../game/run-champion-bomb-duel.js", import.meta.url), "utf8");
const context = vm.createContext({
  console,
  Math,
  Object,
  Array,
  Map,
  Set,
  String,
  Number,
  Boolean,
  parseInt,
  parseFloat,
  isNaN,
  Infinity,
  innerWidth: 1280,
  innerHeight: 720,
});

vm.runInContext(
  `
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const TAU = Math.PI * 2;
  const Renderer = {
    colors: {
      blueSide: [0, 0, 1],
      redSide: [1, 0, 0],
      ice: [1, 1, 1],
      ember: [1, 0.5, 0],
      rift: [0, 1, 1],
      katCrimson: [1, 0, 0],
      zedCrimson: [1, 0, 0],
      zedShadow: [0.2, 0, 0.2],
      renektonGold: [1, 0.8, 0],
      vladimirCrimson: [0.8, 0, 0.2],
    },
  };
  ${rules}
  globalThis.Game = Game;
`,
  context
);

const events = [];
const presentation = {
  selectChampion: () => {},
  prepareRound: () => {},
  announce: (m) => events.push(m),
  update: () => {},
  finish: (w, scores) => events.push(["finish", w?.name, scores]),
  setPaused: () => {},
};
const sfx = { effect: () => {}, explosion: () => {}, togglePause: () => {} };
const renderer = { cameraShake: 0, hitPulse: 0, addShock: () => {} };

const match = new context.Game(renderer, sfx, presentation);
match.start();
// burn spawn invulnerability
match.update(1.3);

const p1 = match.players[0];
const p2 = match.players[1];
p1.invulnerable = 0;
p2.invulnerable = 0;

const kill1 = match.hitSkill(p2, 1, p1, "TestKill");
console.log("after_kill", {
  kill1,
  p2alive: p2.alive,
  p2health: p2.health,
  timer: match.roundDecisionTimer,
  wins: [...match.roundWins],
  locked: match.roundLocked,
});

// Within grace window, p1 also dies
p1.invulnerable = 0;
const kill2 = match.hitSkill(p1, 1, p2, "Revenge");
console.log("after_revenge", {
  kill2,
  p1alive: p1.alive,
  p2alive: p2.alive,
  timer: match.roundDecisionTimer,
  wins: [...match.roundWins],
});

match.update(0.2);
console.log("after_finalize", {
  wins: [...match.roundWins],
  locked: match.roundLocked,
  pending: match.pendingMatchWinner?.name || null,
  lastAnnounces: events.slice(-8),
});

// Product promise (first elimination wins the round): p1 killed p2 first → blue should have 1.
// Actual finalize looks only at who is alive at lock time → both dead → draw.
const stole = match.roundWins[0] === 0 && match.roundWins[1] === 0;
console.log("GRACE_STEALS_FIRST_KILL_WIN", stole);
