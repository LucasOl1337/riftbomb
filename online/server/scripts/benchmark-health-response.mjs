import { performance } from "node:perf_hooks";
import {
  createEventLoopUtilizationSampler,
  createHealthResponseCache
} from "../src/health-response.mjs";

const ITERATIONS = 2_000_000;
const RUNS = 5;
const PAYLOAD = {
  ok: true,
  rooms: 32,
  quickMatchWaiting: 2,
  authority: "server",
  region: "sa-saopaulo-1",
  performance: {
    activeMatches: 32,
    tickClockActive: true,
    snapshotClockActive: true,
    tickCycles: 128_000,
    skippedTickCycles: 2,
    snapshotCycles: 64_000,
    skippedSnapshotCycles: 1,
    snapshotsProduced: 2_048_000,
    webSocketClients: 64,
    eventLoopUtilization: 0.1234
  }
};

function measureUncached() {
  let checksum = 0;
  const startedAt = performance.now();
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    checksum += JSON.stringify(PAYLOAD).length;
  }
  return { elapsedMs: performance.now() - startedAt, checksum, collections: ITERATIONS };
}

function measureCached() {
  let checksum = 0;
  let collections = 0;
  let now = 0;
  const getResponse = createHealthResponseCache(() => {
    collections += 1;
    return PAYLOAD;
  }, { now: () => now });
  const startedAt = performance.now();
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    checksum += getResponse().length;
  }
  return { elapsedMs: performance.now() - startedAt, checksum, collections };
}

function measureWindowedUtilization() {
  const snapshots = [
    { active: 100, idle: 100, utilization: 0.5 },
    { active: 190, idle: 110, utilization: 0.6333 }
  ];
  const cumulativeSecond = snapshots[1].utilization;
  const read = createEventLoopUtilizationSampler(() => snapshots.shift());
  const first = read();
  const second = read();
  return { first, cumulativeSecond, windowedSecond: second };
}

for (let warmup = 0; warmup < 2; warmup += 1) {
  measureUncached();
  measureCached();
}

const pairs = [];
for (let run = 0; run < RUNS; run += 1) {
  const order = run % 2 === 0
    ? [measureUncached, measureCached]
    : [measureCached, measureUncached];
  const measured = order.map((measure) => measure());
  const uncached = measured.find(({ collections }) => collections === ITERATIONS);
  const cached = measured.find(({ collections }) => collections === 1);
  pairs.push({ uncached, cached });
}

const median = (values) => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
const uncachedMedianMs = median(pairs.map(({ uncached }) => uncached.elapsedMs));
const cachedMedianMs = median(pairs.map(({ cached }) => cached.elapsedMs));

console.log(JSON.stringify({
  iterationsPerRun: ITERATIONS,
  runs: RUNS,
  uncachedMedianMs: Number(uncachedMedianMs.toFixed(3)),
  cachedMedianMs: Number(cachedMedianMs.toFixed(3)),
  reductionPercent: Number(((1 - cachedMedianMs / uncachedMedianMs) * 100).toFixed(2)),
  uncachedCollections: pairs[0].uncached.collections,
  cachedCollections: pairs[0].cached.collections,
  payloadBytes: pairs[0].uncached.checksum / ITERATIONS,
  checksumsPreserved: pairs.every(({ uncached, cached }) => uncached.checksum === cached.checksum),
  windowedUtilization: measureWindowedUtilization(),
  samples: pairs.map(({ uncached, cached }) => ({
    uncachedMs: Number(uncached.elapsedMs.toFixed(3)),
    cachedMs: Number(cached.elapsedMs.toFixed(3))
  }))
}, null, 2));
