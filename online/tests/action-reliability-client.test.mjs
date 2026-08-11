import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const continuityUrl = new URL("../public/match-continuity.js", import.meta.url);
await import(`${continuityUrl.href}?action=${Date.now()}`);
const continuityFactory = globalThis.RIFTBOMB_MATCH_CONTINUITY;

function createFixture({ setItem, send } = {}) {
  const values = new Map();
  const sent = [];
  const events = [];
  const clock = { now: 0 };
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: setItem || ((key, value) => {
      values.set(key, value);
      events.push(["persist", JSON.parse(value).actionDelivery]);
    }),
    removeItem: (key) => values.delete(key),
  };
  const continuity = continuityFactory.create({
    send: send || ((message) => {
      sent.push(structuredClone(message));
      events.push(["send", structuredClone(message)]);
      return true;
    }),
    storage,
    captureSession: () => ({
      role: "host",
      roomCode: "ABC234",
      resumeToken: "ab".repeat(32),
      phase: "match",
      confirmed: true,
    }),
    now: () => clock.now,
    wallNow: () => 1_000,
    scheduleTimeout: () => 1,
    cancelTimeout: () => undefined,
  });
  return { clock, continuity, events, sent, values };
}

const actionProtocol = (epoch, hostAck, guestAck = 0) => ({
  action: { v: 1, epoch, ack: [hostAck, guestAck] },
});

const actionState = (delivery) => delivery.snapshot().action;

test("lost actions replay their envelope and ACK releases the next FIFO head", () => {
  const { clock, continuity, events, sent } = createFixture();
  const delivery = continuity.delivery;
  delivery.negotiate(actionProtocol(4, 0), 0);
  events.length = 0;

  assert.equal(delivery.sendAction("bomb", undefined, 1), true);
  assert.equal(delivery.sendAction("ability", 0, 1), true);
  assert.equal(events[0][0], "persist", "the envelope must be durable before its first send");
  assert.equal(events[1][0], "send");
  assert.deepEqual(sent, [{
    type: "action", kind: "bomb", actionEpoch: 4, actionSeq: 1, actionRound: 1,
  }]);
  assert.deepEqual(actionState(delivery).pendingSequences, [1, 2]);

  clock.now = 119;
  delivery.replay();
  assert.equal(sent.length, 1);
  clock.now = 120;
  delivery.replay();
  assert.deepEqual(sent[1], sent[0]);

  delivery.synchronize(actionProtocol(4, 1), 0);
  assert.deepEqual(sent.at(-1), {
    type: "action", kind: "ability", actionEpoch: 4, actionSeq: 2,
    actionRound: 1, slot: 0,
  });
  assert.deepEqual(actionState(delivery).pendingSequences, [2]);
  delivery.synchronize(actionProtocol(4, 2), 0);
  assert.deepEqual(actionState(delivery).pendingSequences, []);
  assert.equal(actionState(delivery).replayCount, 1);
});

test("ACK never regresses and a new Match epoch drops stale actions", () => {
  const { continuity, sent } = createFixture();
  const delivery = continuity.delivery;
  delivery.negotiate(actionProtocol(7, 0), 0);
  delivery.sendAction("bomb", undefined, 1);
  delivery.synchronize(actionProtocol(7, 1), 0);
  delivery.synchronize(actionProtocol(7, 0), 0);
  assert.equal(actionState(delivery).acknowledgedSequence, 1);
  delivery.synchronize(actionProtocol(7, 5), 0);
  assert.equal(actionState(delivery).acknowledgedSequence, 5);
  assert.equal(actionState(delivery).nextSequence, 6);

  delivery.synchronize(actionProtocol(8, 0), 0);
  assert.deepEqual(actionState(delivery).pendingSequences, []);
  delivery.synchronize(actionProtocol(7, 1), 0);
  assert.equal(delivery.sendAction("ability", 3, 2), true);
  assert.deepEqual(sent.at(-1), {
    type: "action", kind: "ability", slot: 3,
    actionEpoch: 8, actionSeq: 1, actionRound: 2,
  });
});

test("reload hydration keeps one pending action until the server resolves it", () => {
  const first = createFixture();
  first.continuity.delivery.negotiate(actionProtocol(11, 0), 0);
  first.continuity.delivery.sendAction("bomb", undefined, 3);
  const saved = first.continuity.delivery.persistedAction();
  assert.deepEqual(saved.outbox, [{
    type: "action", kind: "bomb", actionEpoch: 11, actionSeq: 1, actionRound: 3,
  }]);
  saved.outbox[0].padding = "x".repeat(40_000);

  const beforeAck = createFixture();
  assert.equal(beforeAck.continuity.delivery.hydrateAction(saved), true);
  assert.equal(actionState(beforeAck.continuity.delivery).mode, "unknown");
  beforeAck.continuity.delivery.negotiate(actionProtocol(11, 0), 0);
  beforeAck.continuity.delivery.replay();
  assert.deepEqual(beforeAck.sent, [{
    type: "action", kind: "bomb", actionEpoch: 11, actionSeq: 1, actionRound: 3,
  }], "hydration must strip attacker-controlled fields before replay");
  assert.ok(JSON.stringify(beforeAck.sent[0]).length < 256);

  const afterAck = createFixture();
  assert.equal(afterAck.continuity.delivery.hydrateAction(saved), true);
  afterAck.continuity.delivery.negotiate(actionProtocol(11, 1), 0);
  assert.deepEqual(actionState(afterAck.continuity.delivery).pendingSequences, []);
  afterAck.continuity.delivery.replay();
  assert.deepEqual(afterAck.sent, []);

  const staleTab = createFixture();
  staleTab.continuity.delivery.hydrateAction(saved);
  staleTab.continuity.delivery.negotiate(actionProtocol(11, 5), 0);
  assert.equal(actionState(staleTab.continuity.delivery).nextSequence, 6);
  staleTab.continuity.delivery.sendAction("ability", 1, 4);
  assert.equal(staleTab.sent[0].actionSeq, 6);
});

test("hydration rejects corrupt, non-contiguous and oversized outboxes", () => {
  const { continuity } = createFixture();
  const base = {
    v: 1,
    epoch: 3,
    nextSequence: 2,
    acknowledgedSequence: 0,
    outbox: [{
      type: "action", kind: "bomb", actionEpoch: 3, actionSeq: 1, actionRound: 4,
    }],
  };
  assert.equal(continuity.delivery.hydrateAction(base), true);
  const oversized = Array.from({ length: 17 }, (_, index) => ({
    type: "action", kind: "bomb", actionEpoch: 3, actionSeq: index + 1, actionRound: 4,
  }));
  for (const corrupt of [
    { ...base, epoch: 0 },
    { ...base, nextSequence: 4 },
    { ...base, acknowledgedSequence: 2 },
    { ...base, outbox: [{ ...base.outbox[0], actionSeq: 2 }] },
    { ...base, outbox: [{ ...base.outbox[0], kind: "admin" }] },
    { ...base, nextSequence: 18, outbox: oversized },
  ]) {
    assert.equal(continuity.delivery.hydrateAction(corrupt), false);
    assert.deepEqual(actionState(continuity.delivery).pendingSequences, []);
  }
});

test("the action outbox is bounded, validated and independent from movement", () => {
  const { continuity, sent } = createFixture();
  const delivery = continuity.delivery;
  delivery.negotiate(actionProtocol(2, 0), 0);
  for (let index = 0; index < 16; index += 1) {
    assert.equal(delivery.sendAction(index % 2 ? "ability" : "bomb", 1, 1), true);
  }
  assert.equal(delivery.sendAction("bomb", undefined, 1), false);
  assert.equal(delivery.sendAction("ability", 4, 1), false);
  assert.equal(delivery.sendAction("input", 0, 1), false);
  assert.equal(delivery.sendAction("bomb", undefined, -1), false);
  assert.equal(actionState(delivery).pendingSequences.length, 16);
  assert.ok(sent.every(({ type }) => type === "action"));
  assert.ok(sent.every((message) => !("inputEpoch" in message) && !("inputSeq" in message)));
});

test("a storage failure blocks transmission before local prediction", () => {
  let storageAvailable = false;
  const sent = [];
  const fixture = createFixture({
    setItem() {
      if (!storageAvailable) throw new Error("quota");
    },
    send(message) {
      sent.push(structuredClone(message));
      return true;
    },
  });
  const delivery = fixture.continuity.delivery;
  delivery.negotiate(actionProtocol(6, 0), 0);
  assert.equal(delivery.sendAction("bomb", undefined, 1), false);
  assert.deepEqual(sent, []);
  assert.equal(actionState(delivery).nextSequence, 1);
  assert.equal(delivery.actionFailure(), "storage");

  storageAvailable = true;
  assert.equal(delivery.sendAction("bomb", undefined, 1), true);
  assert.equal(delivery.actionFailure(), "");
  assert.equal(sent[0].actionSeq, 1);
});

test("capability negotiation permits legacy only when the field is absent", () => {
  const legacy = createFixture();
  legacy.continuity.delivery.negotiate({}, 0);
  assert.equal(legacy.continuity.delivery.actionMode(), "legacy");
  assert.equal(legacy.continuity.delivery.sendAction("bomb", undefined, 9), true);
  assert.deepEqual(legacy.sent, [{ type: "action", kind: "bomb" }]);

  const reliable = createFixture();
  reliable.continuity.delivery.negotiate(actionProtocol(5, 0), 0);
  reliable.continuity.delivery.sendAction("ability", 2, 9);
  assert.equal(reliable.sent[0].actionSeq, 1);
  assert.equal(reliable.sent[0].actionRound, 9);

  const corrupt = createFixture();
  corrupt.continuity.delivery.negotiate({ action: { v: 1, epoch: 2, ack: ["bad"] } }, 0);
  assert.equal(corrupt.continuity.delivery.actionMode(), "disabled");
  assert.equal(corrupt.continuity.delivery.sendAction("bomb", undefined, 9), false);
  assert.deepEqual(corrupt.sent, []);
});

test("the browser adapter owns prediction and storage-error presentation, not replay", async () => {
  const [bridge, moduleSource] = await Promise.all([
    readFile(new URL("../public/online-duel.js", import.meta.url), "utf8"),
    readFile(continuityUrl, "utf8"),
  ]);
  assert.match(bridge, /const sent = delivery\.sendAction\(kind, slot, game\.round, aim\)/);
  assert.match(bridge, /delivery\.actionFailure\(\) === "storage"/);
  assert.match(bridge, /showActionDeliveryError\(message\)/);
  assert.match(bridge, /actionAlert\.setAttribute\("role", "alert"\)/);
  assert.match(bridge, /actionAlert\.setAttribute\("aria-live", "assertive"\)/);
  assert.match(bridge, /if \(!sendOnlineAction\("bomb"\)\) return false/);
  assert.match(bridge, /if \(!sendOnlineAction\("ability", slot, aim\)\) return false/);
  assert.doesNotMatch(moduleSource, /placeBomb|castAbility|offlinePlaceBomb|offlineCastAbility|\bgame\./);
});
