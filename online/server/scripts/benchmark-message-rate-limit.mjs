import { performance } from "node:perf_hooks";
import { createMessageRateLimiter } from "../src/message-rate-limit.mjs";

const FLOOD_MESSAGES = 200_000;
const ALLOWED_MESSAGES = 1_000_000;
const PAIRS = 9;
const payload = Buffer.from(JSON.stringify({
  type: "action",
  kind: "ability",
  slot: 3,
  padding: "x".repeat(1024)
}));

function median(values) {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
}

function runFlood({ limited }) {
  const socket = {};
  const allow = limited
    ? createMessageRateLimiter({ now: () => 0 })
    : () => true;
  let parsed = 0;
  const started = performance.now();
  for (let index = 0; index < FLOOD_MESSAGES; index += 1) {
    if (!allow(socket)) continue;
    JSON.parse(payload.toString());
    parsed += 1;
  }
  return { durationMs: performance.now() - started, parsed };
}

function runAllowed({ limited }) {
  const socket = {};
  let now = 0;
  const allow = limited
    ? createMessageRateLimiter({
        capacity: 2,
        refillPerSecond: 1000,
        now: () => (now += 1)
      })
    : () => true;
  let admitted = 0;
  const started = performance.now();
  for (let index = 0; index < ALLOWED_MESSAGES; index += 1) {
    if (allow(socket)) admitted += 1;
  }
  return { durationMs: performance.now() - started, admitted };
}

runFlood({ limited: false });
runFlood({ limited: true });
runAllowed({ limited: false });
runAllowed({ limited: true });

const floodBefore = [];
const floodAfter = [];
const allowedBefore = [];
const allowedAfter = [];
let floodParsedBefore = 0;
let floodParsedAfter = 0;
for (let pair = 0; pair < PAIRS; pair += 1) {
  const order = pair % 2 === 0 ? [false, true] : [true, false];
  for (const limited of order) {
    const flood = runFlood({ limited });
    const allowed = runAllowed({ limited });
    (limited ? floodAfter : floodBefore).push(flood.durationMs);
    (limited ? allowedAfter : allowedBefore).push(allowed.durationMs);
    if (limited) floodParsedAfter = flood.parsed;
    else floodParsedBefore = flood.parsed;
  }
}

const beforeFloodMedian = median(floodBefore);
const afterFloodMedian = median(floodAfter);
const beforeAllowedMedian = median(allowedBefore);
const afterAllowedMedian = median(allowedAfter);
console.log(JSON.stringify({
  floodMessages: FLOOD_MESSAGES,
  pairs: PAIRS,
  flood: {
    parsedBefore: floodParsedBefore,
    parsedAfter: floodParsedAfter,
    rejectedBeforeParse: floodParsedBefore - floodParsedAfter,
    beforeMedianMs: Number(beforeFloodMedian.toFixed(3)),
    afterMedianMs: Number(afterFloodMedian.toFixed(3)),
    reductionPercent: Number(((1 - afterFloodMedian / beforeFloodMedian) * 100).toFixed(2))
  },
  allowedTraffic: {
    messages: ALLOWED_MESSAGES,
    beforeMedianMs: Number(beforeAllowedMedian.toFixed(3)),
    afterMedianMs: Number(afterAllowedMedian.toFixed(3)),
    overheadNanosecondsPerMessage: Number((((afterAllowedMedian - beforeAllowedMedian) * 1e6) / ALLOWED_MESSAGES).toFixed(3))
  }
}, null, 2));
