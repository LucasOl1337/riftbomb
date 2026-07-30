import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../public/online-duel.js", import.meta.url),
  "utf8"
);
const start = source.indexOf("  function createReliableActionStream");
const end = source.indexOf("\n  const state =", start);
assert.ok(start >= 0 && end > start, "reliable action factory must have a stable boundary");
const declaration = source.slice(start, end);
const createReliableActionStream = new Function(
  "performance",
  "ACTION_PROTOCOL_VERSION",
  "ACTION_RETRY_MS",
  "ACTION_OUTBOX_LIMIT",
  "MAX_ACTION_SEQUENCE",
  `"use strict"; ${declaration}; return createReliableActionStream;`
)(
  { now: () => 0 },
  1,
  120,
  16,
  0x7fffffff
);

const protocol = (epoch, hostAck, guestAck = 0) => ({
  v: 1,
  epoch,
  ack: [hostAck, guestAck]
});

test("lost actions replay their original envelope and ACK releases the next FIFO head", () => {
  let now = 0;
  const sent = [];
  const events = [];
  const stream = createReliableActionStream({
    now: () => now,
    persist(saved) { events.push(["persist", structuredClone(saved)]); },
    send(message) {
      sent.push(structuredClone(message));
      events.push(["send", structuredClone(message)]);
      return true;
    }
  });

  assert.equal(stream.negotiate(protocol(4, 0), 0), true);
  events.length = 0;
  assert.equal(stream.queue("bomb", undefined, 1), true);
  assert.equal(stream.queue("ability", 0, 1), true);
  assert.equal(events[0][0], "persist", "the envelope must be durable before its first send");
  assert.equal(events[1][0], "send");
  assert.deepEqual(sent, [{
    type: "action", kind: "bomb", actionEpoch: 4, actionSeq: 1, actionRound: 1
  }], "only the FIFO head may transmit before its ACK");
  assert.deepEqual(stream.snapshot().pendingSequences, [1, 2]);

  now = 119;
  assert.equal(stream.replay(), false);
  now = 120;
  assert.equal(stream.replay(), true);
  assert.deepEqual(sent[1], sent[0], "replay must preserve epoch, sequence and payload");

  assert.equal(stream.synchronize(protocol(4, 1), 0), true);
  assert.deepEqual(sent.at(-1), {
    type: "action", kind: "ability", actionEpoch: 4, actionSeq: 2, actionRound: 1, slot: 0
  }, "ACK of the head releases exactly the next action");
  assert.deepEqual(stream.snapshot().pendingSequences, [2]);
  assert.equal(stream.synchronize(protocol(4, 2), 0), true);
  assert.deepEqual(stream.snapshot().pendingSequences, []);
  assert.equal(stream.snapshot().replayCount, 1);
});

test("ACK never regresses and a new epoch discards stale actions", () => {
  const sent = [];
  const stream = createReliableActionStream({
    persist() {},
    send(message) { sent.push(structuredClone(message)); return true; }
  });
  stream.negotiate(protocol(7, 0), 0);
  stream.queue("bomb", undefined, 1);
  stream.synchronize(protocol(7, 1), 0);
  assert.equal(stream.synchronize(protocol(7, 0), 0), false);
  assert.equal(stream.synchronize(protocol(7, 5), 0), true,
    "the authenticated server cursor can fast-forward a stale cloned tab");
  assert.equal(stream.snapshot().acknowledgedSequence, 5);
  assert.equal(stream.snapshot().nextSequence, 6);

  assert.equal(stream.synchronize(protocol(8, 0), 0), true);
  assert.deepEqual(stream.snapshot().pendingSequences, []);
  assert.equal(stream.synchronize(protocol(7, 1), 0), false);
  assert.equal(stream.queue("ability", 3, 2), true);
  assert.deepEqual(sent.at(-1), {
    type: "action", kind: "ability", slot: 3, actionEpoch: 8, actionSeq: 1, actionRound: 2
  });
});

test("F5 hydration preserves one pending action until the server cursor resolves ambiguity", () => {
  let saved;
  const first = createReliableActionStream({
    persist(value) { saved = structuredClone(value); },
    send: () => true
  });
  first.negotiate(protocol(11, 0), 0);
  first.queue("bomb", undefined, 3);
  assert.deepEqual(saved.outbox, [{
    type: "action", kind: "bomb", actionEpoch: 11, actionSeq: 1, actionRound: 3
  }]);
  assert.equal(Object.prototype.hasOwnProperty.call(saved.outbox[0], "sentAt"), false);

  let now = 0;
  const replayed = [];
  const beforeAck = createReliableActionStream({
    now: () => now,
    persist() {},
    send(message) { replayed.push(structuredClone(message)); return true; }
  });
  saved.outbox[0].padding = "x".repeat(40_000);
  assert.equal(beforeAck.hydrate(saved), true);
  assert.equal(beforeAck.snapshot().mode, "unknown");
  assert.equal(beforeAck.negotiate(protocol(11, 0), 0), true);
  assert.equal(beforeAck.replay(), true, "a restored unsent head is immediately eligible for replay");
  assert.deepEqual(replayed, [{
    type: "action", kind: "bomb", actionEpoch: 11, actionSeq: 1, actionRound: 3
  }], "hydration must strip attacker-controlled fields before replay");
  assert.ok(JSON.stringify(replayed[0]).length < 256,
    "restored actions must remain comfortably below the server frame limit");

  const afterAck = createReliableActionStream({ persist() {}, send: () => true });
  assert.equal(afterAck.hydrate(saved), true);
  assert.equal(afterAck.negotiate(protocol(11, 1), 0), true);
  assert.deepEqual(afterAck.snapshot().pendingSequences, [],
    "an ACK received after reload proves the original action was already processed");
  assert.equal(afterAck.replay(), false);

  const staleTabSent = [];
  const staleTab = createReliableActionStream({
    persist() {},
    send(message) { staleTabSent.push(structuredClone(message)); return true; }
  });
  assert.equal(staleTab.hydrate(saved), true);
  assert.equal(staleTab.negotiate(protocol(11, 5), 0), true,
    "the authenticated cursor wins when another cloned tab advanced the seat");
  assert.deepEqual(staleTab.snapshot().pendingSequences, []);
  assert.equal(staleTab.snapshot().nextSequence, 6);
  assert.equal(staleTab.queue("ability", 1, 4), true);
  assert.equal(staleTabSent[0].actionSeq, 6);
});

test("hydration rejects corrupt, non-contiguous and oversized outboxes", () => {
  const stream = createReliableActionStream({ persist() {}, send: () => true, outboxLimit: 2 });
  const base = {
    v: 1,
    epoch: 3,
    nextSequence: 2,
    acknowledgedSequence: 0,
    outbox: [{
      type: "action", kind: "bomb", actionEpoch: 3, actionSeq: 1, actionRound: 4
    }]
  };
  assert.equal(stream.hydrate(base), true);
  for (const corrupt of [
    { ...base, epoch: 0 },
    { ...base, nextSequence: 4 },
    { ...base, acknowledgedSequence: 2 },
    { ...base, outbox: [{ ...base.outbox[0], actionSeq: 2 }] },
    { ...base, outbox: [{ ...base.outbox[0], kind: "admin" }] },
    {
      ...base,
      nextSequence: 4,
      outbox: [
        base.outbox[0],
        { type: "action", kind: "bomb", actionEpoch: 3, actionSeq: 2, actionRound: 4 },
        { type: "action", kind: "bomb", actionEpoch: 3, actionSeq: 3, actionRound: 4 }
      ]
    }
  ]) {
    assert.equal(stream.hydrate(corrupt), false);
    assert.deepEqual(stream.snapshot().pendingSequences, []);
  }
});

test("the action outbox is bounded, validated and independent from movement", () => {
  const sent = [];
  const stream = createReliableActionStream({
    outboxLimit: 2,
    persist() {},
    send(message) { sent.push(structuredClone(message)); return true; }
  });
  stream.negotiate(protocol(2, 0), 0);
  assert.equal(stream.queue("bomb", undefined, 1), true);
  assert.equal(stream.queue("ability", 1, 1), true);
  assert.equal(stream.queue("bomb", undefined, 1), false);
  assert.equal(stream.queue("ability", 4, 1), false);
  assert.equal(stream.queue("input", 0, 1), false);
  assert.equal(stream.queue("bomb", undefined, -1), false);
  assert.deepEqual(stream.snapshot().pendingSequences, [1, 2]);
  assert.ok(sent.every(({ type }) => type === "action"));
  assert.ok(sent.every((message) => !("inputEpoch" in message) && !("inputSeq" in message)));
});

test("a storage failure is fail-closed before transmission or local prediction", () => {
  let storageAvailable = false;
  const sent = [];
  const stream = createReliableActionStream({
    persist() {
      if (!storageAvailable) throw new Error("quota");
      return true;
    },
    send(message) { sent.push(structuredClone(message)); return true; }
  });
  stream.negotiate(protocol(6, 0), 0);
  assert.equal(stream.queue("bomb", undefined, 1), false);
  assert.deepEqual(sent, []);
  assert.deepEqual(stream.snapshot().pendingSequences, []);
  assert.equal(stream.snapshot().nextSequence, 1,
    "a failed durable write must roll the sequence allocation back");
  assert.equal(stream.currentFailure(), "storage");

  storageAvailable = true;
  assert.equal(stream.queue("bomb", undefined, 1), true);
  assert.equal(stream.currentFailure(), "");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].actionSeq, 1);
});

test("capability negotiation uses one-shot legacy only when the field is absent", () => {
  const legacy = [];
  const reliable = [];
  const disabled = [];
  const senderStart = source.indexOf("  function sendOnlineAction");
  const senderEnd = source.indexOf("\n  game.placeBomb", senderStart);
  assert.ok(senderStart >= 0 && senderEnd > senderStart);
  const senderDeclaration = source.slice(senderStart, senderEnd);
  const buildSender = (stream, target) => new Function(
    "reliableAction",
    "sendControl",
    "game",
    "setStatus",
    "showActionDeliveryError",
    "clearActionDeliveryError",
    `"use strict"; ${senderDeclaration}; return sendOnlineAction;`
  )(
    stream,
    (message) => { target.push(structuredClone(message)); return true; },
    { round: 9 },
    () => {},
    () => {},
    () => {}
  );

  const oldServerStream = createReliableActionStream({ persist() {}, send: () => true });
  assert.equal(oldServerStream.negotiate(undefined, 0), false);
  const oldServerSend = buildSender(oldServerStream, legacy);
  assert.equal(oldServerSend("bomb"), true);
  assert.deepEqual(legacy, [{ type: "action", kind: "bomb" }]);
  assert.equal(oldServerStream.replay(), false);

  const newServerStream = createReliableActionStream({
    persist() {},
    send(message) { reliable.push(structuredClone(message)); return true; }
  });
  newServerStream.negotiate(protocol(5, 0), 0);
  const newServerSend = buildSender(newServerStream, []);
  assert.equal(newServerSend("ability", 2), true);
  assert.equal(reliable[0].actionSeq, 1);
  assert.equal(reliable[0].actionRound, 9);

  const corruptServerStream = createReliableActionStream({ persist() {}, send: () => true });
  assert.equal(corruptServerStream.negotiate({ v: 1, epoch: 2, ack: ["bad"] }, 0), false);
  const corruptServerSend = buildSender(corruptServerStream, disabled);
  assert.equal(corruptServerSend("bomb"), false,
    "a malformed advertised capability must fail closed instead of downgrading");
  assert.deepEqual(disabled, []);
});

test("the gameplay sender reports a fail-closed storage error", () => {
  const senderStart = source.indexOf("  function sendOnlineAction");
  const senderEnd = source.indexOf("\n  game.placeBomb", senderStart);
  const senderDeclaration = source.slice(senderStart, senderEnd);
  const statuses = [];
  const alerts = [];
  const sendOnlineAction = new Function(
    "reliableAction",
    "sendControl",
    "game",
    "setStatus",
    "showActionDeliveryError",
    "clearActionDeliveryError",
    `"use strict"; ${senderDeclaration}; return sendOnlineAction;`
  )(
    {
      currentMode: () => "reliable",
      queue: () => false,
      currentFailure: () => "storage"
    },
    () => true,
    { round: 7 },
    (...args) => statuses.push(args),
    (message) => alerts.push(message),
    () => {}
  );

  assert.equal(sendOnlineAction("bomb"), false);
  assert.deepEqual(statuses, [[
    "Action blocked: browser storage is unavailable. Reload after enabling site data.", "error"
  ]]);
  assert.deepEqual(alerts, [
    "Action blocked: browser storage is unavailable. Reload after enabling site data."
  ]);
});

test("the match alert becomes visible, assertive and self-clearing", () => {
  assert.match(source, /actionAlert\.setAttribute\("role", "alert"\)/);
  assert.match(source, /actionAlert\.setAttribute\("aria-live", "assertive"\)/);
  const alertStart = source.indexOf("  function showActionDeliveryError");
  const alertEnd = source.indexOf("\n  function updateConnection", alertStart);
  assert.ok(alertStart >= 0 && alertEnd > alertStart);
  const alertDeclarations = source.slice(alertStart, alertEnd);
  const actionAlert = { hidden: true, textContent: "" };
  const scheduled = [];
  const timers = [];
  const { showActionDeliveryError, clearActionDeliveryError } = new Function(
    "actionAlert", "clearTimeout", "setTimeout", "actionAlertTimer",
    `"use strict"; ${alertDeclarations}; return { showActionDeliveryError, clearActionDeliveryError };`
  )(
    actionAlert,
    (timer) => timers.push(timer),
    (callback, delay) => { scheduled.push({ callback, delay }); return 41; },
    0
  );

  showActionDeliveryError("Storage unavailable");
  assert.equal(actionAlert.hidden, false);
  assert.equal(actionAlert.textContent, "Storage unavailable");
  assert.equal(scheduled[0].delay, 8000);
  scheduled[0].callback();
  assert.equal(actionAlert.hidden, true);
  assert.equal(actionAlert.textContent, "");

  showActionDeliveryError("Retry");
  clearActionDeliveryError();
  assert.equal(actionAlert.hidden, true);
  assert.equal(actionAlert.textContent, "");
  assert.ok(timers.includes(41));
});

test("transport replay cannot call gameplay prediction", () => {
  const replayBody = declaration.slice(
    declaration.indexOf("    const replay ="),
    declaration.indexOf("    const reset =")
  );
  assert.doesNotMatch(replayBody, /placeBomb|castAbility|offlinePlaceBomb|offlineCastAbility|game\./);
  assert.match(replayBody, /transmit\(outbox\[0\], true\)/);
});

test("the real bomb and ability wrappers predict once while transport replays only the envelope", () => {
  let now = 0;
  const sent = [];
  const stream = createReliableActionStream({
    now: () => now,
    persist() {},
    send(message) { sent.push(structuredClone(message)); return true; }
  });
  stream.negotiate(protocol(13, 0), 0);

  const senderStart = source.indexOf("  function sendOnlineAction");
  const senderEnd = source.indexOf("\n  game.placeBomb", senderStart);
  const senderDeclaration = source.slice(senderStart, senderEnd);
  const game = {
    bombs: [],
    player: { id: 1 },
    round: 5
  };
  const sendOnlineAction = new Function(
    "reliableAction", "sendControl", "game", "setStatus",
    "showActionDeliveryError", "clearActionDeliveryError",
    `"use strict"; ${senderDeclaration}; return sendOnlineAction;`
  )(stream, () => true, game, () => {}, () => {}, () => {});

  const wrappersStart = source.indexOf("  game.placeBomb =");
  const wrappersEnd = source.indexOf("\n  if (typeof offlineRequestDash", wrappersStart);
  assert.ok(wrappersStart >= 0 && wrappersEnd > wrappersStart);
  const wrappers = source.slice(wrappersStart, wrappersEnd);
  let bombPredictions = 0;
  let abilityPredictions = 0;
  const state = {
    role: "host",
    connected: true,
    socket: {},
    pendingGuestBombs: []
  };
  new Function(
    "game", "state", "offlinePlaceBomb", "localOnlinePlayer", "sendOnlineAction",
    "offlineCastAbility", "performance",
    `"use strict"; ${wrappers}`
  )(
    game,
    state,
    (actor) => {
      bombPredictions += 1;
      game.bombs.push({ id: bombPredictions, ownerId: actor.id, passOwners: [] });
      return true;
    },
    () => game.player,
    sendOnlineAction,
    (slot, actor, options) => {
      abilityPredictions += 1;
      assert.equal(slot, 0);
      assert.equal(actor, game.player);
      assert.deepEqual(options, { buffer: false });
      return true;
    },
    { now: () => now }
  );

  assert.equal(game.placeBomb(game.player), true);
  assert.equal(bombPredictions, 1);
  assert.equal(sent.length, 1);
  now = 120;
  assert.equal(stream.replay(), true);
  assert.equal(bombPredictions, 1, "a bomb replay must not repeat local prediction");
  assert.deepEqual(sent[1], sent[0]);

  stream.synchronize(protocol(13, 1), 0);
  assert.equal(game.castAbility(0, game.player), true);
  assert.equal(abilityPredictions, 1);
  assert.equal(sent.at(-1).actionSeq, 2);
  now = 240;
  assert.equal(stream.replay(), true);
  assert.equal(abilityPredictions, 1, "an ability replay must not repeat local prediction");
  assert.deepEqual(sent.at(-1), sent.at(-2));
});
