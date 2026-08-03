import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const gameDirectory = path.dirname(fileURLToPath(import.meta.url));
const particleSource = await readFile(path.join(gameDirectory, "run-champion-bomb-duel.js"), "utf8");
const helperStart = particleSource.indexOf("    function compactLiveParticles(");
const helperEnd = particleSource.indexOf("\n\n    class Game", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, "particle compaction helper must remain extractable");

const compactLiveParticles = vm.runInThisContext(
  `(${particleSource.slice(helperStart, helperEnd).trim()})`
);

const PARTICLE_COUNT = Number(process.env.BENCH_PARTICLE_COUNT || 520);
const PASSES = Number(process.env.BENCH_PARTICLE_PASSES || 40_000);
const REPETITIONS = Number(process.env.BENCH_PARTICLE_REPETITIONS || 3);
const liveFixture = Array.from({ length: PARTICLE_COUNT }, (_, index) => ({
  id: index,
  age: index % 4 === 0 ? 1 : 0.1,
  life: 1,
  y: index % 7 === 0 ? -0.21 : 0.5
}));
const expectedLiveCount = liveFixture.filter((particle) => (
  particle.age < particle.life && particle.y > -0.2
)).length;

function legacyFilter(particles) {
  return particles.filter((particle) => particle.age < particle.life && particle.y > -0.2);
}

function measure(compactor) {
  global.gc?.();
  const particles = new Array(PARTICLE_COUNT);
  let checksum = 0;
  const started = performance.now();
  for (let pass = 0; pass < PASSES; pass += 1) {
    for (let index = 0; index < PARTICLE_COUNT; index += 1) particles[index] = liveFixture[index];
    particles.length = PARTICLE_COUNT;
    const live = compactor(particles);
    checksum += live.length + live[pass % expectedLiveCount].id;
  }
  const elapsedMs = performance.now() - started;
  global.gc?.();
  return {
    elapsedMs,
    checksum,
    finalLength: particles.length,
    heapUsed: process.memoryUsage().heapUsed
  };
}

const before = (particles) => legacyFilter(particles);
const after = (particles) => compactLiveParticles(particles);

// Warm both paths before collecting samples so the comparison is not dominated
// by first-call compilation.
measure(before);
measure(after);

const beforeSamples = [];
const afterSamples = [];
for (let repetition = 0; repetition < REPETITIONS; repetition += 1) {
  const beforeFirst = repetition % 2 === 0;
  const first = beforeFirst ? measure(before) : measure(after);
  const second = beforeFirst ? measure(after) : measure(before);
  beforeSamples.push(beforeFirst ? first : second);
  afterSamples.push(beforeFirst ? second : first);
}

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};
const beforeMs = median(beforeSamples.map(({ elapsedMs }) => elapsedMs));
const afterMs = median(afterSamples.map(({ elapsedMs }) => elapsedMs));
const checksum = beforeSamples.every(({ checksum: value }) => value === afterSamples[0].checksum) &&
  afterSamples.every(({ checksum: value }) => value === afterSamples[0].checksum);

assert.equal(beforeSamples.every(({ finalLength }) => finalLength === PARTICLE_COUNT), true);
assert.equal(afterSamples.every(({ finalLength }) => finalLength === expectedLiveCount), true);
assert.equal(checksum, true);

console.log(JSON.stringify({
  node: process.version,
  particleCount: PARTICLE_COUNT,
  expectedLiveCount,
  passes: PASSES,
  repetitions: REPETITIONS,
  beforeMs: Number(beforeMs.toFixed(3)),
  afterMs: Number(afterMs.toFixed(3)),
  speedup: Number((beforeMs / afterMs).toFixed(2)),
  arraysMaterializedBefore: PARTICLE_COUNT > 0 ? PASSES : 0,
  arraysMaterializedAfter: 0,
  heapUsedBeforeBytes: median(beforeSamples.map(({ heapUsed }) => heapUsed)),
  heapUsedAfterBytes: median(afterSamples.map(({ heapUsed }) => heapUsed)),
  checksumPreserved: checksum
}));
