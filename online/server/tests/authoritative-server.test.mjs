import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";

test("websocket room starts only after both players are ready", async (t) => {
  process.env.PORT = "0";
  process.env.GAME_SERVER_PROXY_SECRET = "test-proxy-secret";
  const { server, closeAuthoritativeServer } = await import(`../src/server.mjs?test=${Date.now()}`);
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
  t.after(() => {
    host.socket.terminate();
    guest.socket.terminate();
    closeAuthoritativeServer();
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("snapshot timeout")), 1000);
    guest.socket.on("message", (data) => {
      const message = JSON.parse(data);
      if (message.type === "snapshot") {
        clearTimeout(timeout);
        assert.equal(message.data.v, 3);
        assert.equal(message.data.matchTarget, 10);
        resolve();
      }
    });
  });
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
});
