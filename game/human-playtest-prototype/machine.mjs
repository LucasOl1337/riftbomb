// PROTOTYPE — throw away after validating the collaborative playtest state model.
// Question: can one session preserve enough context for an AI player to observe,
// hypothesize, receive human judgment, and run a focused retest without turning
// observations into confirmed bugs?

const PLAY_PHASES = new Set(["briefing", "retest_ready"]);

export function createPlaytest({ persona, goal }) {
  return {
    prototype: true,
    phase: "briefing",
    round: 0,
    persona,
    goal,
    activeStep: { observation: "", expectation: "", action: "" },
    moments: [],
    captures: [],
    hypotheses: [],
    humanNotes: [],
    retestTargets: [],
    delivery: { submitted: false, selectedFrames: [] },
  };
}

function requirePhase(state, ...allowed) {
  if (!allowed.includes(state.phase)) {
    throw new Error(`Action invalid in phase ${state.phase}; expected ${allowed.join(" or ")}`);
  }
}

function nextId(prefix, items) {
  return `${prefix}${items.length + 1}`;
}

export function transition(current, event) {
  const state = structuredClone(current);

  switch (event.type) {
    case "START_PLAY": {
      if (!PLAY_PHASES.has(state.phase)) throw new Error("Play can start only from a briefing");
      state.phase = "playing";
      state.round += 1;
      state.activeStep = { observation: "", expectation: "", action: "" };
      state.delivery = { submitted: false, selectedFrames: [] };
      return state;
    }

    case "OBSERVE":
      requirePhase(state, "playing");
      state.activeStep.observation = event.text;
      return state;

    case "EXPECT":
      requirePhase(state, "playing");
      if (!state.activeStep.observation) throw new Error("Observe before predicting");
      state.activeStep.expectation = event.text;
      return state;

    case "ACT":
      requirePhase(state, "playing");
      if (!state.activeStep.expectation) throw new Error("Write the expectation before acting");
      state.activeStep.action = event.text;
      return state;

    case "COMPARE": {
      requirePhase(state, "playing");
      const step = state.activeStep;
      if (!step.observation || !step.expectation || !step.action) {
        throw new Error("A moment requires observation, expectation, and action");
      }
      const moment = {
        id: nextId(`r${state.round}-m`, state.moments.filter((item) => item.round === state.round)),
        round: state.round,
        observation: step.observation,
        expectation: step.expectation,
        action: step.action,
        result: event.result,
        confidence: event.confidence || "medium",
        frame: event.frame || "",
      };
      state.moments.push(moment);
      if (moment.frame) state.captures.push({ id: nextId("f", state.captures), path: moment.frame, momentId: moment.id });
      state.activeStep = { observation: "", expectation: "", action: "" };
      return state;
    }

    case "CAPTURE":
      requirePhase(state, "playing", "debrief");
      state.captures.push({
        id: nextId("f", state.captures),
        path: event.path,
        label: event.label,
        momentId: event.momentId || "",
      });
      return state;

    case "END_PLAY":
      requirePhase(state, "playing");
      if (state.activeStep.observation || state.activeStep.expectation || state.activeStep.action) {
        throw new Error("Compare or discard the unfinished step before ending play");
      }
      state.phase = "debrief";
      return state;

    case "HYPOTHESIZE":
      requirePhase(state, "debrief");
      state.hypotheses.push({
        id: nextId("H", state.hypotheses),
        claim: event.claim,
        evidence: event.evidence,
        alternative: event.alternative,
        confidence: event.confidence || "medium",
        decision: "pending",
        humanReason: "",
      });
      return state;

    case "SUBMIT":
      requirePhase(state, "debrief");
      if (!state.hypotheses.length) throw new Error("Submit at least one hypothesis");
      state.phase = "awaiting_human";
      state.delivery = { submitted: true, selectedFrames: event.selectedFrames || [] };
      return state;

    case "HUMAN_NOTE":
      requirePhase(state, "awaiting_human");
      state.humanNotes.push({ round: state.round, text: event.text });
      return state;

    case "DECIDE": {
      requirePhase(state, "awaiting_human");
      const hypothesis = state.hypotheses.find((item) => item.id === event.id);
      if (!hypothesis) throw new Error(`Unknown hypothesis ${event.id}`);
      hypothesis.decision = event.decision;
      hypothesis.humanReason = event.reason;
      state.retestTargets = state.retestTargets.filter((id) => id !== hypothesis.id);
      if (event.decision === "retest") state.retestTargets.push(hypothesis.id);
      return state;
    }

    case "PREPARE_RETEST": {
      requirePhase(state, "awaiting_human");
      if (!state.retestTargets.length) throw new Error("Human must mark at least one hypothesis for retest");
      const targets = state.hypotheses.filter((item) => state.retestTargets.includes(item.id));
      state.phase = "retest_ready";
      state.goal = `Retestar: ${targets.map((item) => `${item.id} ${item.claim}`).join("; ")}`;
      return state;
    }

    case "CLOSE":
      requirePhase(state, "awaiting_human");
      if (state.retestTargets.length) throw new Error("Prepare the requested retest before closing");
      state.phase = "closed";
      return state;

    default:
      throw new Error(`Unknown event ${event.type}`);
  }
}
