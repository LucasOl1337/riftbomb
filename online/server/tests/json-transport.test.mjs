import assert from "node:assert/strict";
import test from "node:test";

import { createJsonTransport } from "../src/json-transport.mjs";

function createSocket({ readyState = 1, bufferedAmount = 0 } = {}) {
  const payloads = [];
  return {
    readyState,
    bufferedAmount,
    payloads,
    send(payload) {
      payloads.push(payload);
    }
  };
}

test("serializes a broadcast once for every eligible socket", () => {
  let serializations = 0;
  const transport = createJsonTransport({
    serialize(message) {
      serializations += 1;
      return JSON.stringify(message);
    }
  });
  const host = createSocket();
  const guest = createSocket();
  const message = { type: "snapshot", sequence: 42 };

  assert.equal(transport.broadcast([host, guest], message), 2);
  assert.equal(serializations, 1);
  assert.deepEqual(host.payloads, [JSON.stringify(message)]);
  assert.deepEqual(guest.payloads, host.payloads);
});

test("preserves readiness and backpressure checks without wasted serialization", () => {
  let serializations = 0;
  const transport = createJsonTransport({
    serialize(message) {
      serializations += 1;
      return JSON.stringify(message);
    }
  });
  const closed = createSocket({ readyState: 3 });
  const saturated = createSocket({ bufferedAmount: 256_000 });

  assert.equal(transport.broadcast([closed, saturated], { type: "snapshot" }), 0);
  assert.equal(transport.send(closed, { type: "ping" }), false);
  assert.equal(transport.send(saturated, { type: "ping" }), false);
  assert.equal(serializations, 0);
  assert.deepEqual(closed.payloads, []);
  assert.deepEqual(saturated.payloads, []);
});

test("direct sends still encode each distinct message", () => {
  let serializations = 0;
  const transport = createJsonTransport({
    serialize(message) {
      serializations += 1;
      return JSON.stringify(message);
    }
  });
  const socket = createSocket();

  assert.equal(transport.send(socket, { type: "connected" }), true);
  assert.equal(transport.send(socket, { type: "ping" }), true);
  assert.equal(serializations, 2);
  assert.equal(socket.payloads.length, 2);
});
