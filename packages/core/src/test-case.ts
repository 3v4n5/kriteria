/**
 * Designed test cases — the Designer agent's output contract.
 *
 * Traceability is enforced structurally: every case names its technique, the
 * features it covers and the risks it mitigates. The critic (and later the
 * self-improvement loop) reads those links to find coverage gaps mechanically,
 * without re-interpreting prose.
 */

import { TEST_LEVELS, TEST_TECHNIQUES, TEST_TYPES } from "@kriteria/istqb";
import { z } from "zod/v4";

export const CasePrioritySchema = z.enum(["critical", "high", "medium", "low"]);
export type CasePriority = z.infer<typeof CasePrioritySchema>;

export const TestStepSchema = z.object({
  action: z.string().min(1),
  expected: z.string().min(1),
});
export type TestStep = z.infer<typeof TestStepSchema>;

export const DesignedCaseSchema = z.object({
  id: z.string().regex(/^TC-\d+$/),
  title: z.string().min(1),
  level: z.enum(TEST_LEVELS),
  type: z.enum(TEST_TYPES),
  technique: z.enum(TEST_TECHNIQUES),
  priority: CasePrioritySchema,
  /** Feature ids (FEA-n) this case exercises. */
  covers: z.array(z.string().regex(/^FEA-\d+$/)).min(1),
  /** Risk ids (RSK-n) this case mitigates. Empty is allowed but suspicious. */
  mitigates: z.array(z.string().regex(/^RSK-\d+$/)),
  /** Acceptance criteria ids (AC-n) verified by this case. */
  verifies: z.array(z.string().regex(/^AC-\d+$/)),
  preconditions: z.array(z.string()),
  /** Concrete data the case needs, named so it can be generated or seeded. */
  dataRequirements: z.array(z.string()),
  steps: z.array(TestStepSchema).min(1),
  /** Optional Gherkin rendering for BDD export. */
  gherkin: z.string().optional(),
  /** True when a human must run it (visual judgement, hardware, third party). */
  needsHuman: z.boolean(),
  notes: z.string().optional(),
});
export type DesignedCase = z.infer<typeof DesignedCaseSchema>;

export const DesignOutputSchema = z.object({
  cases: z.array(DesignedCaseSchema).min(1),
  /**
   * What the designer deliberately did NOT cover and why — silent truncation
   * reads as "covered everything" when it didn't.
   */
  exclusions: z.array(
    z.object({ what: z.string().min(1), why: z.string().min(1) }),
  ),
});
export type DesignOutput = z.infer<typeof DesignOutputSchema>;
