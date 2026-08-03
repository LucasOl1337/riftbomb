import { performance } from "node:perf_hooks";

import { createQuickMatchQueue } from "../src/quick-match-queue.mjs";

const queueSize = Number(process.env.BENCH_QUEUE_SIZE || 12_000);
const repetitions = Number(process.env.BENCH_REPETITIONS || 3);
const sameResumeToken = (expected, presented) =>
  Buffer.isBuffer(expected) && Buffer.isBuffer(presented) && expected.equals(presented);

function createEntry(index) {
  return { socket: { index }, resumeClaim: { version: 0, digest: null } };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function baselineCancel() {
  const entries = Array.from({ length: queueSize }, (_, index) => createEntry(index));
  let removed = 0;
  const startedAt = performance.now();
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const socket = entries[index].socket;
    const found = entries.findIndex((entry) => entry.socket === socket);
    if (found >= 0) {
      entries.splice(found, 1);
      removed += 1;
    }
  }
  return { ms: performance.now() - startedAt, operations: removed, remaining: entries.length };
}

function indexedCancel() {
  const queue = createQuickMatchQueue({ sameResumeToken });
  const entries = Array.from({ length: queueSize }, (_, index) => createEntry(index));
  for (const entry of entries) queue.push(entry);
  let removed = 0;
  const startedAt = performance.now();
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (queue.removeBySocket(entries[index].socket)) removed += 1;
  }
  return { ms: performance.now() - startedAt, operations: removed, remaining: queue.size() };
}

function baselineMatch() {
  const entries = Array.from({ length: queueSize }, (_, index) => createEntry(index));
  let consumed = 0;
  const startedAt = performance.now();
  while (entries.length) consumed += entries.shift().socket.index + 1;
  return { ms: performance.now() - startedAt, operations: consumed, remaining: entries.length };
}

function indexedMatch() {
  const queue = createQuickMatchQueue({ sameResumeToken });
  for (let index = 0; index < queueSize; index += 1) queue.push(createEntry(index));
  let consumed = 0;
  const startedAt = performance.now();
  let current;
  while ((current = queue.shift())) consumed += current.socket.index + 1;
  return { ms: performance.now() - startedAt, operations: consumed, remaining: queue.size() };
}

function runWorkload(name, baseline, indexed) {
  for (let warmup = 0; warmup < 2; warmup += 1) {
    baseline();
    indexed();
  }
  const samples = { baseline: [], indexed: [] };
  for (let repeat = 0; repeat < repetitions; repeat += 1) {
    const order = repeat % 2 === 0 ? ["baseline", "indexed"] : ["indexed", "baseline"];
    for (const mode of order) {
      const result = mode === "baseline" ? baseline() : indexed();
      samples[mode].push(result);
    }
  }
  const baselineMedianMs = median(samples.baseline.map(({ ms }) => ms));
  const indexedMedianMs = median(samples.indexed.map(({ ms }) => ms));
  return {
    workload: name,
    queueSize,
    repetitions,
    baselineMedianMs: Number(baselineMedianMs.toFixed(3)),
    indexedMedianMs: Number(indexedMedianMs.toFixed(3)),
    reductionPercent: Number(((1 - indexedMedianMs / baselineMedianMs) * 100).toFixed(2)),
    baselineOperations: samples.baseline[0].operations,
    indexedOperations: samples.indexed[0].operations,
    baselineRemaining: samples.baseline[0].remaining,
    indexedRemaining: samples.indexed[0].remaining,
    baselineSamplesMs: samples.baseline.map(({ ms }) => Number(ms.toFixed(3))),
    indexedSamplesMs: samples.indexed.map(({ ms }) => Number(ms.toFixed(3)))
  };
}

console.log(JSON.stringify({
  node: process.version,
  results: [
    runWorkload("cancel-from-tail", baselineCancel, indexedCancel),
    runWorkload("fifo-pairing", baselineMatch, indexedMatch)
  ]
}, null, 2));
