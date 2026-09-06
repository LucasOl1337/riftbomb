import assert from "node:assert/strict";
import test from "node:test";

const continuityUrl = new URL("../public/match-continuity.js", import.meta.url);
await import(`${continuityUrl.href}?input=${Date.now()}`);
const continuityFactory = globalThis.RIFTBOMB_MATCH_CONTINUITY;

function createFixture() {
  const sent = [];
  const values = new Map();
  const clock = { now: 0 };
  const continuity = continuityFactory.create({
    send(message) {
      sent.push(structuredClone(message));
      return true;
    },
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    now: () => clock.now,
    scheduleTimeout: () => 1,
    cancelTimeout: () => undefined,
  });
  return { clock, continuity, sent };
}

const inputProtocol = (epoch, accepted, ack) => ({
  input: {
    v: 1,
    epoch,
    accepted: [accepted, 0],
    ack: [ack, 0],
  },
});

test("lost movement transitions replay in order with their original sequence", () => {
  const { clock, continuity, sent } = createFixture();
  const delivery = continuity.delivery;

  delivery.synchronize(inputProtocol(4, 0, 0), 0);
  assert.equal(delivery.sendMovement(8), true);
  assert.equal(delivery.sendMovement(0), true);
  assert.deepEqual(sent.map(({ inputSeq, mask }) => [inputSeq, mask]), [[1, 8], [2, 0]]);
  assert.deepEqual(delivery.inputSnapshot().pendingSequences, [1, 2]);

  clock.now = 119;
  delivery.replay();
  assert.equal(sent.length, 2);
  clock.now = 120;
  delivery.replay();
  assert.deepEqual(sent.map(({ inputSeq, mask }) => [inputSeq, mask]), [
    [1, 8], [2, 0], [1, 8],
  ]);
  assert.equal(delivery.inputSnapshot().replayCount, 1);

  delivery.synchronize(inputProtocol(4, 2, 1), 0);
  assert.deepEqual(delivery.inputSnapshot().pendingSequences, [2]);
  delivery.synchronize(inputProtocol(4, 2, 2), 0);
  assert.deepEqual(delivery.inputSnapshot().pendingSequences, []);
  clock.now = 500;
  delivery.replay();
  assert.equal(sent.length, 3);
});

test("ACK never regresses and a new Match epoch drops stale movement", () => {
  const { continuity, sent } = createFixture();
  const delivery = continuity.delivery;
  delivery.synchronize(inputProtocol(7, 0, 0), 0);
  delivery.sendMovement(4);
  delivery.synchronize(inputProtocol(7, 1, 1), 0);
  delivery.synchronize(inputProtocol(7, 1, 0), 0);
  assert.equal(delivery.inputSnapshot().acknowledgedSequence, 1);

  delivery.synchronize(inputProtocol(8, 0, 0), 0);
  assert.deepEqual(delivery.inputSnapshot().pendingSequences, []);
  delivery.synchronize(inputProtocol(7, 0, 0), 0);
  assert.equal(delivery.inputSnapshot().epoch, 8);
  assert.equal(delivery.sendMovement(4), true, "a new epoch must re-arm the held mask");
  assert.deepEqual(sent.at(-1), {
    type: "input", mask: 4, inputEpoch: 8, inputSeq: 1,
  });
});

test("the movement outbox is bounded and contains only input envelopes", () => {
  const { continuity, sent } = createFixture();
  const delivery = continuity.delivery;
  delivery.synchronize(inputProtocol(2, 0, 0), 0);
  for (let index = 0; index < 64; index += 1) {
    assert.equal(delivery.sendMovement(index % 2 ? 2 : 1), true);
  }
  assert.equal(delivery.sendMovement(4), true,
    "a full outbox keeps the caller live while refusing another envelope");
  assert.equal(delivery.sendMovement(16), false);
  assert.equal(delivery.inputSnapshot().pendingSequences.length, 64);
  assert.equal(sent.length, 64);
  assert.ok(sent.every(({ type }) => type === "input"));
  assert.ok(sent.every((message) => !("kind" in message) && !("slot" in message)));
});

test("invalid or future cursors cannot prune pending input", () => {
  const { continuity } = createFixture();
  const delivery = continuity.delivery;
  delivery.synchronize(inputProtocol(3, 0, 0), 0);
  delivery.sendMovement(8);
  const invalid = [
    null,
    { input: { v: 1, epoch: 3, accepted: [0], ack: [1] } },
    { input: { v: 1, epoch: 3, accepted: [1.5], ack: [1] } },
    { input: { v: 1, epoch: -1, accepted: [1], ack: [1] } },
    { input: { v: 1, epoch: 3, accepted: [2], ack: [2] } },
  ];
  for (const cursor of invalid) delivery.synchronize(cursor, 0);
  assert.deepEqual(delivery.inputSnapshot().pendingSequences, [1]);
});

test("legacy movement dedupe stays inside Match continuity", () => {
  const { continuity, sent } = createFixture();
  const delivery = continuity.delivery;
  assert.equal(delivery.sendMovement(8), true);
  assert.equal(delivery.sendMovement(8), false);
  assert.deepEqual(sent, [{ type: "input", mask: 8 }]);

  delivery.beginMatch({}, 0);
  assert.equal(delivery.sendMovement(8), true,
    "an old-server rematch may resend the same held direction");
  delivery.synchronize(inputProtocol(1, 0, 0), 0);
  assert.equal(delivery.sendMovement(0), true);
  assert.deepEqual(sent.at(-1), {
    type: "input", mask: 0, inputEpoch: 1, inputSeq: 1,
  });
});

test("movement delivery exposes RTT and pending-input age for visual reconciliation", () => {
  const { clock, continuity } = createFixture();
  const delivery = continuity.delivery;
  delivery.synchronize(inputProtocol(5, 0, 0), 0);

  delivery.sendMovement(8);
  clock.now = 40;
  assert.equal(delivery.inputSnapshot().oldestPendingAgeMs, 40);
  assert.equal(delivery.inputSnapshot().roundTripMs, null);

  clock.now = 100;
  delivery.synchronize(inputProtocol(5, 1, 1), 0);
  assert.equal(delivery.inputSnapshot().roundTripMs, 100);
  assert.equal(delivery.inputSnapshot().oldestPendingAgeMs, null);

  clock.now = 200;
  delivery.sendMovement(0);
  clock.now = 260;
  delivery.synchronize(inputProtocol(5, 2, 1), 0);
  assert.equal(delivery.inputSnapshot().oldestPendingAgeMs, 60);
  assert.equal(delivery.inputSnapshot().roundTripMs, 100);
});

test("movement RTT measures the original input even after a replay", () => {
  const { clock, continuity, sent } = createFixture();
  const delivery = continuity.delivery;
  delivery.synchronize(inputProtocol(9, 0, 0), 0);

  delivery.sendMovement(8);
  clock.now = 120;
  delivery.replay();
  assert.equal(sent.length, 2, "the fixture must exercise a real retransmission");
  clock.now = 180;
  delivery.synchronize(inputProtocol(9, 1, 1), 0);

  assert.equal(delivery.inputSnapshot().roundTripMs, 180,
    "a retransmission must not erase the latency already felt by the player");
});
