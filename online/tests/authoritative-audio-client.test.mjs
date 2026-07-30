import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { createAuthoritativeAudioRecorder } from "../../game/create-authoritative-duel.mjs";

const source = await readFile(
  new URL("../public/authoritative-audio.js", import.meta.url),
  "utf8"
);
const context = vm.createContext({});
vm.runInContext(source, context, { filename: "authoritative-audio.js" });
const { consume } = context.RIFTBOMB_AUTHORITATIVE_AUDIO;

test("canonical server sound snapshots preserve every explosion identity", () => {
  const recorder = createAuthoritativeAudioRecorder();
  const cues = [
    "bomb", "explosion", "barrelBoom", "markPop",
    "hemoplaguePop", "cannonImpact", "kill"
  ];
  for (const [index, cue] of cues.entries()) {
    recorder.emitGameEvent({
      type: cue,
      strength: 0.8 + index * 0.05,
      x: index - 3,
      z: 3 - index,
      options: { chainDepth: cue === "barrelBoom" ? 2 : 0 }
    });
  }

  const heard = [];
  const snapshot = recorder.snapshot();
  const result = consume({
    cursor: 0,
    events: snapshot.events,
    play: (event) => heard.push(event)
  });

  assert.deepEqual(heard.map((event) => event.cue), cues);
  assert.deepEqual(heard.map((event) => event.id), cues.map((_cue, index) => index + 1));
  assert.equal(heard.find((event) => event.cue === "barrelBoom")?.chainDepth, 2);
  assert.equal(result.cursor, snapshot.latest);
  assert.equal(result.played, cues.length);
});

test("authoritative audio consumes each valid event once in sequence order", () => {
  const heard = [];
  const first = consume({
    cursor: 0,
    events: [
      { id: 2, action: "zedQ", strength: 1, x: 2, z: 1 },
      { id: 1, action: "bomb", strength: 1, x: -2, z: 1 },
      { id: 2, action: "zedQ", strength: 1, x: 2, z: 1 }
    ],
    play: (event) => heard.push(event.id)
  });
  assert.deepEqual(heard, [1, 2]);
  assert.equal(first.cursor, 2);
  assert.equal(first.gap, null);

  const replay = consume({
    cursor: first.cursor,
    events: [{ id: 1, action: "bomb" }, { id: 2, action: "zedQ" }],
    play: (event) => heard.push(event.id)
  });
  assert.equal(replay.played, 0);
  assert.equal(replay.gap, null);
  assert.deepEqual(heard, [1, 2]);

  const next = consume({
    cursor: replay.cursor,
    events: [{ id: 2, action: "zedQ" }, { id: 3, kind: "explosion" }],
    play: (event) => heard.push(event.id)
  });
  assert.equal(next.cursor, 3);
  assert.equal(next.gap, null);
  assert.deepEqual(heard, [1, 2, 3]);
});

test("authoritative audio reports an intentional stale-event gap exactly once", () => {
  const heard = [];
  const events = Array.from({ length: 32 }, (_, index) => ({
    id: 89 + index,
    action: index % 2 ? "katQ" : "explosion"
  }));
  const first = consume({
    cursor: 40,
    events,
    play: (event) => heard.push(event.id)
  });
  assert.deepEqual({ ...first.gap }, { from: 41, to: 88, count: 48 });
  assert.equal(first.cursor, 120);
  assert.equal(first.played, 32);
  assert.deepEqual(heard, Array.from({ length: 32 }, (_, index) => 89 + index));

  const replay = consume({
    cursor: first.cursor,
    events,
    play: (event) => heard.push(event.id)
  });
  assert.equal(replay.gap, null);
  assert.equal(replay.cursor, 120);
  assert.equal(replay.played, 0);
  assert.equal(heard.length, 32);

  const rematch = consume({
    cursor: replay.cursor,
    events: [{ id: 121, action: "pickup" }],
    play: (event) => heard.push(event.id)
  });
  assert.equal(rematch.gap, null);
  assert.equal(rematch.cursor, 121);
  assert.equal(rematch.played, 1);
  assert.equal(heard.at(-1), 121);
});

test("invalid payload cannot poison the cursor or playback options", () => {
  const heard = [];
  const invalid = consume({
    cursor: 4,
    events: [
      { id: 99, action: "not-a-real-cue", x: Infinity },
      { id: 5, action: "katQ", strength: Infinity, x: Infinity, z: -Infinity,
        sourceId: "untrusted", bus: "master", chainDepth: 99 }
    ],
    play: (event) => heard.push(event)
  });
  assert.equal(invalid.cursor, 5);
  assert.equal(heard.length, 1);
  assert.deepEqual(Object.keys(heard[0]).sort(),
    ["chainDepth", "cue", "id", "strength", "x", "z"].sort());
  assert.equal(heard[0].strength, 1);
  assert.equal(heard[0].x, null);
  assert.equal(heard[0].z, null);
  assert.equal(heard[0].chainDepth, 4);
});

test("playback failure advances the cursor without blocking later events", () => {
  const heard = [];
  const result = consume({
    events: [
      { id: 1, action: "bomb" },
      { id: 2, action: "pickup" }
    ],
    play: (event) => {
      if (event.id === 1) throw new Error("AudioContext unavailable");
      heard.push(event.id);
    }
  });
  assert.equal(result.cursor, 2);
  assert.equal(result.played, 2);
  assert.equal(result.playbackErrors, 1);
  assert.deepEqual(heard, [2]);
});
