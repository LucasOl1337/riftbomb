import assert from "node:assert/strict";
import test from "node:test";
import { createQuickMatchQueue } from "../src/quick-match-queue.mjs";

const sameResumeToken = (expected, presented) =>
  Buffer.isBuffer(expected) && Buffer.isBuffer(presented) && expected.equals(presented);

function entry(id, digest = null) {
  return {
    socket: { id },
    preset: { id },
    resumeClaim: digest ? { version: 1, digest } : { version: 0, digest: null }
  };
}

test("quick-match queue removes arbitrary sockets without changing FIFO order", () => {
  const queue = createQuickMatchQueue({ sameResumeToken });
  const first = entry("first");
  const removed = entry("removed");
  const last = entry("last");
  const firstNode = queue.push(first);
  queue.push(removed);
  const lastNode = queue.push(last);

  assert.equal(queue.size(), 3);
  assert.equal(queue.positionOf(lastNode), 3);
  assert.equal(queue.removeBySocket(removed.socket), true);
  assert.equal(queue.removeBySocket(removed.socket), false);
  assert.equal(queue.size(), 2);
  assert.equal(queue.positionOf(firstNode), 1);
  assert.equal(queue.positionOf(lastNode), 2);
  assert.strictEqual(queue.shift(), first);
  assert.strictEqual(queue.shift(), last);
  assert.equal(queue.shift(), null);
  assert.equal(queue.size(), 0);
});

test("bearer replacement keeps its slot and does not leave stale socket indexes", () => {
  const queue = createQuickMatchQueue({ sameResumeToken });
  const digest = Buffer.alloc(32, 7);
  const oldEntry = entry("old", digest);
  const trailing = entry("trailing");
  const node = queue.push(oldEntry);
  queue.push(trailing);

  const replacement = entry("replacement", Buffer.from(digest));
  const result = queue.replaceByResume(replacement.resumeClaim.digest, replacement, {
    timingSafeEqual: (left, right) => left.equals(right)
  });
  assert.deepEqual(result, { entry: oldEntry, position: 1 });
  assert.equal(queue.removeBySocket(oldEntry.socket), false);
  assert.equal(queue.positionOf(node), 1);
  assert.strictEqual(queue.shift(), replacement);
  assert.strictEqual(queue.shift(), trailing);
  assert.equal(queue.size(), 0);
});

test("a digest-key collision still requires the supplied constant-time comparator", () => {
  const digest = Buffer.alloc(32, 3);
  let comparisons = 0;
  const queue = createQuickMatchQueue({
    sameResumeToken(expected, presented) {
      comparisons += 1;
      return expected.equals(presented) && presented[0] === 4;
    }
  });
  queue.push(entry("queued", digest));
  const replacement = entry("replacement", Buffer.from(digest));
  assert.equal(queue.replaceByResume(replacement.resumeClaim.digest, replacement, {}), null);
  assert.equal(comparisons, 1);
  assert.equal(queue.shift().socket.id, "queued");
});
