import { performance } from "node:perf_hooks";

const SIMULATED_ROUND_TRIP_MS = 20;
const BEFORE_SEQUENCE = ["GET /api/pvp", "WebSocket hello"];
const AFTER_SEQUENCE = ["WebSocket hello"];

function waitForRoundTrip() {
  return new Promise((resolve) => {
    setTimeout(resolve, SIMULATED_ROUND_TRIP_MS);
  });
}

async function measure(sequence) {
  const start = performance.now();
  for (let step = 0; step < sequence.length; step += 1) await waitForRoundTrip();
  return Number((performance.now() - start).toFixed(3));
}

const before = [];
const after = [];
for (let run = 1; run <= 3; run += 1) {
  before.push(await measure(BEFORE_SEQUENCE));
  after.push(await measure(AFTER_SEQUENCE));
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

console.log(JSON.stringify({
  model: "sequential local transport proxy; not production latency",
  simulatedRoundTripMs: SIMULATED_ROUND_TRIP_MS,
  before: {
    requests: BEFORE_SEQUENCE.length,
    milliseconds: before,
    medianMilliseconds: median(before),
  },
  after: {
    requests: AFTER_SEQUENCE.length,
    milliseconds: after,
    medianMilliseconds: median(after),
  },
}, null, 2));
