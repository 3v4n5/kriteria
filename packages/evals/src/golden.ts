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

/**
 * A blank field in a YAML template parses as `null`, and a blank field IS an
 * unfilled one — so null is normalised to "absent" before validation. Without
 * this the template cannot be used as shipped, which is the one thing a
 * template must never do.
 */
function blankAsAbsent<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === null ? undefined : value), schema);
}

export const ExpectationSchema = z.object({
  /** The approach a senior QA would pick as primary. */
  approach: blankAsAbsent(z.enum(TEST_APPROACHES).optional()),
  /** Other approaches you would accept as reasonable for this item. */
  approachAlternatives: blankAsAbsent(z.array(z.enum(TEST_APPROACHES)).default([])),
  depth: blankAsAbsent(z.enum(TEST_DEPTHS).optional()),
  riskLevel: blankAsAbsent(z.enum(RISK_LEVELS).optional()),
  /** Levels the plan MUST include. Extra levels are not penalised. */
  levels: blankAsAbsent(z.array(z.enum(TEST_LEVELS)).default([])),
  /** Types the plan MUST include. */
  types: blankAsAbsent(z.array(z.enum(TEST_TYPES)).default([])),
  /** Techniques the plan MUST mark mandatory somewhere. */
  mandatoryTechniques: blankAsAbsent(z.array(z.enum(TEST_TECHNIQUES)).default([])),
  /**
   * Topics the plan MUST raise as ambiguities, matched loosely by keyword.
   * Phrase them as the few words you would search for, not full sentences.
   */
  ambiguityTopics: blankAsAbsent(z.array(z.string()).default([])),
  /** Risks the plan MUST identify, matched the same way. */
  riskTopics: blankAsAbsent(z.array(z.string()).default([])),
  minCases: blankAsAbsent(z.number().int().positive().optional()),
  maxCases: blankAsAbsent(z.number().int().positive().optional()),
  /** The mechanical audit must end with no structural gaps. */
  requireCleanAudit: blankAsAbsent(z.boolean().default(true)),
});
export type Expectation = z.infer<typeof ExpectationSchema>;

export const GoldenEntrySchema = z.object({
  workItem: z.string().min(1),
  /** One line on why this item is in the set — keeps the set intentional. */
  rationale: blankAsAbsent(z.string().optional()),
  /**
   * Acceptance criteria the REVIEWER wrote, because the ticket had none or
   * had bad ones.
   *
   * Deliberately outside `expect`: it is not a strategy judgement and is not
   * scored dimension-by-dimension. Comparing prose to prose is not
   * measurement, and a keyword match over a full sentence would manufacture
   * a number nobody should trust.
   *
   * What it IS: the clearest statement of what the reviewer believes the
   * ticket actually asks for. Writing the missing criteria is a senior QA's
   * first move on a spec-less ticket, so capturing it keeps the most
   * valuable part of the review from being thrown away — and the verdict
   * phase shows it beside the designed cases, so the yes/no is informed by
   * whether the plan covered what the reviewer thinks matters.
   */
  reviewerCriteria: blankAsAbsent(z.array(z.string().min(1)).default([])),
  expect: ExpectationSchema,
  humanVerdict: z
    .object({
      /** The Fase-0 question: "is this what I would have done?" */
      wouldHaveDoneThis: z.boolean().nullable().default(null),
      reviewedBy: blankAsAbsent(z.string().optional()),
      notes: blankAsAbsent(z.string().default("")),
    })
    .default({ wouldHaveDoneThis: null, notes: "" }),
});
export type GoldenEntry = z.infer<typeof GoldenEntrySchema>;
