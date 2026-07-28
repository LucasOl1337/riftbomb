import { performance } from "node:perf_hooks";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const baseUrl = (args.get("--base-url") || "http://localhost:4173").replace(/\/$/, "");
const partCount = Number(args.get("--parts") || 1);
const runs = Number(args.get("--runs") || 3);
const mode = args.get("--mode") || "sequential";

if (!Number.isInteger(partCount) || partCount < 1) {
  throw new Error("--parts must be a positive integer");
}
if (!Number.isInteger(runs) || runs < 1) {
  throw new Error("--runs must be a positive integer");
}
if (!["sequential", "parallel"].includes(mode)) {
  throw new Error("--mode must be sequential or parallel");
}

async function fetchPart(index) {
  const name = String(index).padStart(2, "0");
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}/riftbomb-parts/part-${name}`);
  if (!response.ok) {
    throw new Error(`part-${name} returned ${response.status}`);
  }
  const text = await response.text();
  return {
    bytes: Buffer.byteLength(text),
    durationMs: performance.now() - startedAt,
    text,
  };
}

async function measureRun(run) {
  const startedAt = performance.now();
  let pieces;

  if (mode === "parallel") {
    pieces = await Promise.all(
      Array.from({ length: partCount }, (_, index) => fetchPart(index)),
    );
  } else {
    pieces = [];
    for (let index = 0; index < partCount; index += 1) {
      pieces.push(await fetchPart(index));
    }
  }

  const fetchedAt = performance.now();
  const assembled = pieces.map(({ text }) => text).join("");
  const assembledAt = performance.now();

  return {
    run,
    mode,
    parts: partCount,
    bytes: Buffer.byteLength(assembled),
    fetchMs: fetchedAt - startedAt,
    assembleMs: assembledAt - fetchedAt,
    totalMs: assembledAt - startedAt,
    slowestPartMs: Math.max(...pieces.map(({ durationMs }) => durationMs)),
  };
}

const results = [];
for (let run = 1; run <= runs; run += 1) {
  const result = await measureRun(run);
  results.push(result);
  console.log(JSON.stringify({ type: "run", ...result }));
}

const sorted = results.map(({ totalMs }) => totalMs).sort((a, b) => a - b);
const medianMs = sorted[Math.floor(sorted.length / 2)];
const summary = {
  type: "summary",
  baseUrl,
  mode,
  runs,
  parts: partCount,
  bytes: results[0].bytes,
  medianMs,
  minMs: sorted[0],
  maxMs: sorted[sorted.length - 1],
};

console.log(JSON.stringify(summary));
