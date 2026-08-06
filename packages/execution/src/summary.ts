/**
 * Run aggregation — counts and verdict.
 *
 * The verdict rules encode the honesty invariant: an incomplete run is never
 * reported as passed, and a single failure outweighs any number of passes.
 */

import type { CaseResult, ExitCriterionResult, RunSummary, TestRun } from "@kriteria/core";

export function summarize(results: readonly CaseResult[]): RunSummary {
  const count = (status: CaseResult["status"]) =>
    results.filter((r) => r.status === status).length;

  const pass = count("pass");
  const fail = count("fail");
  const executed = pass + fail;

  return {
    total: results.length,
    pass,
    fail,
    blocked: count("blocked"),
    skipped: count("skipped"),
    notRun: count("not-run"),
    passRate: executed === 0 ? null : Math.round((pass / executed) * 100) / 100,
  };
}

/**
 * Verdict precedence, in order:
 *
 *  1. `failed` — a case failed: evidence the software is broken.
 *  2. `incomplete` — cases remain unexecuted. This OUTRANKS unmet exit
 *     criteria, because criteria evaluated over partial data are unmet as a
 *     consequence of the gap, not of a defect. Reporting that as `failed`
 *     would blame the software for unfinished testing.
 *  3. `failed` — an exit criterion is unmet on a complete run.
 *  4. `incomplete` — nothing was executed at all.
 */
export function verdictFor(
  summary: RunSummary,
  exitCriteria: readonly ExitCriterionResult[] = [],
): TestRun["verdict"] {
  if (summary.fail > 0) return "failed";
  if (summary.notRun > 0 || summary.blocked > 0) return "incomplete";
  if (exitCriteria.some((c) => c.status === "not-met")) return "failed";
  if (summary.pass === 0) return "incomplete";
  return "passed";
}
