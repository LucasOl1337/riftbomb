export class VatFrameRepairError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "VatFrameRepairError";
    this.code = code;
  }
}

const sortedUniqueOffsets = (offsets, frameCount, label) => {
  const values = [...new Set(offsets)].sort((a, b) => a - b);
  for (const offset of values) {
    if (!Number.isInteger(offset) || offset < 0 || offset >= frameCount) {
      throw new VatFrameRepairError(
        "OFFSET_OUT_OF_RANGE",
        `${label} frame offset ${offset} is outside 0..${frameCount - 1}`
      );
    }
  }
  return values;
};

const invalidRuns = (invalidOffsets) => {
  const runs = [];
  for (const offset of invalidOffsets) {
    const current = runs.at(-1);
    if (current && offset === current.at(-1) + 1) current.push(offset);
    else runs.push([offset]);
  }
  return runs;
};

export const planVatFrameRepairs = ({
  clip,
  frameCount,
  invalidFrameOffsets,
  previouslyRepairedFrameOffsets = [],
  strictEdgeRuns = false,
  fallback = null
}) => {
  if (!Number.isInteger(frameCount) || frameCount < 1) {
    throw new VatFrameRepairError("INVALID_FRAME_COUNT", `${clip} has invalid frameCount ${frameCount}`);
  }

  const invalid = sortedUniqueOffsets(invalidFrameOffsets, frameCount, `${clip} invalid`);
  const previouslyRepaired = sortedUniqueOffsets(
    previouslyRepairedFrameOffsets,
    frameCount,
    `${clip} previously repaired`
  );
  const previousSet = new Set(previouslyRepaired);
  const repeatedFailure = invalid.find((offset) => previousSet.has(offset));
  if (repeatedFailure !== undefined) {
    throw new VatFrameRepairError(
      "REPAIRED_FRAME_INVALID",
      `${clip}:${repeatedFailure} failed validation after it was repaired`
    );
  }
  if (!invalid.length) return [];

  const invalidSet = new Set(invalid);
  const authoredEligible = Array.from({ length: frameCount }, (_value, offset) => offset)
    .filter((offset) => !invalidSet.has(offset) && !previousSet.has(offset));

  if (!authoredEligible.length) {
    if (!fallback?.clip || fallback.clip === clip) {
      throw new VatFrameRepairError(
        "ALL_FRAMES_INVALID",
        `${clip} has no authored donor and no distinct explicit fallback clip`
      );
    }
    const startPhase = fallback.startPhase ?? 0;
    const endPhase = fallback.endPhase ?? 1;
    if (![startPhase, endPhase].every(Number.isFinite) ||
        startPhase < 0 || endPhase > 1 || endPhase <= startPhase) {
      throw new VatFrameRepairError(
        "INVALID_FALLBACK_WINDOW",
        `${clip} fallback ${fallback.clip} has invalid phase window ${startPhase}..${endPhase}`
      );
    }
    return invalid.map((frameOffset) => {
      const phase = frameCount === 1 ? 0 : frameOffset / (frameCount - 1);
      return {
        clip,
        frameOffset,
        strategy: "fallback-clip",
        donors: [],
        fallbackClip: fallback.clip,
        fallbackPhase: startPhase + (endPhase - startPhase) * phase
      };
    });
  }

  const plan = [];
  for (const run of invalidRuns(invalid)) {
    const first = run[0];
    const last = run.at(-1);
    const before = authoredEligible.filter((offset) => offset < first).at(-1);
    const after = authoredEligible.find((offset) => offset > last);
    if (before !== undefined && after !== undefined) {
      for (const frameOffset of run) {
        plan.push({
          clip,
          frameOffset,
          strategy: "blend-authored",
          donors: [before, after],
          alpha: (frameOffset - before) / (after - before)
        });
      }
      continue;
    }

    const donor = before ?? after;
    if (donor === undefined || (strictEdgeRuns && run.length > 1)) {
      throw new VatFrameRepairError(
        "UNSAFE_EDGE_RUN",
        `${clip} has ${run.length} invalid edge frames without two authored donors`
      );
    }
    for (const frameOffset of run) {
      plan.push({
        clip,
        frameOffset,
        strategy: "hold-authored",
        donors: [donor]
      });
    }
  }
  return plan.sort((a, b) => a.frameOffset - b.frameOffset);
};
