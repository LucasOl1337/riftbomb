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
    broadcast() {},
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

test("server boot graph does not import the duel runtime eagerly", async () => {
  const serverPath = fileURLToPath(new URL("../src/server.mjs", import.meta.url));
  const source = await readFile(serverPath, "utf8");
  assert.doesNotMatch(source, /from\s+["'][^"']*create-authoritative-duel\.mjs["']/);
});
