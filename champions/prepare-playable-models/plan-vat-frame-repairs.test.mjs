import assert from "node:assert/strict";
import { test } from "node:test";
import { planVatFrameRepairs, VatFrameRepairError } from "./plan-vat-frame-repairs.mjs";

const applyScalarPlan = (source, plan) => {
  const result = [...source];
  for (const repair of plan) {
    if (repair.strategy === "blend-authored") {
      const [before, after] = repair.donors;
      result[repair.frameOffset] = source[before] +
        (source[after] - source[before]) * repair.alpha;
    } else if (repair.strategy === "hold-authored") {
      result[repair.frameOffset] = source[repair.donors[0]];
    }
  }
  return result;
};

test("an invalid run blends directly between immutable authored endpoints", () => {
  const input = [0, 999, 999, 30];
  const forward = planVatFrameRepairs({
    clip: "cast",
    frameCount: input.length,
    invalidFrameOffsets: [1, 2]
  });
  const reversed = planVatFrameRepairs({
    clip: "cast",
    frameCount: input.length,
    invalidFrameOffsets: [2, 1]
  });

  assert.deepEqual(forward, reversed);
  assert.deepEqual(forward.map((repair) => repair.donors), [[0, 3], [0, 3]]);
  assert.deepEqual(applyScalarPlan(input, forward), [0, 10, 20, 30]);
});

test("edge repairs hold only an original donor and strict multi-frame edges fail", () => {
  const leading = planVatFrameRepairs({
    clip: "support",
    frameCount: 3,
    invalidFrameOffsets: [0, 1]
  });
  const trailing = planVatFrameRepairs({
    clip: "support",
    frameCount: 3,
    invalidFrameOffsets: [1, 2]
  });
  assert.deepEqual(leading.map((repair) => repair.donors), [[2], [2]]);
  assert.deepEqual(trailing.map((repair) => repair.donors), [[0], [0]]);
  assert.throws(
    () => planVatFrameRepairs({
      clip: "combat",
      frameCount: 3,
      invalidFrameOffsets: [0, 1],
      strictEdgeRuns: true
    }),
    (error) => error instanceof VatFrameRepairError && error.code === "UNSAFE_EDGE_RUN"
  );
});

test("a repaired frame can never become a donor or silently fail twice", () => {
  assert.throws(
    () => planVatFrameRepairs({
      clip: "cast",
      frameCount: 4,
      invalidFrameOffsets: [1],
      previouslyRepairedFrameOffsets: [1]
    }),
    (error) => error instanceof VatFrameRepairError && error.code === "REPAIRED_FRAME_INVALID"
  );

  const plan = planVatFrameRepairs({
    clip: "cast",
    frameCount: 4,
    invalidFrameOffsets: [2],
    previouslyRepairedFrameOffsets: [1]
  });
  assert.deepEqual(plan[0].donors, [0, 3]);
});

test("an all-invalid clip fails closed unless a distinct fallback is explicit", () => {
  assert.throws(
    () => planVatFrameRepairs({
      clip: "broken",
      frameCount: 3,
      invalidFrameOffsets: [0, 1, 2]
    }),
    (error) => error instanceof VatFrameRepairError && error.code === "ALL_FRAMES_INVALID"
  );

  const plan = planVatFrameRepairs({
    clip: "broken",
    frameCount: 3,
    invalidFrameOffsets: [2, 0, 1],
    fallback: { clip: "recovery", startPhase: 0.25, endPhase: 1 }
  });
  assert.deepEqual(plan.map((repair) => repair.fallbackClip), ["recovery", "recovery", "recovery"]);
  assert.deepEqual(plan.map((repair) => repair.fallbackPhase), [0.25, 0.625, 1]);
  assert.throws(
    () => planVatFrameRepairs({
      clip: "broken",
      frameCount: 3,
      invalidFrameOffsets: [0, 1, 2],
      fallback: { clip: "broken" }
    }),
    (error) => error instanceof VatFrameRepairError && error.code === "ALL_FRAMES_INVALID"
  );
});
