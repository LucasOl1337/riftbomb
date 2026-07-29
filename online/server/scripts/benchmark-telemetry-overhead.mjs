import { performance } from "node:perf_hooks";
import { AuthoritativeRooms } from "../src/authoritative-rooms.mjs";

const ITERATIONS = 1_000_000;
const RUNS = 9;

class BaselineRooms extends AuthoritativeRooms {
  runRoomQueue(activeFlag, visit) {
    if (this[activeFlag]) return;
    this[activeFlag] = true;
    const rooms = this.rooms.values();
    const drain = () => {
      for (let count = 0; count < 8; count += 1) {
        const next = rooms.next();
        if (next.done) {
          this[activeFlag] = false;
          return;
        }
        visit(next.value);
      }
      this.scheduleImmediate(drain);
    };
    drain();
  }
}

function measure(Rooms) {
  const manager = new Rooms({ rooms: new Map(), broadcast() {} });
  const startedAt = performance.now();
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    manager.runRoomQueue("tickQueueActive", () => {});
  }
  return performance.now() - startedAt;
}

for (let warmup = 0; warmup < 3; warmup += 1) {
  measure(BaselineRooms);
  measure(AuthoritativeRooms);
}

const pairs = [];
for (let run = 0; run < RUNS; run += 1) {
  const order = run % 2 === 0
    ? [BaselineRooms, AuthoritativeRooms]
    : [AuthoritativeRooms, BaselineRooms];
  const values = new Map();
  for (const Rooms of order) values.set(Rooms, measure(Rooms));
  pairs.push({ baselineMs: values.get(BaselineRooms), observedMs: values.get(AuthoritativeRooms) });
}

const median = (values) => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
const baselineMedianMs = median(pairs.map(({ baselineMs }) => baselineMs));
const observedMedianMs = median(pairs.map(({ observedMs }) => observedMs));
const deltaNanosecondsPerCycle = (observedMedianMs - baselineMedianMs) * 1_000_000 / ITERATIONS;

console.log(JSON.stringify({
  iterationsPerRun: ITERATIONS,
  runs: RUNS,
  baselineMedianMs: Number(baselineMedianMs.toFixed(3)),
  observedMedianMs: Number(observedMedianMs.toFixed(3)),
  deltaNanosecondsPerCycle: Number(deltaNanosecondsPerCycle.toFixed(3)),
  estimatedMillisecondsPerSecondAt90Hz: Number((deltaNanosecondsPerCycle * 90 / 1_000_000).toFixed(6)),
  samples: pairs.map(({ baselineMs, observedMs }) => ({
    baselineMs: Number(baselineMs.toFixed(3)),
    observedMs: Number(observedMs.toFixed(3))
  }))
}, null, 2));
