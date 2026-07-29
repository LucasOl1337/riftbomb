import assert from "node:assert/strict";
import test from "node:test";
import { createAuthoritativeDuel, applyInputMask } from "../../../game/create-authoritative-duel.mjs";
import { AuthoritativeRooms } from "../src/authoritative-rooms.mjs";

test("headless duel advances independently from a browser", async () => {
  const game = await createAuthoritativeDuel({
    hostChampion: "katarina", guestChampion: "vladimir", arena: "lattice", matchTarget: 10
  });
  applyInputMask(game, 1, 8);
  applyInputMask(game, 2, 4);
  const [hostStart, guestStart] = game.players.map(({ x }) => x);
  for (let frame = 0; frame < 60; frame += 1) game.update(1 / 60);
  assert.ok(game.players[0].x > hostStart);
  assert.ok(game.players[1].x < guestStart);
  assert.ok(game.roundTime < 90);
  assert.equal(game.matchTarget, 10);
});

test("shares one tick and snapshot clock across active rooms", async () => {
  const rooms = new Map();
  const timers = new Map();
  const cancelled = [];
  let timerId = 0;
  let now = 100;
  const manager = new AuthoritativeRooms({
    rooms,
    broadcast() {},
    now: () => now,
    scheduleImmediate: (callback) => callback(),
    scheduleInterval(callback, delay) {
      const id = ++timerId;
      timers.set(id, { callback, delay });
      return id;
    },
    cancelInterval(id) {
      cancelled.push(id);
      timers.delete(id);
    }
  });

  for (const code of ["ROOM01", "ROOM02"]) {
    const room = manager.create(code, {});
    room.players = [{ socket: {} }, { socket: {}, ready: true }];
    await manager.start(room);
  }

  assert.equal(timers.size, 2);
  assert.deepEqual([...timers.values()].map(({ delay }) => Math.round(delay)), [17, 33]);
  now += 1000 / 60;
  [...timers.values()][0].callback();
  [...timers.values()][1].callback();
  assert.deepEqual([...rooms.values()].map(({ sequence }) => sequence), [1, 1]);

  manager.stop(rooms.get("ROOM01"));
  assert.equal(timers.size, 2);
  manager.stop(rooms.get("ROOM02"));
  assert.equal(timers.size, 0);
  assert.deepEqual(cancelled, [1, 2]);
});

test("yields between bounded room batches", () => {
  const rooms = new Map(Array.from({ length: 17 }, (_, index) => [index, { index }]));
  const pending = [];
  const visited = [];
  const manager = new AuthoritativeRooms({
    rooms,
    broadcast() {},
    scheduleImmediate(callback) {
      pending.push(callback);
    }
  });

  manager.runRoomQueue("tickQueueActive", (room) => visited.push(room.index));
  assert.equal(visited.length, 8);
  assert.equal(pending.length, 1);
  manager.runRoomQueue("tickQueueActive", () => assert.fail("overlapping queue must be skipped"));
  pending.shift()();
  assert.equal(visited.length, 16);
  pending.shift()();
  assert.equal(visited.length, 17);
  assert.equal(manager.tickQueueActive, false);
});
