import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { AuthoritativeRooms } from "../src/authoritative-rooms.mjs";

function fakeRuntime() {
  return {
    async createAuthoritativeDuel() {
      return {
        grid: [],
        update() {},
        players: [],
        mode: "playing"
      };
    },
    applyInputMask() {},
    applyPlayerAction: () => true,
    serializeAuthoritativeSnapshot: () => ({})
  };
}

test("loads the duel runtime once and only when the first match starts", async () => {
  let loads = 0;
  const rooms = new Map();
  const manager = new AuthoritativeRooms({
    rooms,
    transport: { broadcast() {} },
    loadDuelRuntime() {
      loads += 1;
      return fakeRuntime();
    },
    scheduleInterval: () => 1
  });

  const first = manager.create("ROOM01", {});
  const second = manager.create("ROOM02", {});
  first.players = [{ socket: {} }, { socket: {}, ready: true }];
  second.players = [{ socket: {} }, { socket: {}, ready: true }];
  assert.equal(loads, 0);

  await Promise.all([manager.start(first), manager.start(second)]);
  assert.equal(loads, 1);
  assert.equal(manager.applyPlayerAction(first, 1, { kind: "bomb" }), true);
});

test("a room stopped while its runtime loads cannot start an orphaned match", async () => {
  const rooms = new Map();
  let releaseRuntime;
  let createCalls = 0;
  let scheduledClocks = 0;
  const manager = new AuthoritativeRooms({
    rooms,
    transport: { broadcast() {} },
    loadDuelRuntime: () => new Promise((resolve) => { releaseRuntime = resolve; }),
    scheduleInterval() {
      scheduledClocks += 1;
      return scheduledClocks;
    }
  });
  const room = manager.create("FENCE1", {});
  room.players = [
    { socket: {}, connectionGeneration: 1 },
    { socket: {}, ready: true, connectionGeneration: 1 }
  ];

  const starting = manager.start(room);
  manager.stop(room);
  releaseRuntime({
    ...fakeRuntime(),
    async createAuthoritativeDuel() {
      createCalls += 1;
      return fakeRuntime().createAuthoritativeDuel();
    }
  });
  await starting;

  assert.equal(rooms.has(room.code), false);
  assert.equal(room.game, null);
  assert.equal(createCalls, 0, "a stopped room must be fenced before duel construction");
  assert.equal(scheduledClocks, 0);
  assert.equal(manager.performanceSnapshot().tickClockActive, false);
});

test("a room stopped during duel creation cannot resurrect its game or clocks", async () => {
  const rooms = new Map();
  let announceCreate;
  const createStarted = new Promise((resolve) => { announceCreate = resolve; });
  let releaseGame;
  let scheduledClocks = 0;
  const runtime = {
    ...fakeRuntime(),
    createAuthoritativeDuel() {
      announceCreate();
      return new Promise((resolve) => { releaseGame = resolve; });
    }
  };
  const manager = new AuthoritativeRooms({
    rooms,
    transport: { broadcast() {} },
    loadDuelRuntime: () => runtime,
    scheduleInterval() {
      scheduledClocks += 1;
      return scheduledClocks;
    }
  });
  const room = manager.create("FENCE2", {});
  room.players = [
    { socket: {}, connectionGeneration: 4 },
    { socket: {}, ready: true, connectionGeneration: 7 }
  ];

  const starting = manager.start(room);
  await createStarted;
  manager.stop(room);
  releaseGame(await fakeRuntime().createAuthoritativeDuel());
  await starting;

  assert.equal(rooms.has(room.code), false);
  assert.equal(room.game, null);
  assert.equal(room.starting, false);
  assert.equal(scheduledClocks, 0);
  assert.equal(manager.performanceSnapshot().tickClockActive, false);
});

test("a socket generation replaced during creation restarts with the current players", async () => {
  const rooms = new Map();
  let releaseFirstGame;
  let createCalls = 0;
  const runtime = {
    ...fakeRuntime(),
    createAuthoritativeDuel() {
      createCalls += 1;
      if (createCalls === 1) {
        return new Promise((resolve) => { releaseFirstGame = resolve; });
      }
      return Promise.resolve({
        grid: [], update() {}, players: [], mode: "playing", generation: createCalls
      });
    }
  };
  const manager = new AuthoritativeRooms({
    rooms,
    transport: { broadcast() {} },
    loadDuelRuntime: () => runtime,
    scheduleInterval: () => 1
  });
  const room = manager.create("FENCE3", {});
  room.players = [
    { socket: {}, connectionGeneration: 1 },
    { socket: {}, ready: true, connectionGeneration: 1 }
  ];

  const starting = manager.start(room);
  while (!releaseFirstGame) await new Promise((resolve) => setImmediate(resolve));
  room.players[1].socket = { replacement: true };
  room.players[1].connectionGeneration = 2;
  await manager.start(room);
  releaseFirstGame({ grid: [], update() {}, players: [], mode: "stale" });
  await starting;
  for (let attempt = 0; attempt < 10 && !room.game; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.equal(createCalls, 2);
  assert.equal(room.game?.generation, 2);
  assert.equal(room.inputEpoch, 1);
  assert.equal(manager.performanceSnapshot().tickClockActive, true);
  manager.stop(room);
});

test("server boot graph does not import the duel runtime eagerly", async () => {
  const serverPath = fileURLToPath(new URL("../src/server.mjs", import.meta.url));
  const source = await readFile(serverPath, "utf8");
  assert.doesNotMatch(source, /from\s+["'][^"']*create-authoritative-duel\.mjs["']/);
});

test("server boot graph defers non-critical built-ins", async () => {
  const serverPath = fileURLToPath(new URL("../src/server.mjs", import.meta.url));
  const source = await readFile(serverPath, "utf8");
  assert.doesNotMatch(source, /from\s+["']ws["']/);
  assert.doesNotMatch(source, /from\s+["']node:crypto["']/);
  assert.doesNotMatch(source, /from\s+["']node:perf_hooks["']/);
  assert.match(source, /webSocketRuntimePromise\s*\?\?=\s*import\(["']ws["']\)/);
  assert.match(source, /cryptoRuntimePromise\s*\?\?=\s*import\(["']node:crypto["']\)/);
});

test("server boot graph defers non-critical support modules", async () => {
  const serverPath = fileURLToPath(new URL("../src/server.mjs", import.meta.url));
  const source = await readFile(serverPath, "utf8");
  for (const moduleName of [
    "authoritative-rooms",
    "json-transport",
    "message-rate-limit",
    "health-response"
  ]) {
    assert.doesNotMatch(source, new RegExp(`from\\s+["']\\./${moduleName}\\.mjs["']`));
    assert.match(source, new RegExp(`import\\(["']\\./${moduleName}\\.mjs["']\\)`));
  }
  assert.doesNotMatch(source, /quick-match-queue/,
    "the room lifecycle owns its queue implementation behind the authoritative seam");
  assert.match(source, /SERVER_BOOT_LAZY_V1/);
});
