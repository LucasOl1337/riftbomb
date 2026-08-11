import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const continuityUrl = new URL("../public/match-continuity.js", import.meta.url);
await import(`${continuityUrl.href}?test=${Date.now()}`);
const continuityFactory = globalThis.RIFTBOMB_MATCH_CONTINUITY;

function createMemoryFixture({
  initial = [],
  capture = {
    role: "host",
    roomCode: "ABC234",
    resumeToken: "ab".repeat(32),
    hostChampion: "katarina",
    guestChampion: "zed",
    arena: "lattice",
    inviteMode: false,
    quickMatch: false,
    guestReady: true,
    matchTarget: 3,
    phase: "match",
    confirmed: true
  },
  send,
  setItem,
  wait
} = {}) {
  const values = new Map(initial);
  const sent = [];
  const clock = { monotonic: 0, wall: 1_000 };
  let captured = capture;
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: setItem || ((key, value) => values.set(key, value)),
    removeItem: (key) => values.delete(key)
  };
  const continuity = continuityFactory.create({
    send: send || ((message) => {
      sent.push(structuredClone(message));
      return true;
    }),
    storage,
    captureSession: () => captured,
    randomBytes: (bytes) => {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = index;
    },
    now: () => clock.monotonic,
    wallNow: () => clock.wall,
    wait: wait || (async () => undefined),
    scheduleTimeout: () => 1,
    cancelTimeout: () => undefined
  });
  return {
    clock,
    continuity,
    sent,
    storage,
    values,
    setCapture(value) { captured = value; }
  };
}

test("publishes one factory as the Match continuity seam", () => {
  assert.deepEqual(Object.keys(continuityFactory), ["create"]);
  const { continuity } = createMemoryFixture();
  assert.deepEqual(Object.keys(continuity).sort(), [
    "connection", "delivery", "reset", "runtime", "session"
  ]);
  assert.deepEqual(Object.keys(continuity.connection), [
    "cancelPending", "close", "connect", "isOpen", "send"
  ]);
});

test("resume bearer is exactly 32 random bytes and pending reloads reuse it", () => {
  const { continuity } = createMemoryFixture({ capture: null });
  const token = continuity.session.ensureToken("");
  assert.equal(token, Array.from({ length: 32 }, (_, index) =>
    index.toString(16).padStart(2, "0")).join(""));
  assert.match(token, /^[a-f0-9]{64}$/);

  assert.equal(continuity.session.savePending({
    resumeToken: token,
    quickMatch: true,
    roomCode: "",
    hostChampion: "katarina",
    arena: "lattice"
  }), true);
  assert.equal(continuity.session.ensureToken(""), token);
  assert.equal(continuity.session.loadPending().resumeToken, token);
});

test("resume retry is bounded, selective and cancelable", async () => {
  const waits = [];
  const { continuity } = createMemoryFixture({ wait: async (delay) => waits.push(delay) });
  let attempts = 0;
  const result = await continuity.session.retryResume(async () => {
    attempts += 1;
    if (attempts < 3) throw new Error("role_taken");
    return "resumed";
  }, { delays: [5, 10] });
  assert.equal(result, "resumed");
  assert.deepEqual(waits, [5, 10]);

  let fatalAttempts = 0;
  await assert.rejects(continuity.session.retryResume(async () => {
    fatalAttempts += 1;
    throw new Error("resume_denied");
  }, { delays: [1, 1] }), /resume_denied/);
  assert.equal(fatalAttempts, 1);

  let active = true;
  const cancelled = createMemoryFixture({ wait: async () => { active = false; } }).continuity;
  await assert.rejects(cancelled.session.retryResume(async () => {
    throw new Error("role_taken");
  }, { delays: [1], active: () => active }), /resume_cancelled/);
});

test("only definitive credential failures discard a saved Match", () => {
  const { continuity } = createMemoryFixture();
  for (const message of [
    "resume_denied", "resume_expired", "room_not_found", "invalid_resume", "invalid_hello"
  ]) {
    assert.equal(continuity.session.definitiveResumeFailure(new Error(message)), true, message);
  }
  for (const message of [
    "role_taken", "authoritative_server_timeout", "authoritative_server_unavailable", "server_full"
  ]) {
    assert.equal(continuity.session.definitiveResumeFailure(new Error(message)), false, message);
  }
  assert.equal(continuity.session.definitiveInitialFailure(new Error("role_taken")), true);
  assert.equal(continuity.session.definitiveInitialFailure(
    new Error("authoritative_server_timeout")), false);
});

test("session persistence keeps startup credentials and validates restored rooms", () => {
  const fixture = createMemoryFixture({
    initial: [["riftbomb-online-session-v1", "protected-credential"]]
  });
  fixture.setCapture({ role: "offline", roomCode: "" });
  assert.equal(fixture.continuity.session.save(), false);
  assert.equal(fixture.values.get("riftbomb-online-session-v1"), "protected-credential");

  fixture.setCapture({
    role: "guest",
    roomCode: "ABC234",
    resumeToken: "cd".repeat(32),
    phase: "lobby",
    confirmed: true
  });
  assert.equal(fixture.continuity.session.save(), true);
  const restored = fixture.continuity.session.load();
  assert.equal(restored.role, "guest");
  assert.equal(restored.confirmed, true);
  assert.equal(fixture.continuity.session.matchesRoom(restored, "abc234"), true);
  assert.equal(fixture.continuity.session.matchesRoom(restored, "XYZ567"), false);
});

test("movement delivery is ordered, bounded and replayed through the transport adapter", () => {
  const { continuity, sent, clock } = createMemoryFixture();
  continuity.delivery.negotiate({
    input: { v: 1, epoch: 7, accepted: [0, 0], ack: [0, 0] },
    action: { v: 1, epoch: 7, ack: [0, 0] }
  }, 0);
  assert.equal(continuity.delivery.sendMovement(8), true);
  assert.equal(continuity.delivery.sendMovement(8), true);
  assert.equal(sent.length, 1, "duplicate masks stay coalesced");
  assert.deepEqual(sent.at(-1), { type: "input", mask: 8, inputEpoch: 7, inputSeq: 1 });
  clock.monotonic = 119;
  continuity.delivery.replay();
  assert.equal(sent.length, 1);
  clock.monotonic = 120;
  continuity.delivery.replay();
  assert.equal(sent.length, 2);
  assert.equal(continuity.delivery.inputSnapshot().replayCount, 1);
  continuity.delivery.synchronize({
    input: { v: 1, epoch: 7, accepted: [1, 0], ack: [1, 0] }
  }, 0);
  assert.deepEqual(continuity.delivery.inputSnapshot().pendingSequences, []);
});

test("durable action is stored before first transmission and hydrates after reload", () => {
  let fixture;
  const observed = [];
  fixture = createMemoryFixture({
    send(message) {
      const saved = JSON.parse(fixture.values.get("riftbomb-online-session-v1"));
      observed.push({ message: structuredClone(message), saved });
      return true;
    }
  });
  fixture.continuity.delivery.negotiate({
    input: { v: 1, epoch: 4, accepted: [0, 0], ack: [0, 0] },
    action: { v: 1, epoch: 4, ack: [0, 0] }
  }, 0);
  assert.equal(fixture.continuity.delivery.sendAction("ability", 2, 3, { x: 4, z: 5 }), true);
  assert.equal(observed.length, 1);
  assert.equal(observed[0].saved.actionDelivery.outbox[0].actionSeq, 1);
  assert.deepEqual(observed[0].message, {
    type: "action", kind: "ability", slot: 2,
    actionEpoch: 4, actionSeq: 1, actionRound: 3, aimX: 4, aimZ: 5
  });

  const saved = fixture.continuity.session.load();
  const reloaded = createMemoryFixture({ initial: [...fixture.values] }).continuity;
  assert.equal(reloaded.delivery.hydrateAction(saved.actionDelivery), true);
  assert.deepEqual(reloaded.delivery.snapshot().action.pendingSequences, [1]);
});

test("action delivery fails closed when the storage adapter rejects durability", () => {
  let writes = 0;
  const { continuity, sent } = createMemoryFixture({
    setItem() {
      writes += 1;
      if (writes > 1) throw new Error("quota");
    }
  });
  continuity.delivery.negotiate({
    input: { v: 1, epoch: 2, accepted: [0, 0], ack: [0, 0] },
    action: { v: 1, epoch: 2, ack: [0, 0] }
  }, 0);
  assert.equal(continuity.delivery.sendAction("bomb", undefined, 1), false);
  assert.equal(continuity.delivery.actionFailure(), "storage");
  assert.deepEqual(sent, []);
});

test("snapshot continuity keeps newest ACK while carrying the first full grid", () => {
  const { continuity } = createMemoryFixture();
  const players = [{ id: 1 }, { id: 2 }];
  assert.equal(continuity.runtime.receiveSnapshot({
    v: 3, s: 41, players, grid: [[7]],
    input: { v: 1, epoch: 7, accepted: [0, 4], ack: [0, 4] },
    action: { v: 1, epoch: 7, ack: [0, 0] }
  }, { seatIndex: 1, defer: true }).status, "buffered");
  assert.equal(continuity.delivery.sendMovement(8), true);
  assert.equal(continuity.runtime.receiveSnapshot({
    v: 3, s: 42, players, round: 9,
    input: { v: 1, epoch: 7, accepted: [0, 5], ack: [0, 5] },
    action: { v: 1, epoch: 7, ack: [0, 0] }
  }, { seatIndex: 1, defer: true }).status, "buffered");
  assert.deepEqual(continuity.runtime.takeSnapshot(), {
    v: 3, s: 42, players, round: 9, grid: [[7]],
    input: { v: 1, epoch: 7, accepted: [0, 5], ack: [0, 5] },
    action: { v: 1, epoch: 7, ack: [0, 0] }
  });
  assert.equal(continuity.delivery.inputSnapshot().acknowledgedSequence, 5);
});

test("duplicate controls share one asynchronous runtime boot per input epoch", async () => {
  const { continuity } = createMemoryFixture();
  let releaseBoot;
  const barrier = new Promise((resolve) => { releaseBoot = resolve; });
  let mode = "intro";
  let boots = 0;
  const options = {
    message: { type: "resume", input: { epoch: 12 } },
    currentMode: () => mode,
    active: () => true,
    begin: async () => {
      boots += 1;
      await barrier;
      mode = "playing";
    },
    rollback: () => { mode = "intro"; }
  };
  const first = continuity.runtime.ensure(options);
  const duplicate = continuity.runtime.ensure(options);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(boots, 1);
  releaseBoot();
  assert.deepEqual(await Promise.all([first, duplicate]), [true, true]);

  mode = "matchover";
  await continuity.runtime.ensure({ ...options, message: { type: "rematch" }, begin: async () => {
    boots += 1;
    mode = "playing";
  } });
  await continuity.runtime.ensure({ ...options, message: { type: "rematch" } });
  assert.equal(boots, 2);
});

test("reset invalidates an in-flight runtime boot without exposing its state", async () => {
  const { continuity } = createMemoryFixture();
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  let rolledBack = 0;
  const boot = continuity.runtime.ensure({
    message: { type: "start", input: { epoch: 1 } },
    currentMode: () => "intro",
    active: () => true,
    begin: () => barrier,
    rollback: () => { rolledBack += 1; }
  });
  await new Promise((resolve) => setImmediate(resolve));
  continuity.reset();
  release();
  assert.equal(await boot, false);
  assert.equal(rolledBack, 1);
});

class FakeSocket {
  static OPEN = 1;

  constructor() {
    this.readyState = FakeSocket.OPEN;
    this.listeners = new Map();
    this.sent = [];
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  emit(type, data) {
    this.listeners.get(type)?.(data === undefined ? {} : { data: JSON.stringify(data) });
  }

  send(message) {
    this.sent.push(JSON.parse(message));
  }

  close() {
    this.readyState = 3;
  }
}

test("browser and in-memory socket adapters share the reconnect interface", async () => {
  const sockets = [];
  const fixture = createMemoryFixture();
  const continuity = continuityFactory.create({
    send: () => true,
    storage: fixture.storage,
    captureSession: () => null,
    openSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    scheduleTimeout: () => 1,
    cancelTimeout: () => undefined,
    wallNow: () => 123
  });
  const ignored = [];
  const first = continuity.connection.connect({
    url: "ws://test.invalid/game-ws",
    hello: { type: "hello", room: "ABC234" },
    handlers: { snapshot: (data) => ignored.push(data) }
  });
  const oldSocket = sockets[0];
  const controls = [];
  const snapshots = [];
  const second = continuity.connection.connect({
    url: "ws://test.invalid/game-ws",
    hello: { type: "hello", room: "ABC234", resumeToken: "ef".repeat(32) },
    seatIndex: 0,
    handlers: {
      connected() {},
      snapshot: (data) => snapshots.push(data),
      control: (message) => controls.push(message)
    }
  });
  await assert.rejects(first, /resume_cancelled/);
  oldSocket.emit("open");
  oldSocket.emit("message", { type: "snapshot", data: { s: 99 } });
  assert.deepEqual(ignored, []);

  const active = sockets[1];
  active.emit("open");
  active.emit("message", {
    type: "connected",
    role: "host",
    input: { v: 1, epoch: 1, accepted: [0, 0], ack: [0, 0] },
    action: { v: 1, epoch: 1, ack: [0, 0] }
  });
  await second;
  assert.equal(continuity.connection.isOpen(), true);
  assert.equal(active.sent[0].resumeToken, "ef".repeat(32));
  active.emit("message", { type: "snapshot", data: { s: 1 } });
  assert.deepEqual(snapshots, [{ s: 1 }]);
  active.emit("message", { type: "ping" });
  assert.deepEqual(active.sent.at(-1), { type: "pong", clientTime: 123 });

  let resumed = false;
  const resume = continuity.connection.connect({
    url: "ws://test.invalid/game-ws",
    hello: { type: "hello" },
    resume: true,
    resumePhase: "match",
    confirmed: true,
    handlers: { control: (message) => controls.push(message) }
  }).then(() => { resumed = true; });
  const resumedSocket = sockets[2];
  resumedSocket.emit("open");
  resumedSocket.emit("message", {
    type: "connected",
    role: "guest",
    resume: { v: 1, protected: true, resumed: true },
    input: { v: 1, epoch: 2, accepted: [0, 0], ack: [0, 0] },
    action: { v: 1, epoch: 2, ack: [0, 0] }
  });
  await Promise.resolve();
  assert.equal(resumed, false, "authenticated resume waits for its explicit control");
  resumedSocket.emit("message", { type: "resume", activeMatch: true });
  await resume;
  assert.equal(resumed, true);
  assert.equal(controls.at(-1).type, "resume");
});

test("online bridge consumes continuity without embedding its implementation", async () => {
  const [bridge, moduleSource] = await Promise.all([
    readFile(new URL("../public/online-duel.js", import.meta.url), "utf8"),
    readFile(continuityUrl, "utf8")
  ]);
  assert.match(bridge, /RIFTBOMB_MATCH_CONTINUITY/);
  assert.doesNotMatch(bridge, /function createReliableInputStream|function createReliableActionStream/);
  assert.match(moduleSource, /globalThis\.RIFTBOMB_MATCH_CONTINUITY = Object\.freeze/);
  assert.doesNotMatch(bridge, /console\.(?:log|warn|error)\([^\n]*resumeToken/);
  assert.doesNotMatch(bridge, /searchParams\.set\([^\n]*resumeToken/);
});
