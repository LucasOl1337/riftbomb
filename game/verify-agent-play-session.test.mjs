import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { createAgentPlayStore } from "../online/scripts/agent-play-dev-plugin.mjs";

const gameDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(gameDirectory);

async function loadClassic(context, fileName) {
  const source = await readFile(path.join(gameDirectory, fileName), "utf8");
  vm.runInContext(source, context);
}

function dummyRenderer() {
  return {
    cameraShake: 0,
    hitPulse: 0,
    addShock() {},
    addImpact() {},
    ensureChampionModel() { return Promise.resolve(); }
  };
}

async function loadObservedMatch(events, extras = {}) {
  const context = vm.createContext({
    console,
    Math,
    Date,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    TAU: Math.PI * 2,
    Renderer: {
      colors: {
        blueSide: [0.2, 0.4, 1],
        redSide: [1, 0.2, 0.2],
        ice: [0.7, 0.8, 1],
        rift: [0.3, 1, 0.8],
        ember: [1, 0.45, 0.1],
        gold: [1, 0.8, 0.2]
      }
    },
    ...extras
  });
  await loadClassic(context, "record-agent-play-session.js");
  await loadClassic(context, "observe-agent-play.js");
  const rules = await readFile(path.join(gameDirectory, "run-champion-bomb-duel.js"), "utf8");
  vm.runInContext(`${rules}\nglobalThis.Game = Game;`, context);
  const inner = {
    selectChampion() {},
    prepareRound() {},
    announce() {},
    update() {},
    finish() {}
  };
  const presentation = context.wrapAgentPlayPresentation(inner, {
    sessionId: "ap-test-session-0001",
    now: extras.now || (() => 1_787_165_400_000),
    events
  });
  const match = new context.Game(dummyRenderer(), { effect() {}, play() {}, emitGameEvent() { return false; } }, presentation);
  match.playSfxAt = () => {};
  return { context, match, presentation };
}

test("the sample fixture covers the published session schema", async () => {
  const context = vm.createContext({ console });
  await loadClassic(context, "record-agent-play-session.js");
  const text = await readFile(
    path.join(repositoryRoot, "learning-records", "agent-play", "sample-session.jsonl"),
    "utf8"
  );
  const session = context.parseAgentPlaySession(text);
  const types = session.events.map((event) => event.type);

  assert.equal(session.schema, 1);
  assert.equal(session.sessionId, "ap-20260819-185000-fx01");
  for (const type of [
    "session_start", "match_setup", "round_start", "score", "bomb_plant",
    "death", "skill_unlock", "skill_cast", "note", "p2_control", "heartbeat"
  ]) {
    assert.ok(types.includes(type), `sample must include ${type}`);
  }
  const setup = session.events.find((event) => event.type === "match_setup");
  assert.equal(setup.payload.mode, "training");
  assert.equal(setup.payload.bot, "v1-renekton");
  assert.equal(setup.payload.p2Hud, "CPU controls Red");
  const death = session.events.find((event) => event.type === "death");
  assert.equal(death.payload.who, "Blue Katarina");
  assert.equal(death.payload.cause, "blast");
  const note = session.events.find((event) => event.type === "note");
  assert.equal(note.payload.kind, "death_reason");
  const handoff = session.events.find((event) => event.type === "p2_control");
  assert.equal(handoff.payload.control, "human");
  assert.equal(handoff.payload.hud, "Player 2 online/local");
});

test("the recorder writes and reads JSONL without a browser", async () => {
  const context = vm.createContext({ console });
  await loadClassic(context, "record-agent-play-session.js");
  const events = [];
  let now = 1_787_165_400_000;
  const session = context.createAgentPlaySession({
    sessionId: "ap-test-jsonl-0001",
    now: () => now,
    events,
    emit() {}
  });
  const match = {
    mode: "playing",
    elapsed: 0,
    round: 1,
    roundWins: [0, 0],
    roundLocked: false,
    p2Human: false,
    selectedChampion: "katarina",
    selectedChampion2: "renekton",
    selectedBot: "v1-renekton",
    selectedArena: "lattice",
    matchTarget: 3,
    roundTime: 90,
    grid: [[0, 2], [2, 1]],
    bombs: [],
    players: [
      { id: 1, name: "Blue Katarina", champion: "katarina", side: "blue", health: 1, alive: true, skillsUnlocked: [false, false, false, false], qCooldown: 0, wCooldown: 0, eCooldown: 0, rCooldown: 0 },
      { id: 2, name: "Red Renekton", champion: "renekton", side: "red", health: 1, alive: true, skillsUnlocked: [false, false, false, false], qCooldown: 0, wCooldown: 0, eCooldown: 0, rCooldown: 0 }
    ],
    arenaTemplate: () => ({ id: "lattice", label: "Salt Lens Array" }),
    activeBombsFor: () => 0,
    skillSlotLabel: (_player, slot) => ["Bouncing Blade", "Preparation", "Shunpo", "Death Lotus"][slot]
  };

  session.ingestMatch(match, "update");
  match.bombs = [{ id: 7, ownerId: 1, r: 9, c: 1, exploded: false }];
  session.ingestMatch(match, "update");
  match.players[0].alive = false;
  match.players[0].health = 0;
  session.ingestAnnounce("Blue Katarina was caught in the blast", match);
  match.roundLocked = true;
  match.roundWins = [0, 1];
  session.ingestAnnounce("Red Renekton wins round 1", match);
  session.note("Felt like a crate starve then a walk-in", { kind: "feel", hypothesis: "Need bombs first" });
  session.end(match, { winner: match.players[1], roundWins: match.roundWins, elapsed: 8 });

  const directory = await mkdtemp(path.join(tmpdir(), "agent-play-"));
  const filePath = path.join(directory, "ap-test-jsonl-0001.jsonl");
  await writeFile(filePath, context.formatAgentPlayJsonl(events));
  const parsed = context.parseAgentPlaySession(await readFile(filePath, "utf8"));

  assert.deepEqual(parsed.events.map((event) => event.type), events.map((event) => event.type));
  assert.ok(parsed.events.some((event) => event.type === "bomb_plant" && event.payload.bombId === 7));
  assert.ok(parsed.events.some((event) => event.type === "death" && event.payload.cause === "blast"));
  assert.ok(parsed.events.some((event) => event.type === "score" && event.payload.score[1] === 1));
  assert.ok(parsed.events.some((event) => event.type === "note" && event.payload.kind === "feel"));
  assert.equal(parsed.events.at(-1).type, "match_end");
});

test("the observer taps a live match for bomb, death, score, and P2 handoff", async () => {
  const events = [];
  const { match } = await loadObservedMatch(events);
  match.selectBotOpponent?.("missing");
  match.selectedBot = "v1-renekton";
  match.selectedChampion2 = "renekton";
  match.resetPlayers();
  match.p2Human = false;
  match.start();

  assert.ok(events.some((event) => event.type === "session_start"));
  assert.ok(events.some((event) => event.type === "match_setup" && event.payload.mode === "training"));
  assert.ok(events.some((event) => event.type === "round_start" && event.payload.round === 1));

  assert.equal(match.placeBomb(match.players[0]), true);
  assert.ok(events.some((event) => event.type === "bomb_plant" && event.payload.ownerId === 1));

  for (const player of match.players) {
    player.invulnerable = 0;
    player.dashing = 0;
  }
  match.hitContestant(match.players[1], { ownerId: 1 });
  assert.ok(events.some((event) => (
    event.type === "death"
    && event.payload.playerId === 2
    && (event.payload.cause === "blast" || event.payload.line)
  )));

  match.finalizeRound();
  assert.ok(events.some((event) => event.type === "round_end" && event.payload.winnerId === 1));
  assert.ok(events.some((event) => event.type === "score" && event.payload.score[0] === 1));

  match.roundLocked = false;
  match.activatePlayerTwo();
  const handoff = events.filter((event) => event.type === "p2_control").at(-1);
  assert.equal(handoff.payload.control, "human");
  assert.equal(handoff.payload.hud, "Player 2 online/local");

  match.players[0].skillsUnlocked[3] = false;
  match.castAbility(3, match.players[0]);
  assert.ok(events.some((event) => event.type === "skill_locked"));
});

test("the local store persists events and notes on disk", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "agent-play-store-"));
  const store = createAgentPlayStore(directory, { relativePath: "learning-records/agent-play" });
  await store.appendEvents([
    {
      v: 1,
      sessionId: "ap-store-test-0001",
      seq: 1,
      t: 1,
      matchTime: 0,
      type: "session_start",
      payload: { sessionId: "ap-store-test-0001" }
    },
    {
      v: 1,
      sessionId: "ap-store-test-0001",
      seq: 2,
      t: 2,
      matchTime: 0,
      type: "round_start",
      payload: { round: 1 }
    }
  ]);
  const note = await store.addNote({ text: "Need a focused retest on Dominus all-in", kind: "hypothesis" });
  const current = await store.readSession("current");
  const status = await store.status();

  assert.equal(note.type, "note");
  assert.equal(current.sessionId, "ap-store-test-0001");
  assert.equal(current.path, "learning-records/agent-play/ap-store-test-0001.jsonl");
  assert.equal(current.events.length, 3);
  assert.equal(current.events[2].payload.text.includes("Dominus"), true);
  assert.equal(status.ok, true);
  assert.equal(status.eventCount, 3);
});

test("play-riftbomb registers the observer before the match boots", async () => {
  const document = await readFile(path.join(gameDirectory, "play-riftbomb.html"), "utf8");
  const startup = await readFile(path.join(gameDirectory, "start-champion-duel.js"), "utf8");
  assert.match(document, /record-agent-play-session\.js"><\/script>\s*<script src="\.\/observe-agent-play\.js/);
  assert.ok(document.indexOf("observe-agent-play.js") < document.indexOf("start-champion-duel.js"));
  assert.match(startup, /attachAgentPlayPresentation\(new BrowserMatchPresentation\(\)\)/);
});
