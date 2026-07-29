import assert from "node:assert/strict";
import test from "node:test";
import { createMessageRateLimiter } from "../src/message-rate-limit.mjs";

test("bounds bursts and refills without exceeding capacity", () => {
  let now = 0;
  const allow = createMessageRateLimiter({
    capacity: 4,
    refillPerSecond: 2,
    now: () => now
  });
  const socket = {};

  assert.deepEqual(Array.from({ length: 5 }, () => allow(socket)), [true, true, true, true, false]);
  now = 499;
  assert.equal(allow(socket), false);
  now = 500;
  assert.equal(allow(socket), true);
  assert.equal(allow(socket), false);
  now = 10_000;
  assert.deepEqual(Array.from({ length: 5 }, () => allow(socket)), [true, true, true, true, false]);
});

test("keeps independent buckets per socket", () => {
  const allow = createMessageRateLimiter({ capacity: 1, refillPerSecond: 1, now: () => 0 });
  const first = {};
  const second = {};

  assert.equal(allow(first), true);
  assert.equal(allow(first), false);
  assert.equal(allow(second), true);
  assert.equal(allow(second), false);
});

test("rejects invalid configuration", () => {
  assert.throws(() => createMessageRateLimiter({ capacity: 0 }), RangeError);
  assert.throws(() => createMessageRateLimiter({ refillPerSecond: 0 }), RangeError);
});
