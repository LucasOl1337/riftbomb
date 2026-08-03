import test from "node:test";
import assert from "node:assert/strict";
import {
  createEventLoopUtilizationSampler,
  createHealthResponseCache
} from "../src/health-response.mjs";

test("reports event-loop utilization for the latest sample window", () => {
  const snapshots = [
    { active: 100, idle: 100, utilization: 0.5 },
    { active: 190, idle: 110, utilization: 0.6333 },
    { active: 190, idle: 210, utilization: 0.475 }
  ];
  const read = createEventLoopUtilizationSampler(() => snapshots.shift());

  assert.equal(read(), 0.5);
  assert.equal(read(), 0.9);
  assert.equal(read(), 0);
});

test("rejects an invalid event-loop utilization sampler", () => {
  assert.throws(() => createEventLoopUtilizationSampler(null), /read must be a function/);
});

test("reuses a serialized health response until its sample expires", () => {
  let now = 1_000;
  let collections = 0;
  const getResponse = createHealthResponseCache(() => {
    collections += 1;
    return { ok: true, sample: collections };
  }, { ttlMs: 100, now: () => now });

  const first = getResponse();
  assert.deepEqual(JSON.parse(first), { ok: true, sample: 1 });
  assert.equal(getResponse(), first);
  assert.equal(collections, 1);

  now = 1_099;
  assert.equal(getResponse(), first);
  assert.equal(collections, 1);

  now = 1_100;
  const refreshed = getResponse();
  assert.notEqual(refreshed, first);
  assert.deepEqual(JSON.parse(refreshed), { ok: true, sample: 2 });
  assert.equal(collections, 2);
});

test("rejects invalid health response cache configuration", () => {
  assert.throws(() => createHealthResponseCache(null), /collect must be a function/);
  assert.throws(() => createHealthResponseCache(() => ({}), { ttlMs: 0 }), /ttlMs/);
});
