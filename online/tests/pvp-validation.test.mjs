import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_SDP_LENGTH,
  normalizeCode,
  validCode,
  validatePostAction,
} from "../app/api/pvp/validation.ts";

const offer = { type: "offer", sdp: "offer-sdp" };
const hostToken = "h".repeat(32);

test("normalizes and validates room codes without accepting ambiguous symbols", () => {
  assert.equal(normalizeCode(" abC234 "), "ABC234");
  assert.equal(validCode("ABC234"), true);
  assert.equal(validCode("ABC230"), false);
  assert.equal(validCode("ABC2345"), false);
});

test("accepts create with or without an offer", () => {
  assert.equal(validatePostAction({ action: "create" }), null);
  assert.equal(validatePostAction({ action: "create", offer }), null);
});

test("rejects malformed session descriptions before database work", () => {
  assert.equal(
    validatePostAction({ action: "create", offer: { type: "answer", sdp: "wrong" } }),
    "invalid_offer",
  );
  assert.equal(
    validatePostAction({
      action: "answer",
      code: "ABC234",
      answer: { type: "answer", sdp: "x".repeat(MAX_SDP_LENGTH + 1) },
    }),
    "invalid_answer",
  );
});

test("preserves publish-offer and close validation contracts", () => {
  assert.equal(
    validatePostAction({ action: "publish-offer", code: "ABC234", hostToken, offer }),
    null,
  );
  assert.equal(
    validatePostAction({ action: "publish-offer", code: "ABC234", hostToken: "short", offer }),
    "invalid_offer",
  );
  assert.equal(validatePostAction({ action: "close", code: "ABC234", hostToken }), null);
  assert.equal(validatePostAction({ action: "close", code: "ABC234" }), "invalid_room");
});

test("returns the existing error for unknown actions", () => {
  assert.equal(validatePostAction({ action: "unknown" }), "unknown_action");
});
