import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";

function openClient(port, hello, terminalType = "connected") {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { "x-riftbomb-proxy": "test-proxy-secret" }
    });
    const client = { socket, messages: [] };
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error(`${terminalType} timed out`));
    }, 2000);
    socket.on("open", () => socket.send(JSON.stringify(hello)));
    socket.on("message", (data) => {
      const message = JSON.parse(data);
      client.messages.push(message);
      if (message.type !== terminalType) return;
      clearTimeout(timeout);
      resolve(client);
    });
    socket.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function waitForMessage(client, predicate, label, timeoutMs = 2000) {
  const existing = client.messages.find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.socket.off("message", inspect);
      reject(new Error(`${label} timed out`));
    }, timeoutMs);
    const inspect = (data) => {
      const message = JSON.parse(data);
      if (!predicate(message)) return;
      clearTimeout(timeout);
      client.socket.off("message", inspect);
      resolve(message);
    };
    client.socket.on("message", inspect);
  });
}

async function waitUntil(predicate, label, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(Boolean(predicate()), true, `${label} timed out`);
}

test("websocket resume revocation storage is capacity and sweep bounded", async (t) => {
  process.env.PORT = "0";
  process.env.GAME_SERVER_PROXY_SECRET = "test-proxy-secret";
  const {
    server,
    closeAuthoritativeServer,
    createBoundedRevokedResumeTokens,
    resumeSecuritySnapshot
  } = await import(`../src/server.mjs?test=bounded-revocations-${Date.now()}`);
  await new Promise((resolve) => server.listening ? resolve() : server.once("listening", resolve));
  t.after(() => closeAuthoritativeServer());

  const store = createBoundedRevokedResumeTokens({ capacity: 3, sweepLimit: 2 });
  const digests = [1, 2, 3, 4].map((value) => Buffer.alloc(32, value));
  store.revoke(digests[0], 100);
  store.revoke(digests[1], 1_000);
  store.revoke(digests[2], 50);
  store.revoke(digests[3], 1_000);
  assert.deepEqual(store.snapshot(), { size: 3, capacity: 3, sweepLimit: 2 });
  assert.equal(store.isRevoked(digests[0], 0), false, "oldest tombstone is evicted at capacity");
  assert.equal(store.isRevoked(digests[3], 0), true, "new revocations reject immediately");

  const swept = store.sweep(100);
  assert.deepEqual(swept, { inspected: 2, deleted: 1 });
  assert.equal(store.snapshot().size, 2);
  assert.ok(swept.inspected <= store.snapshot().sweepLimit);
  assert.throws(
    () => createBoundedRevokedResumeTokens({ capacity: 0, sweepLimit: 1 }),
    /invalid revoked resume token bounds/
  );

  const productionBounds = resumeSecuritySnapshot();
  assert.ok(productionBounds.capacity >= 256 && productionBounds.capacity <= 16_384);
  assert.equal(productionBounds.sweepLimit, 64);
  assert.ok(productionBounds.size <= productionBounds.capacity);
});

test("websocket rejects malformed payloads without losing valid traffic", async (t) => {
  process.env.PORT = "0";
  process.env.GAME_SERVER_PROXY_SECRET = "test-proxy-secret";
  const { server, closeAuthoritativeServer, rooms } = await import(`../src/server.mjs?test=payload-${Date.now()}`);
  await new Promise((resolve) => server.listening ? resolve() : server.once("listening", resolve));
  const port = server.address().port;
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
    headers: { "x-riftbomb-proxy": "test-proxy-secret" }
  });
  const messages = [];
  socket.on("message", (data) => messages.push(JSON.parse(data)));
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  t.after(() => {
    socket.terminate();
    closeAuthoritativeServer();
  });

  for (const payload of ["{", "null", "[]", "true", "7", '"text"', "{}", '{"type":7}']) {
    socket.send(payload);
  }
  const connected = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("valid hello timed out after invalid payloads")), 1000);
    const inspect = (data) => {
      const message = JSON.parse(data);
      if (message.type !== "connected") return;
      clearTimeout(timeout);
      socket.off("message", inspect);
      resolve(message);
    };
    socket.on("message", inspect);
  });
  socket.send(JSON.stringify({ type: "hello", room: "SAFE24", role: "host", preset: null }));
  assert.equal((await connected).room, "SAFE24");

  for (const payload of ["null", "[]", "false", '"input"', '{"type":null}']) socket.send(payload);
  const deepValue = "[".repeat(12_000) + "0" + "]".repeat(12_000);
  socket.send(`{"type":"input","mask":${deepValue}}`);
  socket.send(JSON.stringify({
    type: "lobby", hostChampion: "zed", guestChampion: "katarina",
    arena: "clearing", matchTarget: 3
  }));
  const deadline = Date.now() + 1000;
  while (rooms.get("SAFE24")?.preset.hostChampion !== "zed" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(rooms.get("SAFE24")?.preset.hostChampion, "zed");
  assert.deepEqual(rooms.get("SAFE24")?.inputs, [0, 0]);
  assert.equal(socket.readyState, WebSocket.OPEN);
  assert.ok(messages.some(({ type }) => type === "connected"));

  const health = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
});

test("websocket rejects deeply nested room values and accepts primitive quick-match presets", async (t) => {
  process.env.PORT = "0";
  process.env.GAME_SERVER_PROXY_SECRET = "test-proxy-secret";
  const { server, closeAuthoritativeServer } = await import(`../src/server.mjs?test=deep-payload-${Date.now()}`);
  await new Promise((resolve) => server.listening ? resolve() : server.once("listening", resolve));
  const port = server.address().port;
  const sockets = [];
  t.after(() => {
    for (const socket of sockets) socket.terminate();
    closeAuthoritativeServer();
  });

  const open = async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { "x-riftbomb-proxy": "test-proxy-secret" }
    });
    sockets.push(socket);
    await new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    return socket;
  };
  const waitForType = (socket, type) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${type} timed out`)), 1000);
    const inspect = (data) => {
      const message = JSON.parse(data);
      if (message.type !== type) return;
      clearTimeout(timeout);
      socket.off("message", inspect);
      resolve(message);
    };
    socket.on("message", inspect);
  });

  const deepValue = "[".repeat(12_000) + "0" + "]".repeat(12_000);
  const malformed = await open();
  const rejected = waitForType(malformed, "error");
  malformed.send(`{"type":"hello","room":${deepValue},"role":"host"}`);
  assert.equal((await rejected).error, "invalid_hello");

  const quick = await open();
  const queued = waitForType(quick, "quick-queued");
  quick.send(JSON.stringify({ type: "quick-match", preset: 7 }));
  assert.equal((await queued).position, 1);

  const oversized = await open();
  const oversizedClosed = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("oversized peer was not closed")), 1000);
    oversized.once("close", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
  oversized.send("x".repeat(40_000));
  assert.equal(await oversizedClosed, 1009);

  const survivor = await open();
  const connected = waitForType(survivor, "connected");
  survivor.send(JSON.stringify({ type: "hello", room: "STAY24", role: "host" }));
  assert.equal((await connected).room, "STAY24");

  const health = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
});

test("websocket room starts only after both players are ready", async (t) => {
  process.env.PORT = "0";
  process.env.GAME_SERVER_PROXY_SECRET = "test-proxy-secret";
  const { server, closeAuthoritativeServer, rooms } = await import(`../src/server.mjs?test=${Date.now()}`);
  await new Promise((resolve) => server.listening ? resolve() : server.once("listening", resolve));
  const port = server.address().port;
  const open = (hello) => new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { "x-riftbomb-proxy": "test-proxy-secret" }
    });
    const messages = [];
    socket.on("open", () => socket.send(JSON.stringify(hello)));
    socket.on("message", (data) => {
      const message = JSON.parse(data);
      messages.push(message);
      if (message.type === "connected") resolve({ socket, messages });
    });
    socket.on("error", reject);
  });
  const host = await open({
    type: "hello", room: "ABC234", role: "host", inputProtocol: 1,
    preset: { matchTarget: 10 }
  });
  const guest = await open({
    type: "hello", room: "ABC234", role: "guest", ready: true, inputProtocol: 1
  });
  const room = rooms.get("ABC234");
  let reconnectedGuest = null;
  assert.equal(host.messages.find(({ type }) => type === "connected")?.soundCursor, 0);
  assert.equal(guest.messages.find(({ type }) => type === "connected")?.soundCursor, 0);
  t.after(() => {
    host.socket.terminate();
    guest.socket.terminate();
    reconnectedGuest?.socket.terminate();
    closeAuthoritativeServer();
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("snapshot timeout")), 1000);
    const onSnapshot = (data) => {
      const message = JSON.parse(data);
      if (message.type === "snapshot") {
        clearTimeout(timeout);
        guest.socket.off("message", onSnapshot);
        assert.equal(message.data.v, 3);
        assert.equal(message.data.matchTarget, 10);
        assert.equal(message.data.sound.v, 1);
        assert.equal(message.data.sound.latest, 0);
        assert.deepEqual(message.data.sound.events, []);
        assert.deepEqual(message.data.input, {
          v: 1, epoch: 1, accepted: [0, 0], ack: [0, 0]
        });
        resolve();
      }
    };
    guest.socket.on("message", onSnapshot);
  });

  const waitForInputAck = (expected) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`input ACK ${expected} timed out`)), 1500);
    const inspect = (data) => {
      const message = JSON.parse(data);
      if (message.type !== "snapshot" || message.data.input?.ack?.[0] !== expected) return;
      clearTimeout(timeout);
      host.socket.off("message", inspect);
      resolve(message.data.input);
    };
    host.socket.on("message", inspect);
  });
  const epoch = room.inputEpoch;
  host.socket.send(JSON.stringify({
    type: "input", mask: 0, inputEpoch: epoch, inputSeq: 2
  }));
  const firstAck = waitForInputAck(1);
  host.socket.send(JSON.stringify({
    type: "input", mask: 8, inputEpoch: epoch, inputSeq: 1
  }));
  assert.deepEqual(await firstAck, {
    v: 1, epoch, accepted: [1, 0], ack: [1, 0]
  });
  assert.equal(room.inputs[0], 8);

  const releaseAck = waitForInputAck(2);
  host.socket.send(JSON.stringify({
    type: "input", mask: 4, inputEpoch: epoch, inputSeq: 1
  }));
  host.socket.send(JSON.stringify({
    type: "input", mask: 0, inputEpoch: epoch, inputSeq: 2
  }));
  assert.deepEqual(await releaseAck, {
    v: 1, epoch, accepted: [2, 0], ack: [2, 0]
  });
  assert.equal(room.inputs[0], 0, "stale conflicting input must not revive movement");

  const waitForSound = (client) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("sound snapshot timeout")), 1500);
    const onSound = (data) => {
      const message = JSON.parse(data);
      const event = message.type === "snapshot"
        ? message.data.sound?.events?.find(({ cue }) => cue === "bomb")
        : null;
      if (!event) return;
      clearTimeout(timeout);
      client.socket.off("message", onSound);
      resolve({ message, event });
    };
    client.socket.on("message", onSound);
  });
  const hostSound = waitForSound(host);
  const guestSound = waitForSound(guest);
  host.socket.send(JSON.stringify({ type: "action", kind: "bomb" }));
  const [hostAudio, guestAudio] = await Promise.all([hostSound, guestSound]);
  assert.deepEqual(hostAudio.event, guestAudio.event);
  assert.equal(hostAudio.event.id, 1);
  assert.equal("pan" in hostAudio.event, false);
  assert.equal("sourceId" in hostAudio.event, false);

  guest.socket.terminate();
  const disconnectedBefore = Date.now() + 1000;
  while (room.players[1]?.socket && Date.now() < disconnectedBefore) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  reconnectedGuest = await open({ type: "hello", room: "ABC234", role: "guest", ready: true });
  assert.equal(
    reconnectedGuest.messages.find(({ type }) => type === "connected")?.soundCursor,
    1
  );
  assert.deepEqual(
    reconnectedGuest.messages.find(({ type }) => type === "connected")?.input,
    { v: 1, epoch, accepted: [2, 0], ack: [2, 0] }
  );
  const legacyResumeStart = await waitForMessage(
    reconnectedGuest,
    ({ type }) => type === "start",
    "legacy resume start"
  );
  assert.deepEqual(legacyResumeStart.input, {
    v: 1, epoch, accepted: [2, 0], ack: [2, 0]
  });
  const resumedGrid = await new Promise((resolve, reject) => {
    const existing = reconnectedGuest.messages.find((message) =>
      message.type === "snapshot" && Array.isArray(message.data?.grid)
    );
    if (existing) return resolve(existing.data.grid);
    const timeout = setTimeout(() => reject(new Error("reconnect full grid timed out")), 1000);
    const inspect = (data) => {
      const message = JSON.parse(data);
      if (message.type !== "snapshot" || !Array.isArray(message.data?.grid)) return;
      clearTimeout(timeout);
      reconnectedGuest.socket.off("message", inspect);
      resolve(message.data.grid);
    };
    reconnectedGuest.socket.on("message", inspect);
  });
  assert.deepEqual(resumedGrid, room.game.grid);

  const healthResponse = await fetch(`http://127.0.0.1:${port}/health`);
  const health = await healthResponse.json();
  assert.equal(healthResponse.status, 200);
  assert.equal(health.rooms, 1);
  assert.equal(health.performance.activeMatches, 1);
  assert.equal(health.performance.webSocketClients, 2);
  assert.equal(health.performance.tickClockActive, true);
  assert.equal(health.performance.snapshotClockActive, true);
  assert.ok(health.performance.tickCycles >= 1);
  assert.ok(health.performance.snapshotCycles >= 1);
  assert.ok(health.performance.snapshotsProduced >= 1);
  assert.ok(health.performance.eventLoopUtilization >= 0);
  assert.ok(health.performance.eventLoopUtilization <= 1);
  assert.ok(!JSON.stringify(health).includes("ABC234"));
  assert.ok(!JSON.stringify(health).includes("test-proxy-secret"));
});

test("host rematch rebuilds the authoritative duel", async (t) => {
  process.env.PORT = "0";
  process.env.GAME_SERVER_PROXY_SECRET = "test-proxy-secret";
  const { server, closeAuthoritativeServer, rooms } = await import(`../src/server.mjs?test=rematch-${Date.now()}`);
  await new Promise((resolve) => server.listening ? resolve() : server.once("listening", resolve));
  const port = server.address().port;
  const open = (hello) => new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { "x-riftbomb-proxy": "test-proxy-secret" }
    });
    const messages = [];
    socket.on("open", () => socket.send(JSON.stringify(hello)));
    socket.on("message", (data) => {
      const message = JSON.parse(data);
      messages.push(message);
      if (message.type === "connected") resolve({ socket, messages });
    });
    socket.on("error", reject);
  });
  const waitFor = (client, type, ms = 2000) => new Promise((resolve, reject) => {
    const existing = client.messages.find((message) => message.type === type);
    if (existing) return resolve(existing);
    const timeout = setTimeout(() => reject(new Error(`${type} timeout`)), ms);
    client.socket.on("message", (data) => {
      const message = JSON.parse(data);
      if (message.type === type) {
        clearTimeout(timeout);
        resolve(message);
      }
    });
  });

  const host = await open({
    type: "hello", room: "REMCH2", role: "host",
    inputProtocol: 1,
    preset: { hostChampion: "zed", guestChampion: "katarina", matchTarget: 3 }
  });
  const guest = await open({
    type: "hello", room: "REMCH2", role: "guest", ready: true, inputProtocol: 1
  });
  t.after(() => {
    host.socket.terminate();
    guest.socket.terminate();
    closeAuthoritativeServer();
  });

  const start = await waitFor(guest, "start");
  assert.deepEqual(start.input, { v: 1, epoch: 1, accepted: [0, 0], ack: [0, 0] });
  const room = rooms.get("REMCH2");
  assert.ok(room?.game);
  const firstGame = room.game;
  const firstSnapshot = await waitFor(guest, "snapshot");
  const firstSnapshotSequence = firstSnapshot.data.s;
  host.socket.send(JSON.stringify({
    type: "input", mask: 8, inputEpoch: 1, inputSeq: 1
  }));
  const inputDeadline = Date.now() + 1000;
  while (room.inputApplied[0] !== 1 && Date.now() < inputDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.deepEqual(room.inputApplied, [1, 0]);
  assert.equal(firstGame.placeBomb(firstGame.players[0]), true);
  assert.equal(firstGame.authoritativeSound.latest, 1);
  firstGame.mode = "matchover";

  const rematchWait = waitFor(guest, "rematch");
  host.socket.send(JSON.stringify({
    type: "rematch",
    inputEpoch: room.inputEpoch,
    hostChampion: "zed",
    guestChampion: "katarina",
    arena: "lattice",
    matchTarget: 3
  }));

  const rematch = await rematchWait;
  assert.equal(rematch.type, "rematch");
  assert.equal(rematch.hostChampion, "zed");
  assert.deepEqual(rematch.input, { v: 1, epoch: 2, accepted: [0, 0], ack: [0, 0] });
  assert.notEqual(room.game, firstGame);
  assert.equal(room.game.mode, "playing");
  assert.equal(room.game.matchTarget, 3);
  assert.ok(room.sequence >= firstSnapshotSequence);
  host.socket.send(JSON.stringify({
    type: "input", mask: 8, inputEpoch: 1, inputSeq: 2
  }));
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(room.inputs, [0, 0], "the previous match epoch must stay inert");
  assert.equal(room.game.authoritativeSound.latest, 1);
  assert.equal(room.game.placeBomb(room.game.players[0]), true);
  assert.equal(room.game.authoritativeSound.latest, 2);
});

test("quick match pairs two queued players and starts automatically", async (t) => {
  process.env.PORT = "0";
  process.env.GAME_SERVER_PROXY_SECRET = "test-proxy-secret";
  const { server, closeAuthoritativeServer, rooms } = await import(`../src/server.mjs?test=quick-match-${Date.now()}`);
  await new Promise((resolve) => server.listening ? resolve() : server.once("listening", resolve));
  const port = server.address().port;

  const openQuick = (preset, initialType) => new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { "x-riftbomb-proxy": "test-proxy-secret" }
    });
    const client = { socket, messages: [] };
    socket.on("open", () => socket.send(JSON.stringify({ type: "quick-match", preset })));
    socket.on("message", (data) => {
      const message = JSON.parse(data);
      client.messages.push(message);
      if (message.type === initialType) resolve(client);
    });
    socket.on("error", reject);
  });
  const waitFor = (client, type, ms = 2500) => new Promise((resolve, reject) => {
    const existing = client.messages.find((message) => message.type === type);
    if (existing) return resolve(existing);
    const timeout = setTimeout(() => reject(new Error(`${type} timeout`)), ms);
    client.socket.on("message", (data) => {
      const message = JSON.parse(data);
      if (message.type === type) {
        clearTimeout(timeout);
        resolve(message);
      }
    });
  });

  const first = await openQuick({ hostChampion: "renekton", arena: "pit" }, "quick-queued");
  const second = await openQuick({ hostChampion: "vladimir", arena: "clearing" }, "connected");
  t.after(() => {
    first.socket.terminate();
    second.socket.terminate();
    closeAuthoritativeServer();
  });

  const [firstConnected, firstStart, secondStart] = await Promise.all([
    waitFor(first, "connected"),
    waitFor(first, "start"),
    waitFor(second, "start")
  ]);
  const secondConnected = second.messages.find((message) => message.type === "connected");
  assert.equal(firstConnected.role, "host");
  assert.equal(secondConnected.role, "guest");
  assert.equal(firstConnected.room, secondConnected.room);
  assert.match(firstConnected.room, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(firstStart.hostChampion, "renekton");
  assert.equal(firstStart.guestChampion, "vladimir");
  assert.equal(firstStart.arena, "pit");
  assert.equal(firstStart.matchTarget, 3);
  assert.deepEqual(secondStart, firstStart);
  assert.ok(rooms.get(firstConnected.room)?.game);
});

test("websocket quick-match bearer recovers its assigned room and role when connected was lost", async (t) => {
  process.env.PORT = "0";
  process.env.GAME_SERVER_PROXY_SECRET = "test-proxy-secret";
  const { server, closeAuthoritativeServer, rooms } = await import(
    `../src/server.mjs?test=quick-resume-${Date.now()}`
  );
  await new Promise((resolve) => server.listening ? resolve() : server.once("listening", resolve));
  const port = server.address().port;
  const clients = [];
  const track = (client) => {
    clients.push(client);
    return client;
  };
  t.after(() => {
    for (const client of clients) client.socket.terminate();
    closeAuthoritativeServer();
  });

  const pendingToken = "1".repeat(64);
  const rivalToken = "2".repeat(64);
  const originalPending = track(await openClient(port, {
    type: "quick-match", inputProtocol: 1,
    resumeProtocol: 1, resumeToken: pendingToken,
    preset: { hostChampion: "renekton", arena: "pit" }
  }, "quick-queued"));
  const originalPendingClosed = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("superseded queue socket did not close")), 2000);
    originalPending.socket.once("close", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
  const pending = track(await openClient(port, {
    type: "quick-match", inputProtocol: 1,
    resumeProtocol: 1, resumeToken: pendingToken,
    preset: { hostChampion: "renekton", arena: "pit" }
  }, "quick-queued"));
  assert.equal(await originalPendingClosed, 4001);
  const queuedHealth = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert.equal(queuedHealth.quickMatchWaiting, 1, "same bearer must preserve one queue entry");
  const rival = track(await openClient(port, {
    type: "quick-match", inputProtocol: 1,
    resumeProtocol: 1, resumeToken: rivalToken,
    preset: { hostChampion: "vladimir", arena: "clearing" }
  }));
  const assigned = await waitForMessage(pending, ({ type }) => type === "connected", "quick assignment");
  assert.equal(assigned.role, "host");
  assert.equal(assigned.quickMatch, true);
  assert.equal(rival.messages.find(({ type }) => type === "connected")?.room, assigned.room);
  const room = rooms.get(assigned.room);
  assert.equal(room.players[0].quickMatch, true);
  assert.equal(room.players[1].quickMatch, true);
  assert.notDeepEqual(room.players[0].resumeTokenDigest, room.players[1].resumeTokenDigest);
  assert.equal(
    originalPending.messages.some(({ type }) => type === "connected"),
    false,
    "the superseded queued socket must stay inert"
  );
  await waitForMessage(pending, ({ type }) => type === "start", "quick match start before resume");
  assert.ok(room.game);

  const oldClosed = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("recovered quick socket did not replace old one")), 2000);
    pending.socket.once("close", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
  const recovered = track(await openClient(port, {
    type: "quick-match", inputProtocol: 1,
    resumeProtocol: 1, resumeToken: pendingToken,
    preset: { hostChampion: "katarina", arena: "lattice" }
  }));
  const recoveredConnected = recovered.messages.find(({ type }) => type === "connected");
  assert.equal(recoveredConnected.room, assigned.room);
  assert.equal(recoveredConnected.role, "host");
  assert.equal(recoveredConnected.quickMatch, true);
  assert.deepEqual(recoveredConnected.resume, { v: 1, protected: true, resumed: true });
  assert.equal(await oldClosed, 4001);
  const resume = await waitForMessage(recovered, ({ type }) => type === "resume", "quick resume control");
  assert.equal(resume.activeMatch, true);
  assert.equal(room.players[0].socket.readyState, WebSocket.OPEN);

  const strangerToken = "3".repeat(64);
  const stranger = track(await openClient(port, {
    type: "quick-match", inputProtocol: 1,
    resumeProtocol: 1, resumeToken: strangerToken,
    preset: { hostChampion: "zed", arena: "lattice" }
  }, "quick-queued"));
  assert.deepEqual(stranger.messages, [{ type: "quick-queued", position: 1 }]);
  assert.equal(JSON.stringify(stranger.messages).includes(assigned.room), false);
  const traffic = JSON.stringify([
    ...originalPending.messages,
    ...pending.messages,
    ...rival.messages,
    ...recovered.messages,
    ...stranger.messages
  ]);
  assert.equal(traffic.includes(pendingToken), false);
  assert.equal(traffic.includes(rivalToken), false);
  assert.equal(traffic.includes(strangerToken), false);
});

test("websocket authenticated F5 resume atomically replaces an open socket and preserves input cursors", async (t) => {
  process.env.PORT = "0";
  process.env.GAME_SERVER_PROXY_SECRET = "test-proxy-secret";
  const { server, closeAuthoritativeServer, rooms } = await import(
    `../src/server.mjs?test=authenticated-resume-${Date.now()}`
  );
  await new Promise((resolve) => server.listening ? resolve() : server.once("listening", resolve));
  const port = server.address().port;
  const clients = [];
  const track = (client) => {
    clients.push(client);
    return client;
  };
  t.after(() => {
    for (const client of clients) client.socket.terminate();
    closeAuthoritativeServer();
  });

  const hostToken = "a".repeat(64);
  const guestToken = "b".repeat(64);
  const host = track(await openClient(port, {
    type: "hello", room: "AUTH24", role: "host", inputProtocol: 1,
    resumeProtocol: 1, resumeToken: hostToken
  }));
  const guest = track(await openClient(port, {
    type: "hello", room: "AUTH24", role: "guest", ready: true, inputProtocol: 1,
    resumeProtocol: 1, resumeToken: guestToken
  }));
  assert.deepEqual(
    host.messages.find(({ type }) => type === "connected")?.resume,
    { v: 1, protected: true, resumed: false }
  );
  assert.deepEqual(
    guest.messages.find(({ type }) => type === "connected")?.resume,
    { v: 1, protected: true, resumed: false }
  );

  await waitForMessage(guest, ({ type }) => type === "start", "initial start");
  const room = rooms.get("AUTH24");
  await waitForMessage(
    guest,
    (message) => message.type === "snapshot" && Array.isArray(message.data?.grid),
    "initial full grid"
  );
  const epoch = room.inputEpoch;
  guest.socket.send(JSON.stringify({
    type: "input", mask: 8, inputEpoch: epoch, inputSeq: 1
  }));
  await waitUntil(() => room.inputApplied[1] === 1, "guest input ACK");
  const gameBefore = room.game;
  const cursorsBefore = {
    epoch: room.inputEpoch,
    accepted: room.inputAccepted.slice(),
    ack: room.inputApplied.slice()
  };
  const oldGuestServerSocket = room.players[1].socket;
  const hostMessageOffset = host.messages.length;
  const oldGuestClosed = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("superseded socket did not close")), 2000);
    guest.socket.once("close", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });

  const replacement = track(await openClient(port, {
    type: "hello", room: "AUTH24", role: "guest", ready: true,
    resumeProtocol: 1, resumeToken: guestToken
  }));
  const replacementConnected = replacement.messages.find(({ type }) => type === "connected");
  assert.deepEqual(replacementConnected.resume, { v: 1, protected: true, resumed: true });
  assert.deepEqual(replacementConnected.input, {
    v: 1,
    epoch: cursorsBefore.epoch,
    accepted: cursorsBefore.accepted,
    ack: cursorsBefore.ack
  });
  assert.equal(await oldGuestClosed, 4001);
  assert.notEqual(room.players[1].socket, oldGuestServerSocket);
  assert.equal(room.players[1].socket.readyState, WebSocket.OPEN);
  assert.equal(room.game, gameBefore);
  assert.equal(room.inputEpoch, cursorsBefore.epoch);
  assert.deepEqual(room.inputAccepted, cursorsBefore.accepted);
  assert.deepEqual(room.inputApplied, cursorsBefore.ack);
  assert.equal(room.inputReliable[1], true, "resume must never downgrade reliable input");
  assert.equal(room.inputs[1], 0, "takeover must neutralize the superseded held direction");

  const resume = await waitForMessage(replacement, ({ type }) => type === "resume", "resume control");
  assert.equal(resume.activeMatch, true);
  assert.equal(resume.hostConnected, true);
  assert.deepEqual(resume.input, replacementConnected.input);
  const resumedGrid = await waitForMessage(
    replacement,
    (message) => message.type === "snapshot" && Array.isArray(message.data?.grid),
    "resumed full grid"
  );
  assert.deepEqual(resumedGrid.data.grid, room.game.grid);

  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(
    host.messages.slice(hostMessageOffset).some((message) =>
      message.type === "presence" && message.playerId === 2 && message.connected === false
    ),
    false,
    "the superseded socket close must not announce a false disconnect"
  );
  replacement.socket.send(JSON.stringify({
    type: "input", mask: 4, inputEpoch: epoch, inputSeq: 2
  }));
  await waitUntil(() => room.inputApplied[1] === 2, "post-resume input ACK");
  assert.equal(room.inputs[1], 4);

  const serializedTraffic = JSON.stringify([
    ...host.messages,
    ...guest.messages,
    ...replacement.messages
  ]);
  assert.equal(serializedTraffic.includes(hostToken), false);
  assert.equal(serializedTraffic.includes(guestToken), false);
});

test("websocket resume authentication rejects impostors without downgrading a protected seat", async (t) => {
  process.env.PORT = "0";
  process.env.GAME_SERVER_PROXY_SECRET = "test-proxy-secret";
  const { server, closeAuthoritativeServer, rooms } = await import(
    `../src/server.mjs?test=resume-denial-${Date.now()}`
  );
  await new Promise((resolve) => server.listening ? resolve() : server.once("listening", resolve));
  const port = server.address().port;
  const clients = [];
  const track = (client) => {
    clients.push(client);
    return client;
  };
  t.after(() => {
    for (const client of clients) client.socket.terminate();
    closeAuthoritativeServer();
  });

  const token = "c".repeat(64);
  const owner = track(await openClient(port, {
    type: "hello", room: "LCKR24", role: "host", inputProtocol: 1,
    resumeProtocol: 1, resumeToken: token
  }));
  const room = rooms.get("LCKR24");
  const originalPlayer = room.players[0];
  const originalServerSocket = originalPlayer.socket;
  const originalGeneration = originalPlayer.connectionGeneration;

  const wrong = track(await openClient(port, {
    type: "hello", room: "LCKR24", role: "host",
    resumeProtocol: 1, resumeToken: "d".repeat(64)
  }, "error"));
  assert.equal(wrong.messages.at(-1).error, "resume_denied");
  const missing = track(await openClient(port, {
    type: "hello", room: "LCKR24", role: "host"
  }, "error"));
  assert.equal(missing.messages.at(-1).error, "resume_denied");
  const malformed = track(await openClient(port, {
    type: "hello", room: "BADR24", role: "host",
    resumeProtocol: 1, resumeToken: "short"
  }, "error"));
  assert.equal(malformed.messages.at(-1).error, "invalid_resume");
  assert.equal(rooms.has("BADR24"), false, "invalid resume data must not create a room");
  const missingRoom = track(await openClient(port, {
    type: "hello", room: "MSSS24", role: "host", resumeOnly: true,
    resumeProtocol: 1, resumeToken: "f".repeat(64)
  }, "error"));
  assert.equal(missingRoom.messages.at(-1).error, "room_not_found");
  assert.equal(rooms.has("MSSS24"), false, "resume-only must not recreate an expired match room");
  const missingSeat = track(await openClient(port, {
    type: "hello", room: "LCKR24", role: "guest", resumeOnly: true,
    resumeProtocol: 1, resumeToken: "f".repeat(64)
  }, "error"));
  assert.equal(missingSeat.messages.at(-1).error, "resume_denied");
  assert.equal(room.players[1], null, "resume-only denial must happen before claiming a vacant seat");
  assert.equal(room.players[0], originalPlayer);
  assert.equal(room.players[0].socket, originalServerSocket);
  assert.equal(room.players[0].connectionGeneration, originalGeneration);
  assert.equal(room.players[0].inputProtocol, 1);
  assert.equal(room.players[0].resumeProtocol, 1);

  owner.socket.terminate();
  await waitUntil(() => room.players[0]?.socket === null, "protected owner disconnect");
  const disconnectedGeneration = room.players[0].connectionGeneration;
  const downgrade = track(await openClient(port, {
    type: "hello", room: "LCKR24", role: "host"
  }, "error"));
  assert.equal(downgrade.messages.at(-1).error, "resume_denied");
  assert.equal(room.players[0].socket, null);
  assert.equal(room.players[0].connectionGeneration, disconnectedGeneration);

  const resumed = track(await openClient(port, {
    type: "hello", room: "LCKR24", role: "host", inputProtocol: 1,
    resumeProtocol: 1, resumeToken: token
  }));
  assert.equal(resumed.messages.find(({ type }) => type === "connected")?.resume.resumed, true);
  assert.equal(room.players[0].socket.readyState, WebSocket.OPEN);
  assert.equal(room.players[0].connectionGeneration, disconnectedGeneration + 1);
});

test("websocket legacy seats keep rolling-deploy fallback only after their socket closes", async (t) => {
  process.env.PORT = "0";
  process.env.GAME_SERVER_PROXY_SECRET = "test-proxy-secret";
  const { server, closeAuthoritativeServer, rooms } = await import(
    `../src/server.mjs?test=legacy-resume-${Date.now()}`
  );
  await new Promise((resolve) => server.listening ? resolve() : server.once("listening", resolve));
  const port = server.address().port;
  const clients = [];
  const track = (client) => {
    clients.push(client);
    return client;
  };
  t.after(() => {
    for (const client of clients) client.socket.terminate();
    closeAuthoritativeServer();
  });

  const legacy = track(await openClient(port, {
    type: "hello", room: "RLLR24", role: "host", inputProtocol: 1
  }));
  assert.deepEqual(
    legacy.messages.find(({ type }) => type === "connected")?.resume,
    { v: 1, protected: false, resumed: false }
  );
  const occupied = track(await openClient(port, {
    type: "hello", room: "RLLR24", role: "host"
  }, "error"));
  assert.equal(occupied.messages.at(-1).error, "role_taken");

  const room = rooms.get("RLLR24");
  const closingServerSocket = room.players[0].socket;
  closingServerSocket._socket.pause();
  closingServerSocket.close(1000, "test_closing_race");
  assert.equal(closingServerSocket.readyState, WebSocket.CLOSING);
  const closingContender = track(await openClient(port, {
    type: "hello", room: "RLLR24", role: "host"
  }, "error"));
  assert.equal(closingContender.messages.at(-1).error, "role_taken",
    "a legacy seat remains owned until the old close callback runs");
  closingServerSocket._socket.resume();
  legacy.socket.terminate();
  await waitUntil(() => room.players[0]?.socket === null, "legacy disconnect");
  const legacyResume = track(await openClient(port, {
    type: "hello", room: "RLLR24", role: "host"
  }));
  assert.deepEqual(
    legacyResume.messages.find(({ type }) => type === "connected")?.resume,
    { v: 1, protected: false, resumed: true }
  );

  legacyResume.socket.terminate();
  await waitUntil(() => room.players[0]?.socket === null, "legacy upgrade disconnect");
  const token = "e".repeat(64);
  const upgraded = track(await openClient(port, {
    type: "hello", room: "RLLR24", role: "host", inputProtocol: 1,
    resumeProtocol: 1, resumeToken: token
  }));
  assert.equal(upgraded.messages.find(({ type }) => type === "connected")?.resume.protected, true);
  assert.equal(room.players[0].resumeProtocol, 1);
  upgraded.socket.terminate();
  await waitUntil(() => room.players[0]?.socket === null, "protected upgrade disconnect");

  const forbiddenDowngrade = track(await openClient(port, {
    type: "hello", room: "RLLR24", role: "host"
  }, "error"));
  assert.equal(forbiddenDowngrade.messages.at(-1).error, "resume_denied");
  const authenticated = track(await openClient(port, {
    type: "hello", room: "RLLR24", role: "host",
    resumeProtocol: 1, resumeToken: token
  }));
  assert.equal(authenticated.messages.find(({ type }) => type === "connected")?.resume.resumed, true);
});

test("websocket authenticated leave revokes a seat and host leave closes the room", async (t) => {
  process.env.PORT = "0";
  process.env.GAME_SERVER_PROXY_SECRET = "test-proxy-secret";
  const { server, closeAuthoritativeServer, rooms } = await import(
    `../src/server.mjs?test=authenticated-leave-${Date.now()}`
  );
  await new Promise((resolve) => server.listening ? resolve() : server.once("listening", resolve));
  const port = server.address().port;
  const clients = [];
  const track = (client) => {
    clients.push(client);
    return client;
  };
  t.after(() => {
    for (const client of clients) client.socket.terminate();
    closeAuthoritativeServer();
  });

  const hostToken = "cd".repeat(32);
  const guestToken = "ab".repeat(32);
  const replacementToken = "ef".repeat(32);
  const host = track(await openClient(port, {
    type: "hello", room: "LEAV24", role: "host", inputProtocol: 1,
    resumeProtocol: 1, resumeToken: hostToken
  }));
  const guest = track(await openClient(port, {
    type: "hello", room: "LEAV24", role: "guest", ready: true, inputProtocol: 1,
    resumeProtocol: 1, resumeToken: guestToken
  }));
  await waitForMessage(guest, ({ type }) => type === "start", "initial leave-test start");
  const room = rooms.get("LEAV24");
  const epoch = room.inputEpoch;
  guest.socket.send(JSON.stringify({
    type: "input", mask: 8, inputEpoch: epoch, inputSeq: 1
  }));
  await waitUntil(() => room.inputApplied[1] === 1, "pre-leave guest ACK");

  guest.socket.send(JSON.stringify({ type: "leave" }));
  await waitUntil(() => room.players[1] === null, "guest seat revocation");
  assert.equal(room.inputAccepted[1], 0);
  assert.equal(room.inputApplied[1], 0);
  assert.equal(room.inputReliable[1], false);
  const presence = await waitForMessage(
    host,
    (message) => message.type === "presence" && message.playerId === 2,
    "guest leave presence"
  );
  assert.equal(presence.connected, false);

  const revoked = track(await openClient(port, {
    type: "hello", room: "LEAV24", role: "guest", resumeOnly: true,
    resumeProtocol: 1, resumeToken: guestToken
  }, "error"));
  assert.equal(revoked.messages.at(-1).error, "resume_expired");
  const revokedFreshClaim = track(await openClient(port, {
    type: "hello", room: "LEAV24", role: "guest",
    resumeProtocol: 1, resumeToken: guestToken
  }, "error"));
  assert.equal(revokedFreshClaim.messages.at(-1).error, "resume_expired");
  for (const caseVariant of [guestToken.toUpperCase(), `aB${guestToken.slice(2)}`]) {
    const invalidCase = track(await openClient(port, {
      type: "hello", room: "LEAV24", role: "guest",
      resumeProtocol: 1, resumeToken: caseVariant
    }, "error"));
    assert.equal(invalidCase.messages.at(-1).error, "invalid_resume",
      "uppercase and mixed-case bearer variants must not bypass revocation");
  }

  const replacement = track(await openClient(port, {
    type: "hello", room: "LEAV24", role: "guest", ready: true, inputProtocol: 1,
    resumeProtocol: 1, resumeToken: replacementToken
  }));
  assert.deepEqual(
    replacement.messages.find(({ type }) => type === "connected")?.resume,
    { v: 1, protected: true, resumed: false }
  );
  assert.deepEqual(
    replacement.messages.find(({ type }) => type === "connected")?.input,
    { v: 1, epoch, accepted: [0, 0], ack: [0, 0] }
  );
  await waitForMessage(replacement, ({ type }) => type === "start", "replacement active start");
  const replacementServerSocket = room.players[1].socket;
  replacement.socket.send(JSON.stringify({
    type: "input", mask: 4, inputEpoch: epoch, inputSeq: 1
  }));
  await waitUntil(() => room.inputApplied[1] === 1, "replacement input ACK");
  assert.equal(room.inputs[1], 4);
  guest.socket.send(JSON.stringify({ type: "input", mask: 8 }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(room.players[1].socket, replacementServerSocket,
    "released socket messages must remain inert");
  assert.equal(room.inputs[1], 4);

  const replacementClosed = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("room peer did not close")), 2000);
    replacement.socket.once("close", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
  host.socket.send(JSON.stringify({ type: "leave" }));
  await waitUntil(() => !rooms.has("LEAV24"), "host room removal");
  assert.equal(await replacementClosed, 4002);
});

for (const expiredRole of ["host", "guest"]) {
  test(`websocket authenticated ${expiredRole} seat expires after reconnect grace`, async (t) => {
    process.env.PORT = "0";
    process.env.GAME_SERVER_PROXY_SECRET = "test-proxy-secret";
    const { server, closeAuthoritativeServer, rooms, runMaintenance } = await import(
      `../src/server.mjs?test=resume-expiry-${expiredRole}-${Date.now()}`
    );
    await new Promise((resolve) => server.listening ? resolve() : server.once("listening", resolve));
    const port = server.address().port;
    const clients = [];
    const track = (client) => {
      clients.push(client);
      return client;
    };
    t.after(() => {
      for (const client of clients) client.socket.terminate();
      closeAuthoritativeServer();
    });

    const code = expiredRole === "host" ? "EXPH24" : "EXPG24";
    const hostToken = "6".repeat(64);
    const guestToken = "7".repeat(64);
    const freshToken = "8".repeat(64);
    const host = track(await openClient(port, {
      type: "hello", room: code, role: "host", inputProtocol: 1,
      resumeProtocol: 1, resumeToken: hostToken
    }));
    const guest = track(await openClient(port, {
      type: "hello", room: code, role: "guest", ready: true, inputProtocol: 1,
      resumeProtocol: 1, resumeToken: guestToken
    }));
    await waitForMessage(guest, ({ type }) => type === "start", "expiry match start");
    const room = rooms.get(code);
    const expiredIndex = expiredRole === "host" ? 0 : 1;
    const target = expiredIndex === 0 ? host : guest;
    const survivor = expiredIndex === 0 ? guest : host;
    const expiredToken = expiredIndex === 0 ? hostToken : guestToken;
    const gameBefore = room.game;
    let survivorClosed = null;
    if (expiredRole === "host") {
      survivorClosed = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("host expiry did not close peer")), 2000);
        survivor.socket.once("close", (codeValue) => {
          clearTimeout(timeout);
          resolve(codeValue);
        });
      });
    }

    target.socket.terminate();
    await waitUntil(() => room.players[expiredIndex]?.socket === null, `${expiredRole} disconnect`);
    const disconnectedAt = Date.now();
    room.players[expiredIndex].disconnectedAt = disconnectedAt;
    runMaintenance(disconnectedAt + 19_999);
    assert.equal(rooms.get(code), room, "the seat must survive until the exact grace boundary");
    assert.notEqual(room.players[expiredIndex], null);
    runMaintenance(disconnectedAt + 20_000);

    if (expiredRole === "host") {
      assert.equal(rooms.has(code), false);
      assert.equal(room.game, null);
      assert.equal(await survivorClosed, 4002);
      assert.equal(
        survivor.messages.some(({ type }) => type === "room-closed"),
        true,
        "host expiry must notify the peer with normal room-close semantics"
      );
    } else {
      assert.equal(rooms.get(code), room);
      assert.equal(room.game, gameBefore);
      assert.equal(room.players[1], null);
      assert.equal(room.inputAccepted[1], 0);
      assert.equal(room.inputApplied[1], 0);
      assert.equal(room.inputReliable[1], false);
      assert.equal(survivor.socket.readyState, WebSocket.OPEN);
    }

    const stale = track(await openClient(port, {
      type: "hello", room: code, role: expiredRole, resumeOnly: true,
      resumeProtocol: 1, resumeToken: expiredToken
    }, "error"));
    assert.equal(stale.messages.at(-1).error, "resume_expired");
    const staleQuick = track(await openClient(port, {
      type: "quick-match", inputProtocol: 1,
      resumeProtocol: 1, resumeToken: expiredToken,
      preset: { hostChampion: "zed", arena: "lattice" }
    }, "error"));
    assert.equal(staleQuick.messages.at(-1).error, "resume_expired");
    const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    assert.equal(health.quickMatchWaiting, 0, "an expired bearer must not re-enter matchmaking");

    const replacement = track(await openClient(port, {
      type: "hello", room: code, role: expiredRole, ready: true, inputProtocol: 1,
      resumeProtocol: 1, resumeToken: freshToken
    }));
    const replacementConnected = replacement.messages.find(({ type }) => type === "connected");
    assert.deepEqual(replacementConnected.resume, { v: 1, protected: true, resumed: false });
    if (expiredRole === "host") {
      assert.notEqual(rooms.get(code), room, "a fresh bearer creates a new lobby, not the expired match");
    } else {
      assert.equal(rooms.get(code), room, "a fresh guest bearer may occupy the released seat");
      await waitForMessage(replacement, ({ type }) => type === "start", "fresh guest active start");
    }
  });
}

test("websocket room TTL never stops a room while a socket remains connected", async (t) => {
  process.env.PORT = "0";
  process.env.GAME_SERVER_PROXY_SECRET = "test-proxy-secret";
  const { server, closeAuthoritativeServer, rooms, runMaintenance } = await import(
    `../src/server.mjs?test=connected-room-ttl-${Date.now()}`
  );
  await new Promise((resolve) => server.listening ? resolve() : server.once("listening", resolve));
  const port = server.address().port;
  const host = await openClient(port, {
    type: "hello", room: "TTLS24", role: "host"
  });
  t.after(() => {
    host.socket.terminate();
    closeAuthoritativeServer();
  });

  const room = rooms.get("TTLS24");
  const now = Date.now();
  room.lastActivity = now - (31 * 60_000);
  runMaintenance(now);
  assert.equal(rooms.get("TTLS24"), room);
  assert.equal(room.players[0].socket.readyState, WebSocket.OPEN);
  assert.equal(host.messages.some(({ type }) => type === "room-closed"), false);

  host.socket.terminate();
  await waitUntil(() => room.players[0]?.socket === null, "TTL host disconnect");
  runMaintenance(Date.now());
  assert.equal(rooms.has("TTLS24"), false, "TTL may collect the room once every socket is gone");
});
