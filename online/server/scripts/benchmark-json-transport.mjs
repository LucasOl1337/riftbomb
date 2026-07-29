import { createJsonTransport } from "../src/json-transport.mjs";

const ITERATIONS = 20_000;
const RUNS = 3;
const message = {
  type: "snapshot",
  data: {
    sequence: 1,
    time: 120.5,
    players: [
      { x: 2.5, y: 3.5, health: 100, abilities: [0, 0, 0, 0] },
      { x: 12.5, y: 11.5, health: 100, abilities: [0, 0, 0, 0] }
    ],
    bombs: Array.from({ length: 12 }, (_, index) => ({
      id: index,
      x: index % 5,
      y: index % 7,
      fuse: 1.25
    })),
    grid: Array.from({ length: 225 }, (_, index) => index % 4)
  }
};

function createSocket(counter) {
  return {
    readyState: 1,
    bufferedAmount: 0,
    send(payload) {
      counter.bytes += payload.length;
    }
  };
}

function measureLegacy() {
  const counter = { bytes: 0, serializations: 0 };
  const sockets = [createSocket(counter), createSocket(counter)];
  const startedAt = performance.now();
  for (let index = 0; index < ITERATIONS; index += 1) {
    for (const socket of sockets) {
      const payload = JSON.stringify(message);
      counter.serializations += 1;
      socket.send(payload);
    }
  }
  return { elapsedMs: performance.now() - startedAt, ...counter };
}

function measureSharedEncoding() {
  const counter = { bytes: 0, serializations: 0 };
  const sockets = [createSocket(counter), createSocket(counter)];
  const transport = createJsonTransport({
    serialize(value) {
      counter.serializations += 1;
      return JSON.stringify(value);
    }
  });
  const startedAt = performance.now();
  for (let index = 0; index < ITERATIONS; index += 1) {
    transport.broadcast(sockets, message);
  }
  return { elapsedMs: performance.now() - startedAt, ...counter };
}

for (let index = 0; index < 2_000; index += 1) {
  JSON.stringify(message);
}

const runs = Array.from({ length: RUNS }, () => ({
  before: measureLegacy(),
  after: measureSharedEncoding()
}));

function median(values) {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
}

const beforeMedianMs = median(runs.map(({ before }) => before.elapsedMs));
const afterMedianMs = median(runs.map(({ after }) => after.elapsedMs));

console.log(JSON.stringify({
  iterations: ITERATIONS,
  recipients: 2,
  payloadBytes: Buffer.byteLength(JSON.stringify(message)),
  summary: {
    serializationsBefore: runs[0].before.serializations,
    serializationsAfter: runs[0].after.serializations,
    beforeMedianMs,
    afterMedianMs,
    elapsedReductionPercent: ((beforeMedianMs - afterMedianMs) / beforeMedianMs) * 100
  },
  runs
}, null, 2));
