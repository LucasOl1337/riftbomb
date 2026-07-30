import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../public/online-duel.js", import.meta.url),
  "utf8"
);
const start = source.indexOf("  function createReliableInputStream");
const end = source.indexOf("\n  const state =", start);
assert.ok(start >= 0 && end > start, "reliable input factory must have a stable boundary");
const declaration = source.slice(start, end);
const createReliableInputStream = new Function(
  "performance",
  "INPUT_PROTOCOL_VERSION",
  "INPUT_RETRY_MS",
  "INPUT_OUTBOX_LIMIT",
  "MAX_INPUT_SEQUENCE",
  `"use strict"; ${declaration}; return createReliableInputStream;`
)(
  { now: () => 0 },
  1,
  120,
  64,
  0x7fffffff
);

const movementStart = source.indexOf("  function sendMovementInput");
const movementEnd = source.indexOf("\n  function sendCurrentInput", movementStart);
assert.ok(movementStart >= 0 && movementEnd > movementStart,
  "movement sender must have a stable boundary");
const movementDeclaration = source.slice(movementStart, movementEnd);

const protocol = (epoch, accepted, ack) => ({
  v: 1,
  epoch,
  accepted: [accepted, 0],
  ack: [ack, 0]
});

test("lost movement transitions replay in order with their original sequence", () => {
  let now = 0;
  const sent = [];
  const stream = createReliableInputStream({
    now: () => now,
    send(message) {
      sent.push(structuredClone(message));
      return true;
    }
  });

  assert.equal(stream.synchronize(protocol(4, 0, 0), 0), true);
  assert.equal(stream.queue(8), true);
  assert.equal(stream.queue(0), true);
  assert.deepEqual(sent.map(({ inputSeq, mask }) => [inputSeq, mask]), [[1, 8], [2, 0]]);
  assert.deepEqual(stream.snapshot().pendingSequences, [1, 2]);

  now = 119;
  assert.equal(stream.replay(), false);
  now = 120;
  assert.equal(stream.replay(), true);
  assert.deepEqual(sent.map(({ inputSeq, mask }) => [inputSeq, mask]), [
    [1, 8], [2, 0], [1, 8]
  ]);
  assert.equal(stream.snapshot().replayCount, 1);

  assert.equal(stream.synchronize(protocol(4, 2, 1), 0), true);
  assert.deepEqual(stream.snapshot().pendingSequences, [2]);
  assert.equal(stream.synchronize(protocol(4, 2, 2), 0), true);
  assert.deepEqual(stream.snapshot().pendingSequences, []);
  now = 500;
  assert.equal(stream.replay(), false);
});

test("ACK never regresses and a new match epoch discards stale movement", () => {
  const sent = [];
  const stream = createReliableInputStream({
    send(message) { sent.push(structuredClone(message)); return true; }
  });

  stream.synchronize(protocol(7, 0, 0), 0);
  stream.queue(4);
  stream.synchronize(protocol(7, 1, 1), 0);
  assert.equal(stream.synchronize(protocol(7, 1, 0), 0), false);
  assert.equal(stream.snapshot().acknowledgedSequence, 1);

  assert.equal(stream.synchronize(protocol(8, 0, 0), 0), true);
  assert.deepEqual(stream.snapshot().pendingSequences, []);
  assert.equal(stream.synchronize(protocol(7, 0, 0), 0), false,
    "a delayed cursor from the previous match must not roll the stream back");
  assert.equal(stream.snapshot().epoch, 8);
  assert.equal(stream.queue(4), true, "the held mask must be re-armed in the new epoch");
  assert.deepEqual(sent.at(-1), {
    type: "input", mask: 4, inputEpoch: 8, inputSeq: 1
  });
});

test("the movement outbox is bounded and never contains one-shot actions", () => {
  const sent = [];
  const stream = createReliableInputStream({
    outboxLimit: 2,
    send(message) { sent.push(structuredClone(message)); return true; }
  });
  stream.synchronize(protocol(2, 0, 0), 0);
  assert.equal(stream.queue(1), true);
  assert.equal(stream.queue(2), true);
  assert.equal(stream.queue(4), false);
  assert.equal(stream.queue(16), false);
  assert.deepEqual(stream.snapshot().pendingSequences, [1, 2]);
  assert.ok(sent.every(({ type }) => type === "input"));
  assert.ok(sent.every((message) => !("kind" in message) && !("slot" in message)));
});

test("invalid or future protocol cursors cannot prune pending input", () => {
  const stream = createReliableInputStream({ send: () => true });
  stream.synchronize(protocol(3, 0, 0), 0);
  stream.queue(8);
  const invalid = [
    null,
    { v: 1, epoch: 3, accepted: [0], ack: [1] },
    { v: 1, epoch: 3, accepted: [1.5], ack: [1] },
    { v: 1, epoch: -1, accepted: [1], ack: [1] },
    { v: 1, epoch: 3, accepted: [2], ack: [2] }
  ];
  for (const cursor of invalid) assert.equal(stream.synchronize(cursor, 0), false);
  assert.deepEqual(stream.snapshot().pendingSequences, [1]);
});

test("rolling deploy falls back only while the server has not advertised input v1", () => {
  const legacy = [];
  const queued = [];
  const state = { lastLegacyInput: -1 };
  let epoch = 0;
  const reliableInput = {
    currentEpoch: () => epoch,
    queue(mask) { queued.push(mask); return true; },
    replay() { throw new Error("a queued transition must not replay immediately"); }
  };
  const sendMovementInput = new Function(
    "reliableInput",
    "state",
    "sendControl",
    `"use strict"; ${movementDeclaration}; return sendMovementInput;`
  )(
    reliableInput,
    state,
    (message) => { legacy.push(structuredClone(message)); return true; }
  );

  assert.equal(sendMovementInput(8), true);
  assert.equal(sendMovementInput(8), false);
  assert.deepEqual(legacy, [{ type: "input", mask: 8 }]);

  epoch = 1;
  assert.equal(sendMovementInput(0), true);
  assert.deepEqual(queued, [0]);
  assert.equal(state.lastLegacyInput, -1);
});

test("an old-server rematch can resend the same held legacy direction", () => {
  const sent = [];
  const state = { lastLegacyInput: 8 };
  const sendMovementInput = new Function(
    "reliableInput",
    "state",
    "sendControl",
    `"use strict"; ${movementDeclaration}; return sendMovementInput;`
  )(
    { currentEpoch: () => 0 },
    state,
    (message) => { sent.push(structuredClone(message)); return true; }
  );

  state.lastLegacyInput = -1;
  assert.equal(sendMovementInput(8), true);
  assert.deepEqual(sent, [{ type: "input", mask: 8 }]);
});
