import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_REQUEST_BODY_BYTES,
  readJsonBodyWithinLimit,
} from "../app/api/pvp/validation.ts";

function requestFromBytes(bytes, chunkSize = 16_384) {
  const tracker = {
    bytesDelivered: 0,
    cancelled: false,
    offset: 0,
  };
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
  return {
    request: new Request("https://example.test/api/pvp", {
      body,
      duplex: "half",
      method: "POST",
    }),
    tracker,
  };
}

test("accepts a valid chunked body without Content-Length", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ action: "create" }));
  const { request, tracker } = requestFromBytes(bytes, 5);

  assert.deepEqual(await readJsonBodyWithinLimit(request), { action: "create" });
  assert.equal(tracker.bytesDelivered, bytes.byteLength);
  assert.equal(tracker.cancelled, false);
});

test("rejects an oversized chunked body before materializing the JSON", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({
    action: "create",
    offer: { type: "offer", sdp: "x".repeat(MAX_REQUEST_BODY_BYTES * 32) },
  }));
  const { request, tracker } = requestFromBytes(bytes);

  await assert.rejects(readJsonBodyWithinLimit(request), /payload_too_large/);
  assert.equal(tracker.cancelled, true);
  assert.ok(
    tracker.bytesDelivered <= MAX_REQUEST_BODY_BYTES + 16_384,
    `reader consumed ${tracker.bytesDelivered} bytes before cancellation`,
  );
  assert.ok(tracker.bytesDelivered < bytes.byteLength);
});

test("keeps the declared Content-Length fast rejection", async () => {
  const request = new Request("https://example.test/api/pvp", {
    body: "{}",
    headers: { "content-length": String(MAX_REQUEST_BODY_BYTES + 1) },
    method: "POST",
  });

  await assert.rejects(readJsonBodyWithinLimit(request), /payload_too_large/);
});
