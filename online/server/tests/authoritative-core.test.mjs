import assert from "node:assert/strict";
import test from "node:test";
import {
  applyInputMask,
  applyPlayerAction,
  createAuthoritativeAudioRecorder,
  createAuthoritativeDuel,
  serializeAuthoritativeSnapshot
} from "../../../game/create-authoritative-duel.mjs";
import { AuthoritativeRooms, updateGridCache } from "../src/authoritative-rooms.mjs";

test("tracks exact grid changes without transient serialization", () => {
  const room = { gridCache: null };
  const grid = [[0, 1], [2, 3]];

  assert.equal(updateGridCache(room, grid), true);
  assert.notEqual(room.gridCache, grid);
  assert.equal(updateGridCache(room, grid), false);

  grid[0][1] = 9;
  assert.equal(updateGridCache(room, grid), true);
  assert.deepEqual(room.gridCache, grid);
  assert.equal(updateGridCache(room, grid), false);

  grid.push([4]);
  assert.equal(updateGridCache(room, grid), true);
  assert.deepEqual(room.gridCache, grid);
});

test("movement input accepts only the next sequence in the active match epoch", () => {
  const rooms = new Map();
  const manager = new AuthoritativeRooms({ rooms, broadcast() {} });
  const room = manager.create("INPUT1", {});
  room.game = {};
  room.inputEpoch = 9;

  assert.equal(manager.acceptInput(room, 0, { type: "input", mask: 4 }), true,
    "an old client must keep moving while the server rolls out first");
  assert.deepEqual(manager.inputProtocol(room), {
    v: 1, epoch: 9, accepted: [0, 0], ack: [0, 0]
  });

  assert.equal(manager.acceptInput(room, 0, {
    type: "input", mask: 8, inputEpoch: 9, inputSeq: 2
  }), false, "a gap must wait for replay of the first missing transition");
  assert.equal(manager.acceptInput(room, 0, {
    type: "input", mask: 8, inputEpoch: 9, inputSeq: 1
  }), true);
  assert.equal(manager.acceptInput(room, 0, { type: "input", mask: 4 }), false,
    "legacy input must be disabled irreversibly after the first v1 envelope");
  assert.equal(manager.acceptInput(room, 0, {
    type: "input", mask: 4, inputEpoch: 9, inputSeq: 1
  }), false, "the first payload for a sequence must win");
  assert.equal(manager.acceptInput(room, 0, {
    type: "input", mask: 0, inputEpoch: 8, inputSeq: 2
  }), false, "an earlier match cannot mutate the current mask");
  assert.equal(manager.acceptInput(room, 0, {
    type: "input", mask: 0, inputEpoch: 9, inputSeq: 2
  }), true);
  assert.deepEqual(room.inputs, [0, 0]);
  assert.deepEqual(manager.inputProtocol(room), {
    v: 1, epoch: 9, accepted: [2, 0], ack: [0, 0]
  });

  for (const inputSeq of [0, -1, 2.5, "3", Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(manager.acceptInput(room, 0, {
      type: "input", mask: 1, inputEpoch: 9, inputSeq
    }), false);
  }
  assert.deepEqual(manager.inputProtocol(room).accepted, [2, 0]);
});

test("action transport processes each sequence once and ACKs mechanical rejection", () => {
  const rooms = new Map();
  const manager = new AuthoritativeRooms({ rooms, broadcast() {} });
  const room = manager.create("ACTN01", {});
  room.game = { round: 3 };
  room.inputEpoch = 9;
  const applied = [];
  manager.duelRuntime = {
    applyPlayerAction(_game, playerId, action) {
      applied.push({ playerId, kind: action.kind, slot: action.slot });
      return action.kind === "bomb";
    }
  };

  assert.deepEqual(manager.actionProtocol(room), { v: 1, epoch: 9, ack: [0, 0] });
  assert.equal(manager.processPlayerAction(room, 0, { type: "action", kind: "bomb" }), true,
    "a legacy client remains usable while the server rolls out first");
  assert.equal(applied.length, 1);
  assert.deepEqual(manager.actionProtocol(room).ack, [0, 0],
    "legacy traffic does not claim a reliable sequence");

  assert.equal(manager.processPlayerAction(room, 0, {
    type: "action", kind: "bomb", actionEpoch: 9, actionSeq: 2, actionRound: 3
  }), false, "a gap waits for replay of the missing head");
  assert.equal(applied.length, 1);

  assert.equal(manager.processPlayerAction(room, 0, {
    type: "action", kind: "ability", slot: 0,
    actionEpoch: 9, actionSeq: 1, actionRound: 3
  }), true, "transport acceptance is independent from mechanical acceptance");
  assert.equal(applied.length, 2);
  assert.deepEqual(manager.actionProtocol(room).ack, [1, 0],
    "a syntactically valid cooldown/capacity rejection is consumed once");
  assert.equal(manager.processPlayerAction(room, 0, { type: "action", kind: "bomb" }), false,
    "a reliable seat can never downgrade to duplicate-prone legacy actions");
  assert.equal(manager.processPlayerAction(room, 0, {
    type: "action", kind: "bomb", actionEpoch: 9, actionSeq: 1, actionRound: 3
  }), false, "a duplicate sequence cannot repeat a different payload");
  assert.equal(applied.length, 2);

  assert.equal(manager.processPlayerAction(room, 0, {
    type: "action", kind: "bomb", actionEpoch: 9, actionSeq: 2, actionRound: 3
  }), true);
  assert.equal(manager.processPlayerAction(room, 1, {
    type: "action", kind: "bomb", actionEpoch: 9, actionSeq: 1, actionRound: 3
  }), true, "each seat owns an independent sequence cursor");
  assert.deepEqual(manager.actionProtocol(room).ack, [2, 1]);
  assert.deepEqual(applied.slice(-2).map(({ playerId }) => playerId), [1, 2]);

  for (const message of [
    { type: "action", kind: "bomb", actionEpoch: 8, actionSeq: 3, actionRound: 3 },
    { type: "action", kind: "bomb", actionEpoch: 9, actionSeq: 0, actionRound: 3 },
    { type: "action", kind: "bomb", actionEpoch: 9, actionSeq: 2.5, actionRound: 3 },
    { type: "action", kind: "bomb", actionEpoch: 9, actionSeq: 3, actionRound: -1 },
    {
      type: "action", kind: "ability", slot: 4,
      actionEpoch: 9, actionSeq: 3, actionRound: 3
    },
    { type: "action", kind: "admin", actionEpoch: 9, actionSeq: 3, actionRound: 3 }
  ]) {
    assert.equal(manager.processPlayerAction(room, 0, message), false);
  }
  assert.deepEqual(manager.actionProtocol(room).ack, [2, 1]);
  assert.equal(applied.length, 4);

  assert.equal(manager.processPlayerAction(room, 0, {
    type: "action", kind: "bomb", actionEpoch: 9, actionSeq: 3, actionRound: 2
  }), true, "a delayed action from the previous round is consumed without an effect");
  assert.deepEqual(manager.actionProtocol(room).ack, [3, 1]);
  assert.equal(applied.length, 4);
  assert.equal(manager.processPlayerAction(room, 0, {
    type: "action", kind: "bomb", actionEpoch: 9, actionSeq: 4, actionRound: 3
  }), true, "the next current-round action cannot be head-of-line blocked");
  assert.deepEqual(manager.actionProtocol(room).ack, [4, 1]);
  assert.equal(applied.length, 5);
});

const unlockKit = (player) => {
  player.skillsUnlocked = [true, true, true, true];
  return player;
};

test("authoritative ability buffer executes the latest command once on its first legal tick", async () => {
  const game = await createAuthoritativeDuel({
    hostChampion: "katarina", guestChampion: "zed", arena: "lattice", matchTarget: 3
  });
  const host = unlockKit(game.players[0]);
  const casts = [];
  game.executeAbility = (slot, player) => {
    casts.push({ slot, playerId: player.id });
    return true;
  };

  host.qCooldown = 0.1;
  assert.equal(applyPlayerAction(game, 1, { kind: "ability", slot: 0 }), true);
  assert.equal(casts.length, 0, "a blocked command cannot mutate combat in the socket callback");
  assert.deepEqual(JSON.parse(JSON.stringify(game.abilityBuffer.get(1))), {
    sequence: 1,
    playerId: 1,
    slot: 0,
    remaining: 0.15,
    initialBlockers: ["cooldown"]
  });

  // A second valid intent replaces the first; one player can never accumulate
  // an unbounded combo queue from key repeat or duplicated touch events.
  host.wCooldown = 0.1;
  assert.equal(applyPlayerAction(game, 1, { kind: "ability", slot: 1 }), true);
  assert.equal(game.abilityBuffer.get(1).slot, 1);
  assert.equal(game.abilityBufferStats.replaced, 1);

  game.update(0.05);
  assert.equal(casts.length, 0);
  game.update(0.05);
  assert.deepEqual(casts, [{ slot: 1, playerId: 1 }]);
  assert.equal(game.abilityBuffer.has(1), false);
  assert.equal(game.abilityBufferStats.executed, 1);
  game.update(0.05);
  assert.equal(casts.length, 1, "a consumed command executes exactly once");
});

test("a rejected command cannot erase an earlier valid postponed spell", async () => {
  const game = await createAuthoritativeDuel({
    hostChampion: "katarina", guestChampion: "zed", arena: "lattice", matchTarget: 3
  });
  const host = unlockKit(game.players[0]);
  const casts = [];
  game.executeAbility = (slot) => { casts.push(slot); return true; };

  host.qCooldown = 0.1;
  assert.equal(game.castAbility(0, host), true);
  host.wCooldown = 5;
  assert.equal(game.castAbility(1, host), false);
  assert.equal(game.abilityBuffer.get(host.id).slot, 0);
  assert.equal(game.abilityBufferStats.replaced, 0);

  game.update(0.1);
  assert.deepEqual(casts, [0]);
});

test("target eligibility is captured on input and invalid casts preserve Death Lotus", async () => {
  const game = await createAuthoritativeDuel({
    hostChampion: "katarina", guestChampion: "zed", arena: "lattice", matchTarget: 3
  });
  const [katarina, target] = game.players.map(unlockKit);
  const announcements = [];
  game.presentation = {
    announce: (message) => announcements.push(message),
    update() {}
  };
  game.daggers.length = 0;
  game.pickups.length = 0;
  target.x = katarina.x + game.tile * 8;
  target.z = katarina.z;

  katarina.eCooldown = 0.1;
  assert.equal(game.castAbility(2, katarina), false);
  assert.deepEqual(announcements, ["Shunpo needs a dagger, pickup, or rival in range"]);
  assert.equal(game.abilityBuffer.has(katarina.id), false,
    "an invalid targeted spell cannot acquire a target during its cooldown");
  target.x = katarina.x + 0.8;
  game.update(0.1);
  assert.equal(katarina.eCooldown, 0);

  assert.equal(game.castAbility(3, katarina), true);
  const lotus = game.slashes.find((slash) => slash.lotus && slash.ownerId === katarina.id);
  announcements.length = 0;
  target.x = katarina.x + game.tile * 8;
  assert.equal(game.castAbility(2, katarina), false);
  assert.deepEqual(announcements, ["Shunpo needs a dagger, pickup, or rival in range"],
    "an invalid command preserves its original single feedback message");
  assert.ok(katarina.ultChannel > 0, "a target-invalid spell does not cancel the channel");
  assert.ok(game.slashes.includes(lotus), "a target-invalid spell preserves Lotus VFX");
});

test("placement-limited abilities cannot gain arena capacity after being queued", async () => {
  const zedGame = await createAuthoritativeDuel({
    hostChampion: "zed", guestChampion: "katarina", arena: "lattice", matchTarget: 3
  });
  const zed = unlockKit(zedGame.players[0]);
  const forwardCells = [1, 2, 3].map((steps) => zedGame.cellFromWorld(
    zed.x + zed.lastDx * zedGame.tile * steps,
    zed.z + zed.lastDz * zedGame.tile * steps
  ));
  for (const cell of forwardCells) zedGame.grid[cell.r][cell.c] = 1;
  zed.zedSwapWindow = 0;
  zedGame.zedShadows.push({
    ownerId: zed.id, kind: "living", swapAvailable: true, age: 0, life: 5,
    x: zed.x, z: zed.z, hurt: 0, castAnim: 0, castDuration: 0, zedSlashAnim: 0, zedUltAnim: 0
  });
  zed.wCooldown = 0.1;
  assert.equal(zedGame.castAbility(1, zed), false);
  assert.equal(zedGame.abilityBuffer.size, 0);
  const opened = forwardCells[0];
  zedGame.grid[opened.r][opened.c] = 0;
  zedGame.update(0.1);
  assert.equal(zedGame.zedShadows.length, 1,
    "an expired recast cannot gain a landing after input or create a new shadow");

  const gangplankGame = await createAuthoritativeDuel({
    hostChampion: "gangplank", guestChampion: "katarina", arena: "lattice", matchTarget: 3
  });
  const gangplank = unlockKit(gangplankGame.players[0]);
  gangplankGame.gangplankBarrels = [1, 2, 3].map((id) => ({
    id, ownerId: gangplank.id, r: 1, c: id, x: id, z: 1, age: 0, life: 22, exploded: false
  }));
  gangplank.eCooldown = 0.1;
  assert.equal(gangplankGame.castAbility(2, gangplank), false);
  assert.equal(gangplankGame.abilityBuffer.size, 0);
  gangplankGame.gangplankBarrels.pop();
  gangplankGame.update(0.1);
  assert.equal(gangplankGame.gangplankBarrels.length, 2,
    "Powder Keg cannot gain a free charge after input");
});

test("authoritative Katarina Q resolves without browser-only interpolation globals", async () => {
  const game = await createAuthoritativeDuel({
    hostChampion: "katarina", guestChampion: "zed", arena: "lattice", matchTarget: 3
  });
  const [katarina, target] = game.players.map(unlockKit);
  target.x = katarina.x + 0.8;
  target.z = katarina.z;

  assert.equal(applyPlayerAction(game, katarina.id, { kind: "ability", slot: 0 }), true);
  assert.equal(game.projectiles.length, 1);
  assert.doesNotThrow(() => game.update(1 / 60));
  assert.ok(Number.isFinite(game.projectiles[0].x));
  assert.ok(Number.isFinite(game.projectiles[0].z));

  assert.doesNotThrow(() => {
    for (let tick = 1; tick < 40; tick += 1) game.update(1 / 60);
  });
  assert.equal(game.projectiles.length, 0);
  assert.equal(game.daggers.length, 1, "the authoritative projectile resolves into its dagger");
});

test("the exact 150 ms boundary fires on the ninth 60 Hz tick", async () => {
  const game = await createAuthoritativeDuel({
    hostChampion: "katarina", guestChampion: "zed", arena: "lattice", matchTarget: 3
  });
  const host = unlockKit(game.players[0]);
  const casts = [];
  game.executeAbility = (slot) => { casts.push(slot); return true; };

  host.qCooldown = 0.15;
  assert.equal(game.castAbility(0, host), true);
  for (let tick = 0; tick < 8; tick += 1) game.update(1 / 60);
  assert.deepEqual(casts, []);
  game.update(1 / 60);
  assert.deepEqual(casts, [0]);
  assert.equal(game.abilityBuffer.size, 0);

  host.qCooldown = 0.150002;
  assert.equal(game.castAbility(0, host), false);
  assert.equal(game.abilityBuffer.size, 0);
});

test("ability buffer rejects long locks, expires deterministically and clears on reset", async () => {
  const game = await createAuthoritativeDuel({
    hostChampion: "katarina", guestChampion: "zed", arena: "lattice", matchTarget: 3
  });
  const host = unlockKit(game.players[0]);
  const casts = [];
  game.executeAbility = (slot) => { casts.push(slot); return true; };

  host.qCooldown = 0.151;
  assert.equal(game.castAbility(0, host), false);
  assert.equal(game.abilityBuffer.size, 0);

  host.qCooldown = 0.14;
  assert.equal(game.castAbility(0, host), true);
  host.qCooldown = 0.5;
  game.update(0.15);
  assert.equal(casts.length, 0);
  assert.equal(game.abilityBuffer.size, 0);
  assert.equal(game.abilityBufferStats.expired, 1);

  host.qCooldown = 0.1;
  assert.equal(game.castAbility(0, host), true);
  game.resetPlayers();
  assert.equal(game.abilityBuffer.size, 0);
});

test("stun buffering preserves Gangplank cleanse and unexpected crowd control cancels", async () => {
  const game = await createAuthoritativeDuel({
    hostChampion: "katarina", guestChampion: "gangplank", arena: "lattice", matchTarget: 3
  });
  const [katarina, gangplank] = game.players.map(unlockKit);
  const casts = [];
  const execute = game.executeAbility.bind(game);
  game.executeAbility = (slot, player) => {
    if (player.id === katarina.id) {
      casts.push(slot);
      return true;
    }
    return execute(slot, player);
  };

  katarina.stunned = 0.1;
  assert.equal(game.castAbility(0, katarina), true);
  game.update(0.1);
  assert.deepEqual(casts, [0], "a command entered inside the final stun window fires on release");

  katarina.qCooldown = 0.1;
  assert.equal(game.castAbility(0, katarina), true);
  katarina.stunned = 0.4;
  game.update(1 / 60);
  assert.equal(game.abilityBuffer.has(katarina.id), false);
  assert.deepEqual(casts, [0], "crowd control applied after queueing cancels the command");

  gangplank.health = 50;
  gangplank.invulnerable = 0;
  gangplank.stunned = 1;
  assert.equal(game.castAbility(1, gangplank), true);
  assert.equal(gangplank.stunned, 0);
  assert.ok(gangplank.health > 50);

  gangplank.health = 50;
  gangplank.stunned = 1;
  gangplank.wCooldown = 0.1;
  assert.equal(game.castAbility(1, gangplank), true);
  assert.equal(game.abilityBuffer.get(gangplank.id).slot, 1);
  game.update(0.1);
  assert.equal(game.abilityBuffer.has(gangplank.id), false);
  assert.equal(gangplank.stunned, 0);
  assert.ok(gangplank.health > 50);
});

test("Death Lotus cancels before damage when movement or crowd control arrives", async () => {
  const game = await createAuthoritativeDuel({
    hostChampion: "katarina", guestChampion: "zed", arena: "lattice", matchTarget: 3
  });
  const [katarina, target] = game.players.map(unlockKit);
  katarina.invulnerable = 0;
  target.invulnerable = 0;
  target.x = katarina.x + 0.8;
  target.z = katarina.z;

  assert.equal(game.castAbility(3, katarina), true);
  const beforeMovement = { x: katarina.x, health: target.health };
  applyInputMask(game, 1, 8);
  game.update(1 / 60);
  assert.equal(katarina.ultChannel, 0);
  assert.ok(katarina.x > beforeMovement.x, "movement continues in the cancellation tick");
  assert.equal(target.health, beforeMovement.health, "no Lotus tick lands after movement cancels");
  assert.equal(game.slashes.some((slash) => slash.lotus && slash.ownerId === katarina.id), false);

  applyInputMask(game, 1, 0);
  katarina.rCooldown = 0;
  assert.equal(game.castAbility(3, katarina), true);
  const beforeControl = target.health;
  katarina.stunned = 0.2;
  game.update(1 / 60);
  assert.equal(katarina.ultChannel, 0);
  assert.equal(target.health, beforeControl, "crowd control cancels before the next Lotus tick");
  assert.equal(game.abilityBufferStats.channelsCanceled, 2);
});

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

test("headless crate skill drops do not depend on browser artwork helpers", async () => {
  const game = await createAuthoritativeDuel({
    hostChampion: "katarina", guestChampion: "zed", arena: "lattice", matchTarget: 3
  });
  game.random = () => 0;
  game.pickups.length = 0;
  game.rollCrateDrop(1, 1, 1);
  const pickup = game.pickups.at(-1);
  assert.equal(pickup?.type, "skill");
  assert.equal(pickup?.ownerId, 1);
  assert.equal(pickup?.art, "");
});

test("authoritative combat shares the browser's 100 HP damage contract", async () => {
  const game = await createAuthoritativeDuel({
    hostChampion: "katarina", guestChampion: "zed", arena: "lattice", matchTarget: 3
  });
  const [host, guest] = game.players;
  const hostBomb = { ownerId: host.id };

  for (const player of game.players) {
    assert.equal(player.health, 100);
    assert.equal(player.maxHealth, 100);
    assert.equal(player.alive, true);
  }

  guest.invulnerable = 0;
  game.hitContestant(guest, hostBomb);
  assert.equal(guest.health, 65);
  assert.equal(guest.alive, true);
  game.hitContestant(guest, hostBomb);
  assert.equal(guest.health, 30);
  assert.equal(guest.alive, true);
  game.hitContestant(guest, hostBomb);
  assert.equal(guest.health, 0);
  assert.equal(guest.alive, false);

  host.invulnerable = 0;
  host.shield = 1;
  game.hitContestant(host, { ownerId: guest.id });
  assert.equal(host.health, 100);
  assert.equal(host.shield, 0);
  assert.equal(host.invulnerable, 0.72);

  const announcements = [];
  game.presentation = {
    announce(message) { announcements.push(message); },
    update() {}
  };
  host.invulnerable = 0;
  assert.equal(game.hitSkill(host, 0.22, guest, "Transfusion"), true);
  assert.equal(host.health, 78);
  assert.equal(game.hitSkill(host, 1, guest, "One HP"), true);
  assert.equal(host.health, 77);
  assert.equal(game.healChampion(host, 1), 1);
  assert.equal(host.health, 78);
  assert.ok(announcements.includes("One HP · 77% Blue Katarina health"));
  assert.ok(announcements.includes("One HP · 77 / 100 HP remaining"));
  assert.doesNotMatch(announcements.join("\n"), /\b\d{4,}%/);

  const snapshot = JSON.parse(JSON.stringify(serializeAuthoritativeSnapshot(game, 7)));
  assert.equal(snapshot.players[0].health, 78);
  assert.equal(snapshot.players[0].maxHealth, 100);
  assert.equal(snapshot.players[1].health, 0);
});

test("shared Vladimir costs cannot heal and preserve healing earned during the cast", async () => {
  const game = await createAuthoritativeDuel({
    hostChampion: "vladimir", guestChampion: "zed", arena: "lattice", matchTarget: 3
  });
  const [vladimir, target] = game.players;
  vladimir.health = 1;
  vladimir.invulnerable = 0;
  game.castVladimirW(vladimir);
  assert.equal(vladimir.health, 0.88);

  vladimir.vladimirPool = 0;
  vladimir.eCooldown = 0;
  vladimir.health = 50;
  target.health = 20;
  target.invulnerable = 0;
  target.x = vladimir.x;
  target.z = vladimir.z;
  game.castVladimirE(vladimir);
  assert.equal(target.alive, false);
  assert.equal(vladimir.health, 67);
});

test("shared Death Mark bookkeeping keeps legacy stored-damage scaling", async () => {
  const game = await createAuthoritativeDuel({
    hostChampion: "zed", guestChampion: "katarina", arena: "lattice", matchTarget: 3
  });
  const [zed, target] = game.players;
  target.invulnerable = 0;
  game.zedMarks.push({
    ownerId: zed.id,
    targetId: target.id,
    age: 0,
    fuse: 1.85,
    stored: 0,
    detonated: false
  });
  game.hitSkill(target, 0.22, zed, "Shadow Slash");
  assert.equal(target.health, 78);
  assert.ok(Math.abs(game.zedMarks[0].stored - 0.1056) < 1e-9);
});

test("headless one-shot audio is world-space data, never a browser dependency", async () => {
  const game = await createAuthoritativeDuel({
    hostChampion: "katarina", guestChampion: "zed", arena: "lattice", matchTarget: 3
  });
  assert.equal(game.placeBomb(game.players[0]), true);
  const first = game.authoritativeSound.snapshot().events.at(-1);
  assert.deepEqual(Object.keys(first).sort(), ["cue", "id", "strength", "x", "z"].sort());
  assert.equal(first.id, 1);
  assert.equal(first.cue, "bomb");
  assert.equal(Number.isFinite(first.x), true);
  assert.equal(Number.isFinite(first.z), true);
  assert.equal("pan" in first, false);

  const one = serializeAuthoritativeSnapshot(game, 10);
  const two = serializeAuthoritativeSnapshot(game, 11);
  assert.deepEqual(one.sound, two.sound);
  assert.doesNotThrow(() => JSON.stringify(one));
});

test("authoritative audio journal is bounded, monotonic and survives rematch ids", () => {
  const recorder = createAuthoritativeAudioRecorder(40);
  for (let index = 0; index < 80; index += 1) {
    recorder.emitGameEvent({
      type: index % 2 ? "katQ" : "explosion",
      strength: index % 3 ? Infinity : -8,
      x: index % 4 ? index : NaN,
      z: -index,
      options: { chainDepth: 99, sourceId: { unsafe: true }, cyclic: null }
    });
  }
  const sound = recorder.snapshot();
  assert.equal(sound.v, 1);
  assert.equal(sound.latest, 120);
  assert.equal(sound.events.length, 32);
  assert.deepEqual(sound.events.map(({ id }) => id),
    Array.from({ length: 32 }, (_, index) => 89 + index));
  assert.ok(sound.events.every((event) =>
    Number.isFinite(event.strength) &&
    (event.x === null || Number.isFinite(event.x)) &&
    (event.z === null || Number.isFinite(event.z)) &&
    !("sourceId" in event) && !("pan" in event)
  ));
  assert.doesNotThrow(() => JSON.stringify(sound));

  const resumed = createAuthoritativeAudioRecorder(sound.latest);
  const next = resumed.emitGameEvent({ type: "pickup", strength: 1, x: 0, z: 0 });
  assert.equal(next.id, 121);
  assert.equal(resumed.emitGameEvent({ type: "unknown", strength: 1 }), false);
  assert.equal(resumed.latest, 121);
});

test("shares one tick and snapshot clock across active rooms", async () => {
  const rooms = new Map();
  const timers = new Map();
  const cancelled = [];
  const broadcasts = [];
  let timerId = 0;
  let now = 100;
  const manager = new AuthoritativeRooms({
    rooms,
    broadcast(room, message) {
      broadcasts.push({ room, message });
    },
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
  const [tickClock, snapshotClock] = [...timers.values()];
  const inputRoom = rooms.get("ROOM01");
  assert.equal(inputRoom.inputEpoch, 1);
  assert.equal(manager.acceptInput(inputRoom, 0, {
    type: "input", mask: 8, inputEpoch: 1, inputSeq: 1
  }), true);
  assert.deepEqual(manager.inputProtocol(inputRoom).ack, [0, 0],
    "receipt must not be acknowledged before the authoritative tick consumes it");
  now += 1000 / 60;
  tickClock.callback();
  snapshotClock.callback();
  assert.deepEqual([...rooms.values()].map(({ sequence }) => sequence), [1, 1]);
  assert.equal(broadcasts.filter(({ message }) => message.type === "snapshot" && message.data.grid).length, 2);
  assert.deepEqual(
    broadcasts.find(({ room, message }) => room === inputRoom && message.type === "snapshot")
      .message.data.input,
    { v: 1, epoch: 1, accepted: [1, 0], ack: [1, 0] }
  );
  assert.deepEqual(manager.performanceSnapshot(), {
    activeMatches: 2,
    tickClockActive: true,
    snapshotClockActive: true,
    tickCycles: 1,
    skippedTickCycles: 0,
    snapshotCycles: 1,
    skippedSnapshotCycles: 0,
    snapshotsProduced: 2
  });

  broadcasts.length = 0;
  snapshotClock.callback();
  assert.equal(broadcasts.filter(({ message }) => message.data.grid).length, 0);
  broadcasts.length = 0;
  const changedRoom = rooms.get("ROOM01");
  changedRoom.game.grid[0][0] = changedRoom.game.grid[0][0] === 0 ? 1 : 0;
  snapshotClock.callback();
  assert.equal(broadcasts.find(({ room }) => room === changedRoom).message.data.grid, changedRoom.game.grid);
  assert.equal(broadcasts.find(({ room }) => room !== changedRoom).message.data.grid, undefined);

  broadcasts.length = 0;
  for (let sequence = 3; sequence <= 60; sequence += 1) snapshotClock.callback();
  assert.equal(broadcasts.slice(-2).filter(({ message }) => message.data.grid).length, 2);

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
  assert.equal(manager.performanceSnapshot().skippedTickCycles, 1);
  pending.shift()();
  assert.equal(visited.length, 16);
  pending.shift()();
  assert.equal(visited.length, 17);
  assert.equal(manager.tickQueueActive, false);
  assert.equal(manager.performanceSnapshot().tickCycles, 1);
});
