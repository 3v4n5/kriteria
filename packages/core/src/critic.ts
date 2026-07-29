/**
 * Critic report — the adversarial reviewer's output contract.
 *
 * The critic runs with fresh context and one job: refute. Its findings are
 * typed so the orchestrator can decide mechanically whether to loop back
 * (blockers exist) or ship (only advisories remain).
 */

import { z } from "zod/v4";

export const FindingSeveritySchema = z.enum(["blocker", "major", "advisory"]);
export type FindingSeverity = z.infer<typeof FindingSeveritySchema>;

export const FindingKindSchema = z.enum([
  /** A feature, rule, AC or risk with no covering case. */
  "coverage-gap",
  /** Boundary/partition/transition the mandatory technique demands but no case exercises. */
  "technique-not-applied",
  /** A case whose steps don't actually verify what it claims to verify. */
  "weak-case",
  /** The strategy itself contradicts the signals (wrong approach/level/depth). */
  "strategy-mismatch",
  /** Traceability broken: dangling ids, unmapped ACs, empty mitigations. */
  "traceability",
  /** The analysis missed or misread something present in the basis. */
  "analysis-error",
]);
export type FindingKind = z.infer<typeof FindingKindSchema>;

export const CriticFindingSchema = z.object({
  id: z.string().regex(/^CRT-\d+$/),
  kind: FindingKindSchema,
  severity: FindingSeveritySchema,
  summary: z.string().min(1),
  /** Ids of the artifacts involved (FEA-n, RSK-n, TC-n, AC-n...). */
  refs: z.array(z.string()),
  /** Concrete, actionable fix — "add a case for X at boundary Y". */
  recommendation: z.string().min(1),
});
export type CriticFinding = z.infer<typeof CriticFindingSchema>;

export const CriticReportSchema = z.object({
  findings: z.array(CriticFindingSchema),
  verdict: z.enum(["pass", "needs-revision"]),
  /** One paragraph: what the critic probed and how hard. */
  scopeStatement: z.string().min(1),
}).refine(
  (r) =>
    r.verdict === "pass"
      ? r.findings.every((f) => f.severity !== "blocker")
      : true,
  { message: "a report with blocker findings cannot carry a pass verdict" },
);
export type CriticReport = z.infer<typeof CriticReportSchema>;
