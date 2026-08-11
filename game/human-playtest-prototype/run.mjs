#!/usr/bin/env node
// PROTOTYPE — terminal shell for the collaborative human-like playtest model.

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createPlaytest, transition } from "./machine.mjs";

const bold = "\x1b[1m";
const dim = "\x1b[2m";
const reset = "\x1b[0m";

let state = createPlaytest({
  persona: "Jogador novo, familiar com jogos de ação, mas não com Riftbomb",
  goal: "Entrar numa partida offline, mover-se, usar três bombas e interpretar a primeira morte ou vitória",
});
let notice = "Prototype ready. Start the first play round.";

function lines(items, empty = "(none)") {
  return items.length ? items.join("\n") : empty;
}

function render({ clear = true } = {}) {
  if (clear && output.isTTY) console.clear();
  const momentRows = state.moments.map(
    (item) =>
      `  ${item.id} [round ${item.round}] ${item.action}\n` +
      `     expected: ${item.expectation}\n` +
      `     observed: ${item.result}${item.frame ? `\n     frame: ${item.frame}` : ""}`,
  );
  const hypothesisRows = state.hypotheses.map(
    (item) =>
      `  ${item.id} [${item.decision}/${item.confidence}] ${item.claim}\n` +
      `     evidence: ${item.evidence}\n` +
      `     alternative: ${item.alternative || "(none)"}` +
      (item.humanReason ? `\n     human: ${item.humanReason}` : ""),
  );

  output.write(`\n${bold}HUMAN PLAYTEST — LOGIC PROTOTYPE${reset}  ${dim}(throwaway; no browser, LLM, files, or persistence)${reset}\n`);
  output.write(`${bold}phase${reset}: ${state.phase}    ${bold}round${reset}: ${state.round}\n`);
  output.write(`${bold}persona${reset}: ${state.persona}\n`);
  output.write(`${bold}goal${reset}: ${state.goal}\n`);
  output.write(`${bold}active step${reset}: ${JSON.stringify(state.activeStep)}\n`);
  output.write(`${bold}moments${reset}:\n${lines(momentRows)}\n`);
  output.write(`${bold}captures${reset}: ${lines(state.captures.map((item) => `${item.id}:${item.path}`), "(none)")}\n`);
  output.write(`${bold}hypotheses${reset}:\n${lines(hypothesisRows)}\n`);
  output.write(`${bold}human notes${reset}: ${lines(state.humanNotes.map((item) => `[r${item.round}] ${item.text}`), "(none)")}\n`);
  output.write(`${bold}retest targets${reset}: ${state.retestTargets.join(", ") || "(none)"}\n`);
  output.write(`${bold}delivery${reset}: ${JSON.stringify(state.delivery)}\n`);
  output.write(`\n${bold}last result${reset}: ${notice}\n`);
  output.write(
    `\n${bold}s${reset}${dim} start play${reset}  ${bold}o${reset}${dim} observe${reset}  ${bold}e${reset}${dim} expect${reset}  ` +
      `${bold}a${reset}${dim} act${reset}  ${bold}c${reset}${dim} compare${reset}  ${bold}p${reset}${dim} capture${reset}\n` +
      `${bold}x${reset}${dim} end play${reset}  ${bold}h${reset}${dim} hypothesize${reset}  ${bold}u${reset}${dim} submit to Hermes${reset}  ` +
      `${bold}n${reset}${dim} human note${reset}  ${bold}d${reset}${dim} human decision${reset}  ${bold}r${reset}${dim} prepare retest${reset}  ` +
      `${bold}z${reset}${dim} close${reset}  ${bold}q${reset}${dim} quit${reset}\n`,
  );
}

function apply(event, label) {
  try {
    state = transition(state, event);
    notice = label;
  } catch (error) {
    notice = `BLOCKED: ${error.message}`;
  }
}

async function interactive() {
  const rl = createInterface({ input, output });
  render();
  while (true) {
    const command = (await rl.question("\ncommand> ")).trim().toLowerCase();
    if (command === "q") break;

    if (command === "s") apply({ type: "START_PLAY" }, "Play round started");
    else if (command === "o") apply({ type: "OBSERVE", text: await rl.question("visible observation> ") }, "Observation recorded");
    else if (command === "e") apply({ type: "EXPECT", text: await rl.question("expectation before action> ") }, "Expectation locked before action");
    else if (command === "a") apply({ type: "ACT", text: await rl.question("human-surface action> ") }, "Action recorded");
    else if (command === "c") {
      const result = await rl.question("visible result> ");
      const frame = await rl.question("frame path (optional)> ");
      apply({ type: "COMPARE", result, frame }, "Moment compared and recorded");
    } else if (command === "p") {
      const path = await rl.question("frame path> ");
      const label = await rl.question("why this frame matters> ");
      apply({ type: "CAPTURE", path, label }, "Evidence frame captured");
    } else if (command === "x") apply({ type: "END_PLAY" }, "Play ended; AI now changes from player to critic");
    else if (command === "h") {
      const claim = await rl.question("hypothesis (not a confirmed bug)> ");
      const evidence = await rl.question("evidence IDs> ");
      const alternative = await rl.question("plausible alternative> ");
      apply({ type: "HYPOTHESIZE", claim, evidence, alternative }, "Hypothesis proposed for human judgment");
    } else if (command === "u") {
      const selectedFrames = (await rl.question("frame IDs for Hermes, comma-separated> ")).split(",").map((item) => item.trim()).filter(Boolean);
      apply({ type: "SUBMIT", selectedFrames }, "Evidence and hypotheses submitted to the Hermes chat");
    } else if (command === "n") apply({ type: "HUMAN_NOTE", text: await rl.question("human complement> ") }, "Human context added");
    else if (command === "d") {
      const id = await rl.question("hypothesis ID> ");
      const decision = await rl.question("decision (accepted/rejected/retest/parked)> ");
      const reason = await rl.question("human reason> ");
      apply({ type: "DECIDE", id, decision, reason }, `Human decided ${id}: ${decision}`);
    } else if (command === "r") apply({ type: "PREPARE_RETEST" }, "Focused retest brief prepared from human-selected hypotheses");
    else if (command === "z") apply({ type: "CLOSE" }, "Collaborative playtest closed");
    else notice = `Unknown command: ${command || "(empty)"}`;

    render();
  }
  rl.close();
}

function demo() {
  const events = [
    [{ type: "START_PLAY" }, "AI enters player mode"],
    [{ type: "OBSERVE", text: "War Table shows Quick Match and offline play" }, "AI records only visible facts"],
    [{ type: "EXPECT", text: "Quick Match should visibly confirm that matchmaking started" }, "Expectation locked before action"],
    [{ type: "ACT", text: "Click Quick Match" }, "Human-surface action chosen"],
    [{ type: "COMPARE", result: "The screen changes subtly; queue state is unclear", frame: "frames/007-queue.png" }, "First evidence moment"],
    [{ type: "END_PLAY" }, "AI leaves player mode"],
    [{ type: "HYPOTHESIZE", claim: "Quick Match feedback may be too subtle for a new player", evidence: "r1-m1, f1", alternative: "The feedback is intentionally restrained and still sufficient" }, "Suspicion remains a hypothesis"],
    [{ type: "SUBMIT", selectedFrames: ["f1"] }, "Round delivered to Hermes"],
    [{ type: "HUMAN_NOTE", text: "Do not treat subtlety itself as a bug; retest whether status is understandable after waiting" }, "Lucas complements the model"],
    [{ type: "DECIDE", id: "H1", decision: "retest", reason: "Need evidence after the normal waiting interval" }, "Human requests a focused retest"],
    [{ type: "PREPARE_RETEST" }, "Retest inherits the disputed hypothesis"],
    [{ type: "START_PLAY" }, "AI enters player mode with the retest goal"],
    [{ type: "OBSERVE", text: "After Quick Match, a small search status remains near the mode controls" }, "Retest observes the disputed state"],
    [{ type: "EXPECT", text: "After five seconds I should know whether search is active and how to cancel" }, "Retest expectation locked"],
    [{ type: "ACT", text: "Wait five seconds without interacting" }, "AI behaves as a real uncertain player"],
    [{ type: "COMPARE", result: "Search status and cancel affordance become understandable", frame: "frames/019-queue-wait.png" }, "Retest produces contrary evidence"],
    [{ type: "END_PLAY" }, "Retest ends"],
    [{ type: "SUBMIT", selectedFrames: ["f1", "f2"] }, "Retest delivered to Hermes"],
    [{ type: "HUMAN_NOTE", text: "The delayed state is acceptable; no product change" }, "Human resolves the hypothesis"],
    [{ type: "DECIDE", id: "H1", decision: "rejected", reason: "Focused retest showed a learnable and cancellable queue state" }, "Hypothesis rejected, not silently deleted"],
    [{ type: "CLOSE" }, "Session closes with evidence and decision intact"],
  ];

  for (const [event, label] of events) {
    state = transition(state, event);
    notice = label;
  }
  render({ clear: false });
}

if (process.argv.includes("--demo")) demo();
else await interactive();
