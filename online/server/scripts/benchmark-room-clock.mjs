import { monitorEventLoopDelay, performance } from "node:perf_hooks";

import { AuthoritativeRooms } from "../src/authoritative-rooms.mjs";

const roomCount = Number(process.env.BENCH_ROOMS || 128);
const activeRoomCount = Math.max(0, Math.min(
  roomCount,
  Number(process.env.BENCH_ACTIVE_ROOMS || roomCount)
));
const sampleMs = Number(process.env.BENCH_MS || 2_000);
const repetitions = Number(process.env.BENCH_REPETITIONS || 3);
const warmupMs = 500;

async function measure(iteration) {
  const rooms = new Map();
  let broadcasts = 0;
  let payloadBytes = 0;
  let callbacks = 0;
  let registeredIntervals = 0;
  const manager = new AuthoritativeRooms({
    rooms,
    broadcast(_room, message) {
      const payload = JSON.stringify(message);
      broadcasts += 1;
      payloadBytes += Buffer.byteLength(payload);
    },
    scheduleInterval(callback, delay) {
      registeredIntervals += 1;
      return setInterval(() => {
        callbacks += 1;
        callback();
      }, delay);
    },
    scheduleImmediate(callback) {
      return setImmediate(() => {
        callbacks += 1;
        callback();
      });
    }
  });

  const activeRooms = [];
  for (let index = 0; index < roomCount; index += 1) {
    const room = manager.create(`R${String(index).padStart(5, "0")}`, {});
    if (index >= activeRoomCount) continue;
    room.players = [{ socket: {} }, { socket: {}, ready: true }];
    activeRooms.push(room);
  }
  for (const room of activeRooms) await manager.start(room);

  await new Promise((resolve) => setTimeout(resolve, warmupMs));
  callbacks = 0;
  broadcasts = 0;
  payloadBytes = 0;
  const delay = monitorEventLoopDelay({ resolution: 1 });
  delay.enable();
  const utilizationStart = performance.eventLoopUtilization();
  const started = performance.now();
  await new Promise((resolve) => setTimeout(resolve, sampleMs));
  const elapsedMs = performance.now() - started;
  const utilization = performance.eventLoopUtilization(utilizationStart);
  delay.disable();
  for (const room of [...rooms.values()]) manager.stop(room);

  return {
    iteration,
    rooms: roomCount,
    activeRooms: activeRoomCount,
    registeredIntervals,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    callbacks,
    broadcasts,
    expectedBroadcasts: Math.floor(activeRoomCount * sampleMs * SNAPSHOTS_PER_MS),
    payloadMiB: Number((payloadBytes / 1_048_576).toFixed(2)),
    eventLoopUtilization: Number((utilization.utilization * 100).toFixed(2)),
    delayP95Ms: Number((delay.percentile(95) / 1e6).toFixed(3)),
    delayMaxMs: Number((delay.max / 1e6).toFixed(3))
  };
}

const SNAPSHOTS_PER_MS = 30 / 1_000;
for (let iteration = 1; iteration <= repetitions; iteration += 1) {
  console.log(JSON.stringify(await measure(iteration)));
}
