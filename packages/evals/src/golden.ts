/**
 * Golden-set contract.
 *
 * A golden entry records what a senior QA would have DECIDED for a work item —
 * not a full expected plan. Writing a whole plan by hand is work nobody
 * sustains, and comparing prose to prose is not measurement. So the format is
 * deliberately cheap to fill: only the judgements you actually hold an opinion
 * on, and omitted fields are simply not scored.
 *
 * The measurement stays honest in two ways. Fields you leave out are reported
 * as `not-scored` rather than silently passing, and the human verdict lives
 * alongside the mechanical score instead of being replaced by it — the real
 * question for the self-improvement loop is whether the score PREDICTS the
 * verdict, which we can only answer by keeping both.
 */

import {
  RISK_LEVELS,
  TEST_APPROACHES,
  TEST_DEPTHS,
  TEST_LEVELS,
  TEST_TECHNIQUES,
  TEST_TYPES,
} from "@kriteria/istqb";
import { z } from "zod/v4";

export const ExpectationSchema = z.object({
  /** The approach a senior QA would pick as primary. */
  approach: z.enum(TEST_APPROACHES).optional(),
  /** Other approaches you would accept as reasonable for this item. */
  approachAlternatives: z.array(z.enum(TEST_APPROACHES)).default([]),
  depth: z.enum(TEST_DEPTHS).optional(),
  riskLevel: z.enum(RISK_LEVELS).optional(),
  /** Levels the plan MUST include. Extra levels are not penalised. */
  levels: z.array(z.enum(TEST_LEVELS)).default([]),
  /** Types the plan MUST include. */
  types: z.array(z.enum(TEST_TYPES)).default([]),
  /** Techniques the plan MUST mark mandatory somewhere. */
  mandatoryTechniques: z.array(z.enum(TEST_TECHNIQUES)).default([]),
  /**
   * Topics the plan MUST raise as ambiguities, matched loosely by keyword.
   * Phrase them as the few words you would search for, not full sentences.
   */
  ambiguityTopics: z.array(z.string()).default([]),
  /** Risks the plan MUST identify, matched the same way. */
  riskTopics: z.array(z.string()).default([]),
  minCases: z.number().int().positive().optional(),
  maxCases: z.number().int().positive().optional(),
  /** The mechanical audit must end with no structural gaps. */
  requireCleanAudit: z.boolean().default(true),
});
export type Expectation = z.infer<typeof ExpectationSchema>;

export const GoldenEntrySchema = z.object({
  workItem: z.string().min(1),
  /** One line on why this item is in the set — keeps the set intentional. */
  rationale: z.string().optional(),
  expect: ExpectationSchema,
  humanVerdict: z
    .object({
      /** The Fase-0 question: "is this what I would have done?" */
      wouldHaveDoneThis: z.boolean().nullable().default(null),
      reviewedBy: z.string().optional(),
      notes: z.string().default(""),
    })
    .default({ wouldHaveDoneThis: null, notes: "" }),
});
export type GoldenEntry = z.infer<typeof GoldenEntrySchema>;
