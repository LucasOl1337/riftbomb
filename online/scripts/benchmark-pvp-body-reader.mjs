import { performance } from "node:perf_hooks";

import {
  MAX_REQUEST_BODY_BYTES,
  readJsonBodyWithinLimit,
} from "../app/api/pvp/validation.ts";

const SMALL_RUNS = 2_000;
const LARGE_RUNS = 10;
const SMALL_BYTES = new TextEncoder().encode(JSON.stringify({ action: "create" }));
const LARGE_BYTES = new TextEncoder().encode(JSON.stringify({
  action: "create",
  offer: { type: "offer", sdp: "x".repeat(2_000_000) },
}));

function makeRequest(bytes, chunkSize, tracker) {
  const body = new ReadableStream({
    pull(controller) {
      if (tracker.offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      const end = Math.min(bytes.byteLength, tracker.offset + chunkSize);
      controller.enqueue(bytes.slice(tracker.offset, end));
      tracker.bytesDelivered += end - tracker.offset;
      tracker.offset = end;
    },
    cancel() {
      tracker.cancelled = true;
    },
  });
  return new Request("https://example.test/api/pvp", {
    body,
    duplex: "half",
    method: "POST",
  });
}

async function legacyRead(request) {
  return request.json();
}

async function guardedRead(request) {
  try {
    await readJsonBodyWithinLimit(request);
    return "accepted";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function median(values) {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
}

async function measureValidLegacy() {
  const samples = [];
  for (let pair = 0; pair < 5; pair += 1) {
    const started = performance.now();
    for (let run = 0; run < SMALL_RUNS; run += 1) {
      await legacyRead(makeRequest(SMALL_BYTES, 256, {
        bytesDelivered: 0,
        cancelled: false,
        offset: 0,
      }));
    }
    samples.push(performance.now() - started);
  }
  return samples;
}

async function measureValidGuarded() {
  const samples = [];
  for (let pair = 0; pair < 5; pair += 1) {
    const started = performance.now();
    for (let run = 0; run < SMALL_RUNS; run += 1) {
      const result = await guardedRead(makeRequest(SMALL_BYTES, 256, {
        bytesDelivered: 0,
        cancelled: false,
        offset: 0,
      }));
      if (result !== "accepted") throw new Error(result);
    }
    samples.push(performance.now() - started);
  }
  return samples;
}

async function measureOversizedLegacy() {
  const samples = [];
  let bytesDelivered = 0;
  for (let run = 0; run < LARGE_RUNS; run += 1) {
    const tracker = { bytesDelivered: 0, cancelled: false, offset: 0 };
    const started = performance.now();
    await legacyRead(makeRequest(LARGE_BYTES, 16_384, tracker));
    samples.push(performance.now() - started);
    bytesDelivered += tracker.bytesDelivered;
  }
  return { bytesDelivered, samples };
}

async function measureOversizedGuarded() {
  const samples = [];
  let bytesDelivered = 0;
  let rejected = 0;
  let cancelled = 0;
  for (let run = 0; run < LARGE_RUNS; run += 1) {
    const tracker = { bytesDelivered: 0, cancelled: false, offset: 0 };
    const started = performance.now();
    const result = await guardedRead(makeRequest(LARGE_BYTES, 16_384, tracker));
    samples.push(performance.now() - started);
    bytesDelivered += tracker.bytesDelivered;
    rejected += result === "payload_too_large" ? 1 : 0;
    cancelled += tracker.cancelled ? 1 : 0;
  }
  return { bytesDelivered, cancelled, rejected, samples };
}

await measureValidLegacy();
await measureValidGuarded();
await measureOversizedLegacy();
await measureOversizedGuarded();

const validBefore = await measureValidLegacy();
const validAfter = await measureValidGuarded();
const oversizedBefore = await measureOversizedLegacy();
const oversizedAfter = await measureOversizedGuarded();
const rounded = (value) => Number(value.toFixed(3));
console.log(JSON.stringify({
  maxRequestBodyBytes: MAX_REQUEST_BODY_BYTES,
  validChunked: {
    bodyBytes: SMALL_BYTES.byteLength,
    runsPerSample: SMALL_RUNS,
    beforeMedianMs: rounded(median(validBefore)),
    afterMedianMs: rounded(median(validAfter)),
    overheadPercent: rounded((median(validAfter) / median(validBefore) - 1) * 100),
  },
  oversizedChunked: {
    bodyBytes: LARGE_BYTES.byteLength,
    runs: LARGE_RUNS,
    beforeMedianMs: rounded(median(oversizedBefore.samples)),
    afterMedianMs: rounded(median(oversizedAfter.samples)),
    beforeBytesDelivered: Math.round(oversizedBefore.bytesDelivered / LARGE_RUNS),
    afterBytesDelivered: Math.round(oversizedAfter.bytesDelivered / LARGE_RUNS),
    bytesReductionPercent: rounded((1 - oversizedAfter.bytesDelivered / oversizedBefore.bytesDelivered) * 100),
    rejected: oversizedAfter.rejected,
    cancelled: oversizedAfter.cancelled,
  },
}, null, 2));
