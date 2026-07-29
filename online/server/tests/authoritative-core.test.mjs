import assert from "node:assert/strict";
import test from "node:test";
import { createAuthoritativeDuel, applyInputMask } from "../../../game/create-authoritative-duel.mjs";

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
