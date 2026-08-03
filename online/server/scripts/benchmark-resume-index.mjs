import { timingSafeEqual } from "node:crypto";
import { performance } from "node:perf_hooks";

process.env.PORT = "0";
process.env.GAME_SERVER_PROXY_SECRET = "benchmark-secret";

const {
  closeAuthoritativeServer,
  createQuickMatchResumeIndex
} = await import(`../src/server.mjs?benchmark=resume-index-${Date.now()}`);

const ROOM_COUNT = Number(process.env.BENCH_RESUME_ROOMS || 256);
const ITERATIONS = Number(process.env.BENCH_RESUME_ITERATIONS || 50_000);
const REPEATS = Number(process.env.BENCH_RESUME_REPEATS || 3);
const cryptoRuntime = { timingSafeEqual };

function digest(roomIndex, seat) {
  const value = Buffer.alloc(32);
  value.writeUInt16BE(roomIndex, 0);
  value[2] = seat;
  value[3] = 0x5a;
  return value;
}

function createFixture() {
  const rooms = new Map();
  const index = createQuickMatchResumeIndex();
  for (let roomIndex = 0; roomIndex < ROOM_COUNT; roomIndex += 1) {
    const room = { code: `R${roomIndex}`, players: [null, null] };
    room.players[0] = {
      quickMatch: true,
      resumeProtocol: 1,
      resumeTokenDigest: digest(roomIndex, 0),
      socket: null,
      disconnectedAt: 1
    };
    room.players[1] = {
      quickMatch: true,
      resumeProtocol: 1,
      resumeTokenDigest: digest(roomIndex, 1),
      socket: null,
      disconnectedAt: 1
    };
    rooms.set(room.code, room);
    index.add(room, 0, room.players[0].resumeTokenDigest);
    index.add(room, 1, room.players[1].resumeTokenDigest);
  }
  return { rooms, index };
}

function legacyFind(rooms, presented) {
  if (!Buffer.isBuffer(presented)) return null;
  for (const room of rooms.values()) {
    for (let index = 0; index < room.players.length; index += 1) {
      const player = room.players[index];
      if (player?.quickMatch !== true || player.resumeProtocol !== 1 ||
          !Buffer.isBuffer(player.resumeTokenDigest) ||
          player.resumeTokenDigest.length !== presented.length ||
          !cryptoRuntime.timingSafeEqual(player.resumeTokenDigest, presented)) continue;
      return { room, index };
    }
  }
  return null;
}

function measure(find, input, fixture) {
  let found = 0;
  const startedAt = performance.now();
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const result = find(fixture, input);
    if (result) found += result.index + 1;
  }
  return { ms: performance.now() - startedAt, found };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function runMode(name, input) {
  const fixture = createFixture();
  const finders = {
    baseline: (current, presented) => legacyFind(current.rooms, presented),
    indexed: (current, presented) => current.index.find(presented, cryptoRuntime)
  };
  for (let warmup = 0; warmup < 2; warmup += 1) {
    measure(finders.baseline, input, fixture);
    measure(finders.indexed, input, fixture);
  }
  const samples = { baseline: [], indexed: [] };
  for (let repeat = 0; repeat < REPEATS; repeat += 1) {
    const order = repeat % 2 === 0
      ? ["baseline", "indexed"]
      : ["indexed", "baseline"];
    for (const mode of order) samples[mode].push(measure(finders[mode], input, fixture));
  }
  const baselineMedianMs = median(samples.baseline.map(({ ms }) => ms));
  const indexedMedianMs = median(samples.indexed.map(({ ms }) => ms));
  return {
    mode: name,
    rooms: ROOM_COUNT,
    indexedSeats: fixture.index.size(),
    iterations: ITERATIONS,
    baselineMedianMs: Number(baselineMedianMs.toFixed(3)),
    indexedMedianMs: Number(indexedMedianMs.toFixed(3)),
    reductionPercent: Number(((1 - indexedMedianMs / baselineMedianMs) * 100).toFixed(2)),
    baselineFound: samples.baseline[0].found,
    indexedFound: samples.indexed[0].found,
    samples: {
      baselineMs: samples.baseline.map(({ ms }) => Number(ms.toFixed(3))),
      indexedMs: samples.indexed.map(({ ms }) => Number(ms.toFixed(3)))
    }
  };
}

try {
  const absent = Buffer.from([255, 255, 255, 255, ...Array(28).fill(0)]);
  const lastSeat = digest(ROOM_COUNT - 1, 1);
  console.log(JSON.stringify({
    node: process.version,
    repeats: REPEATS,
    results: [runMode("absent", absent), runMode("last-seat", lastSeat)]
  }, null, 2));
} finally {
  closeAuthoritativeServer();
}
