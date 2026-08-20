import assert from "node:assert/strict";
import test from "node:test";

import { runCpuDuels } from "./run-cpu-duels.mjs";

const MATCHES = 3;
const SEED = 42;

function assertReportShape(report) {
  assert.equal(report.seed, SEED);
  assert.equal(report.matches, MATCHES);
  assert.equal(report.v1.champion, "renekton");
  assert.equal(report.v1.player, 2);
  assert.equal(report.opponent.policy, "baseline");
  assert.equal(report.opponent.player, 1);
  for (const field of ["v1MatchWins", "baselineMatchWins", "drawnMatches",
    "rounds", "v1RoundWins", "v1RoundLosses", "drawnRounds", "timeouts",
    "v1OwnBombDeaths"]) {
    assert.ok(Number.isInteger(report[field]) && report[field] >= 0, `${field} must be a non-negative integer`);
  }
  assert.ok(report.v1WinRate >= 0 && report.v1WinRate <= 1, "v1WinRate within [0, 1]");
  assert.ok(report.v1FirstBombSurvivalRate === null ||
    (report.v1FirstBombSurvivalRate >= 0 && report.v1FirstBombSurvivalRate <= 1));
  assert.ok(report.v1PickupsPerRound >= 0);
  assert.ok(report.averageRoundSeconds > 0);
  assert.deepEqual(Object.keys(report.v1SkillsCast).sort(), ["e", "q", "r", "w"]);
  for (const count of Object.values(report.v1SkillsCast)) {
    assert.ok(Number.isInteger(count) && count >= 0);
  }
}

function assertReportConsistency(report) {
  // Match outcomes partition the match count; round outcomes partition the round count.
  assert.equal(report.v1MatchWins + report.baselineMatchWins + report.drawnMatches, report.matches);
  assert.equal(report.v1RoundWins + report.v1RoundLosses + report.drawnRounds, report.rounds);
  assert.ok(Math.abs(report.v1WinRate - Number((report.v1MatchWins / report.matches).toFixed(4))) < 1e-9);
}

test("cpu duels harness completes and reports the promised metrics", async () => {
  const report = await runCpuDuels({ matches: MATCHES, seed: SEED });
  assertReportShape(report);
  assertReportConsistency(report);
  assert.ok(report.rounds >= MATCHES, "every match played at least one round");
});

test("cpu duels are deterministic for a fixed seed", async () => {
  const first = await runCpuDuels({ matches: MATCHES, seed: SEED });
  const second = await runCpuDuels({ matches: MATCHES, seed: SEED });
  assert.deepEqual(second, first);
});

test("a different seed produces a different run", async () => {
  const base = await runCpuDuels({ matches: MATCHES, seed: SEED });
  const other = await runCpuDuels({ matches: MATCHES, seed: SEED + 1 });
  assert.notDeepEqual(other, base);
});
