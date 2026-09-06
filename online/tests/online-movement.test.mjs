import assert from "node:assert/strict";
import { test } from "node:test";

import { createAuthoritativeDuel } from "../../game/create-authoritative-duel.mjs";

await import(`../public/online-duel.js?movement=${Date.now()}`);
const movementFactory = globalThis.RIFTBOMB_ONLINE_MOVEMENT;

const DT = 1 / 60;

async function displacement(setup, move) {
  const game = await createAuthoritativeDuel({ seed: 7331 });
  const player = game.players[0];
  game.roundLocked = false;
  setup(game, player);
  const startX = player.x;
  const startZ = player.z;
  move(game, player);
  return Math.hypot(player.x - startX, player.z - startZ);
}

test("local online prediction preserves canonical movement for boosts, dashes and the owner's bomb", async () => {
  assert.ok(movementFactory?.create, "the published online client must expose its movement seam");
  const cases = [
    ["base movement", () => {}, 0.0575],
    ["speed boost", (_game, player) => { player.speedBoost = 1; }, 0.07475],
    ["dash", (_game, player) => { player.dashing = 0.18; }, 0.15525],
    ["exit own bomb", (game, player) => { assert.equal(game.placeBomb(player), true); }, 0.0575],
  ];

  for (const [scenario, setup, expected] of cases) {
    const authoritative = await displacement(setup, (game, player) => {
      game.keys.add("KeyD");
      game.updateContestant(player, DT);
    });
    const predicted = await displacement(setup, (game, player) => {
      movementFactory.create().predict(game, player, 8, DT);
    });
    assert.ok(Math.abs(authoritative - expected) < 1e-9, `${scenario} authority changed`);
    assert.ok(Math.abs(predicted - expected) < 1e-9, `${scenario} prediction diverged`);
  }
});

test("local online prediction cannot move a canonically locked contestant", async () => {
  const game = await createAuthoritativeDuel({ seed: 8211 });
  const player = game.players[0];
  game.roundLocked = false;
  player.stunned = 0.5;
  const before = { x: player.x, z: player.z };
  movementFactory.create().predict(game, player, 8, DT);
  assert.deepEqual({ x: player.x, z: player.z }, before);
  assert.equal(player.moving, false);
});

async function simulateLocalResponsiveness({ oneWayMs = 50, pressMs = 1_000 } = {}) {
  const [server, client] = await Promise.all([
    createAuthoritativeDuel({ seed: 9417 }),
    createAuthoritativeDuel({ seed: 9417 }),
  ]);
  for (const match of [server, client]) {
    for (let row = 1; row < match.rows - 1; row += 1) {
      for (let column = 1; column < match.cols - 1; column += 1) match.grid[row][column] = 0;
    }
    const [x, z] = match.worldFromCell(5, 3);
    Object.assign(match.players[0], { x, z, lastDx: 1, lastDz: 0 });
    match.roundLocked = false;
  }

  let now = 0;
  let serverMask = 0;
  const movement = movementFactory.create({ now: () => now });
  const inputDeliveries = [
    { at: oneWayMs, mask: 8 },
    { at: pressMs + oneWayMs, mask: 0 },
  ];
  const snapshotDeliveries = [];
  const frames = [];
  const frameMs = 1_000 / 60;

  for (let frame = 0; frame < 90; frame += 1) {
    now = frame * frameMs;
    const mask = now < pressMs ? 8 : 0;
    movement.recordInput(mask, now);
    while (inputDeliveries.length && inputDeliveries[0].at <= now + 0.001) {
      serverMask = inputDeliveries.shift().mask;
    }
    const serverInput = serverMask === 8 ? "KeyD" : null;
    if (serverInput) server.keys.add(serverInput);
    else server.keys.delete("KeyD");
    server.updateContestant(server.players[0], DT);

    if (frame % 2 === 0) {
      snapshotDeliveries.push({
        at: now + oneWayMs,
        ack: now >= pressMs + oneWayMs ? 2 : now >= oneWayMs ? 1 : 0,
        player: { ...server.players[0] },
      });
    }
    while (snapshotDeliveries.length && snapshotDeliveries[0].at <= now + 0.001) {
      const snapshot = snapshotDeliveries.shift();
      const previous = client.players[0];
      const authoritative = { ...snapshot.player };
      client.players[0] = authoritative;
      client.player = authoritative;
      movement.acceptLocalSnapshot(client, authoritative, previous, {
        receivedAt: now,
        roundTripMs: oneWayMs * 2,
        unacknowledgedInputAgeMs: snapshot.ack < 1
          ? now
          : snapshot.ack < 2 && now >= pressMs
            ? now - pressMs
            : null,
      });
    }

    movement.stepLocal(client, client.players[0], mask, DT, now);
    frames.push({ now, x: client.players[0].x });
  }

  const startX = client.worldFromCell(5, 3)[0];
  const release = frames.find((frame) => frame.now >= pressMs);
  const after200Ms = frames.find((frame) => frame.now >= pressMs + 200);
  return {
    distanceAtRelease: release.x - startX,
    driftAfterRelease: after200Ms.x - release.x,
  };
}

test("local prediction stays responsive and stops cleanly from 50 to 200 ms RTT", async () => {
  for (const roundTripMs of [50, 100, 150, 200]) {
    const result = await simulateLocalResponsiveness({ oneWayMs: roundTripMs / 2 });
    assert.ok(result.distanceAtRelease >= 3.45 * 0.98,
      `${roundTripMs} ms RTT retained only ${(result.distanceAtRelease / 3.45 * 100).toFixed(1)}%`);
    assert.ok(Math.abs(result.driftAfterRelease) <= 0.06,
      `${roundTripMs} ms RTT drifted ${result.driftAfterRelease.toFixed(3)} units after release`);
  }
});

test("stable remote movement appears within two 30 Hz snapshots", () => {
  let now = 0;
  const movement = movementFactory.create({ now: () => now, wallNow: () => now });
  const deliveries = [];
  for (let serverTime = 0; serverTime <= 300; serverTime += 1_000 / 30) {
    deliveries.push({
      at: serverTime + 50,
      player: { id: 2, x: serverTime / 1_000 * 3, z: 0, moving: true, lastDx: 1, lastDz: 0 },
      serverTime,
    });
  }

  let firstVisibleAt = null;
  let remote = { id: 2, x: 0, z: 0, moving: false, lastDx: 1, lastDz: 0 };
  for (let frame = 0; frame < 20; frame += 1) {
    now = frame * (1_000 / 60);
    while (deliveries.length && deliveries[0].at <= now + 0.001) {
      const snapshot = deliveries.shift();
      const previous = remote;
      remote = { ...snapshot.player };
      movement.acceptRemoteSnapshot(remote, previous, {
        receivedWallTime: now,
        roundTripMs: 100,
        serverTime: snapshot.serverTime,
      });
    }
    movement.stepRemote(remote);
    if (firstVisibleAt === null && remote.x > 0.001) firstVisibleAt = now;
  }

  assert.ok(firstVisibleAt !== null && firstVisibleAt <= 90,
    `stable remote movement stayed buffered for ${firstVisibleAt?.toFixed(1) ?? "the full run"} ms`);
});

test("remote snapshot buffering stays smooth and monotonic under arrival jitter", () => {
  let now = 0;
  const movement = movementFactory.create({
    now: () => now,
    wallNow: () => now,
    remoteDelayMs: 120,
  });
  const jitter = [80, 50, 78, 52, 76, 54];
  const deliveries = [];
  for (let serverTime = 0, index = 0; serverTime <= 1_200; serverTime += 1_000 / 30, index += 1) {
    deliveries.push({
      at: serverTime + jitter[index % jitter.length],
      player: { id: 2, x: serverTime / 1_000 * 3, z: 0, moving: true, lastDx: 1, lastDz: 0 },
      serverTime,
    });
  }
  deliveries.sort((left, right) => left.at - right.at);

  let remote = { id: 2, x: 0, z: 0, moving: false, lastDx: 1, lastDz: 0 };
  const rendered = [];
  for (let frame = 0; frame < 78; frame += 1) {
    now = frame * (1_000 / 60);
    while (deliveries.length && deliveries[0].at <= now + 0.001) {
      const snapshot = deliveries.shift();
      const previous = remote;
      remote = { ...snapshot.player };
      movement.acceptRemoteSnapshot(remote, previous, {
        receivedWallTime: now,
        roundTripMs: 100,
        serverTime: snapshot.serverTime,
      });
    }
    movement.stepRemote(remote);
    if (now >= 300) rendered.push(remote.x);
  }

  const deltas = rendered.slice(1).map((value, index) => value - rendered[index]);
  assert.ok(deltas.every((delta) => delta >= -1e-9), "remote contestant moved backwards");
  assert.ok(Math.max(...deltas) <= 0.065,
    `remote contestant jumped ${Math.max(...deltas).toFixed(3)} units in one frame`);
  assert.ok(remote.x >= 3.2, `remote contestant stalled at ${remote.x.toFixed(3)}`);
});

test("remote buffer grows when snapshot jitter exceeds its two-tick base", () => {
  let now = 0;
  const movement = movementFactory.create({ now: () => now });
  const match = {
    mode: "playing",
    roundLocked: false,
    tile: 1.32,
    canMoveContestant: () => true,
    moveContestantByDirection() {},
  };
  const player = () => ({ id: 1, x: 0, z: 0, alive: true, dashing: 0 });
  movement.acceptLocalSnapshot(match, player(), player(), { receivedAt: now, roundTripMs: 100 });
  now = 80;
  movement.acceptLocalSnapshot(match, player(), player(), { receivedAt: now, roundTripMs: 100 });

  assert.ok(movement.telemetry().remoteBufferDelayMs > 120,
    "high snapshot jitter must buy enough interpolation history to stay smooth");
});

test("published movement telemetry reports RTT, snapshot cadence and jitter", () => {
  let now = 0;
  const movement = movementFactory.create({ now: () => now });
  const match = {
    mode: "playing",
    roundLocked: false,
    tile: 1.32,
    canMoveContestant: () => true,
    moveContestantByDirection() {},
  };
  movement.acceptLocalSnapshot(match, { id: 1, x: 0, z: 0, alive: true, dashing: 0 },
    { id: 1, x: 0, z: 0 }, { receivedAt: now, roundTripMs: 100 });
  now = 40;
  movement.acceptLocalSnapshot(match, { id: 1, x: 0, z: 0, alive: true, dashing: 0 },
    { id: 1, x: 0, z: 0 }, { receivedAt: now, roundTripMs: 120 });

  const telemetry = movement.telemetry();
  assert.equal(telemetry.roundTripMs, 120);
  assert.equal(telemetry.snapshotIntervalMs, 40);
  assert.ok(telemetry.snapshotJitterMs > 6 && telemetry.snapshotJitterMs < 7);
});
