/**
 * TestRun — the execution record. ISTQB's "test execution" and "test
 * completion" phases made into a contract.
 *
 * Two invariants drive the whole design:
 *  1. **Honest partial results.** A case that was not executed is `not-run`
 *     with a reason. Nothing is ever inferred as passed.
 *  2. **Evidence by reference.** Screenshots and logs are referenced by path
 *     and SHA-256 digest, never inlined — same boundary rule as ingest.
 */

import { EXECUTION_MODES } from "@kriteria/istqb";
import { z } from "zod/v4";

export const STEP_STATUSES = ["pass", "fail", "blocked", "skipped"] as const;
export const CASE_STATUSES = [...STEP_STATUSES, "not-run"] as const;

export const StepResultSchema = z.object({
  /** 0-based index into the case's steps. */
  index: z.number().int().min(0),
  status: z.enum(STEP_STATUSES),
  /** What actually happened. Required when the step did not pass. */
  actual: z.string().optional(),
  notes: z.string().optional(),
});
export type StepResult = z.infer<typeof StepResultSchema>;

export const EvidenceRefSchema = z.object({
  kind: z.enum(["screenshot", "log", "file", "note"]),
  description: z.string().min(1),
  /** Path on disk, relative to the run directory. Absent for pure notes. */
  path: z.string().optional(),
  /** Digest of the referenced file — makes evidence tamper-evident. */
  sha256: z.string().optional(),
});
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

export const ObservedDefectSchema = z.object({
  id: z.string().regex(/^DEF-\d+$/),
  summary: z.string().min(1),
  /** Company-agnostic severity: 1 = highest. */
  severity: z.number().int().min(1).max(5),
  caseId: z.string().regex(/^TC-\d+$/),
  stepIndex: z.number().int().min(0).optional(),
  /** Steps to reproduce, if they differ from the case's own steps. */
  reproduction: z.string().optional(),
});
export type ObservedDefect = z.infer<typeof ObservedDefectSchema>;

export const CaseResultSchema = z.object({
  caseId: z.string().regex(/^TC-\d+$/),
  status: z.enum(CASE_STATUSES),
  executionMode: z.enum(EXECUTION_MODES),
  /** Required when status is not-run, blocked or skipped — no silent gaps. */
  reason: z.string().optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  durationMs: z.number().int().min(0).optional(),
  steps: z.array(StepResultSchema).default([]),
  evidence: z.array(EvidenceRefSchema).default([]),
  notes: z.string().optional(),
}).refine(
  (r) => !["not-run", "blocked", "skipped"].includes(r.status) || Boolean(r.reason),
  { message: "a case that was not executed must carry a reason" },
);
export type CaseResult = z.infer<typeof CaseResultSchema>;

export const ExitCriterionResultSchema = z.object({
  criterion: z.string().min(1),
  /** `unknown` is a first-class outcome: the system could not verify it. */
  status: z.enum(["met", "not-met", "unknown"]),
  /** How the verdict was reached, or what a human must confirm. */
  detail: z.string().min(1),
  /** True when a human must attest to it (the system cannot check it). */
  needsHumanConfirmation: z.boolean(),
});
export type ExitCriterionResult = z.infer<typeof ExitCriterionResultSchema>;

export const RunSummarySchema = z.object({
  total: z.number().int().min(0),
  pass: z.number().int().min(0),
  fail: z.number().int().min(0),
  blocked: z.number().int().min(0),
  skipped: z.number().int().min(0),
  notRun: z.number().int().min(0),
  /** Passed / executed. Null when nothing was executed. */
  passRate: z.number().min(0).max(1).nullable(),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

export const TestRunSchema = z.object({
  runId: z.string().min(1),
  workItem: z.string().min(1),
  /** Content hash of the plan this run executed — detects plan drift. */
  planHash: z.string().optional(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  environment: z.object({
    name: z.string().min(1),
    url: z.string().optional(),
  }),
  executor: z.object({
    kind: z.enum(["human", "system", "mixed"]),
    name: z.string().optional(),
  }),
  results: z.array(CaseResultSchema),
  defects: z.array(ObservedDefectSchema).default([]),
  summary: RunSummarySchema,
  exitCriteria: z.array(ExitCriterionResultSchema).default([]),
  /**
   * passed  — everything executed passed and no exit criterion is unmet
   * failed  — at least one case failed or an exit criterion is unmet
   * incomplete — nothing failed, but cases remain not-run/blocked
   */
  verdict: z.enum(["passed", "failed", "incomplete"]),
});
export type TestRun = z.infer<typeof TestRunSchema>;
