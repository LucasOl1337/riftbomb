import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";

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
  socket.send(JSON.stringify({ type: "input", mask: 8 }));
  const deadline = Date.now() + 1000;
  while (rooms.get("SAFE24")?.inputs[0] !== 8 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(rooms.get("SAFE24")?.inputs[0], 8);
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
  const host = await open({ type: "hello", room: "ABC234", role: "host", preset: { matchTarget: 10 } });
  const guest = await open({ type: "hello", room: "ABC234", role: "guest", ready: true });
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
        resolve();
      }
    };
    guest.socket.on("message", onSnapshot);
  });

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
  const room = rooms.get("ABC234");
  const disconnectedBefore = Date.now() + 1000;
  while (room.players[1]?.socket && Date.now() < disconnectedBefore) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  reconnectedGuest = await open({ type: "hello", room: "ABC234", role: "guest", ready: true });
  assert.equal(
    reconnectedGuest.messages.find(({ type }) => type === "connected")?.soundCursor,
    1
  );

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
    preset: { hostChampion: "zed", guestChampion: "katarina", matchTarget: 3 }
  });
  const guest = await open({ type: "hello", room: "REMCH2", role: "guest", ready: true });
  t.after(() => {
    host.socket.terminate();
    guest.socket.terminate();
    closeAuthoritativeServer();
  });

  await waitFor(guest, "start");
  const room = rooms.get("REMCH2");
  assert.ok(room?.game);
  const firstGame = room.game;
  const firstSnapshot = await waitFor(guest, "snapshot");
  const firstSnapshotSequence = firstSnapshot.data.s;
  assert.equal(firstGame.placeBomb(firstGame.players[0]), true);
  assert.equal(firstGame.authoritativeSound.latest, 1);
  firstGame.mode = "matchover";

  const rematchWait = waitFor(guest, "rematch");
  host.socket.send(JSON.stringify({
    type: "rematch",
    hostChampion: "zed",
    guestChampion: "katarina",
    arena: "lattice",
    matchTarget: 3
  }));

  const rematch = await rematchWait;
  assert.equal(rematch.type, "rematch");
  assert.equal(rematch.hostChampion, "zed");
  assert.notEqual(room.game, firstGame);
  assert.equal(room.game.mode, "playing");
  assert.equal(room.game.matchTarget, 3);
  assert.ok(room.sequence >= firstSnapshotSequence);
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
