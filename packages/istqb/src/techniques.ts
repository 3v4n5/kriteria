/**
 * Test design technique selection.
 *
 * Techniques are chosen from the observable traits of a test condition, not
 * from the tester's habit. The most common real-world QA failure this encodes
 * against: an ordered input domain exists and nobody tested the boundaries.
 */

import type {
  TechniqueFamily,
  TestApproach,
  TestDepth,
  TestLevel,
  TestTechnique,
} from "./types.js";

/**
 * Observable properties of a test condition. The analyst agent fills these in
 * from the test basis; every field must be answerable by looking at the spec,
 * the UI or the code — never by guessing.
 */
export interface ConditionTraits {
  /** Inputs have a natural order: numbers, dates, lengths, quantities. */
  hasOrderedInputDomain: boolean;
  /** Inputs fall into discrete classes: enums, roles, statuses, countries. */
  hasDiscretePartitions: boolean;
  /** The entity moves through states with legal and illegal transitions. */
  hasStateMachine: boolean;
  /** Outcome depends on a combination of conditions. */
  hasBusinessRules: boolean;
  /** Count of independent parameters that combine (drives pairwise). */
  independentParameters: number;
  /** There is an end-to-end user workflow, not just a field. */
  hasUserWorkflow: boolean;
  /** Source code is available and unit-testable. */
  codeAccess: boolean;
  /** Failure can cause loss of money, data, safety or compliance. */
  safetyCritical: boolean;
}

export interface TechniqueRecommendation {
  technique: TestTechnique;
  family: TechniqueFamily;
  rationale: string;
  /** Skipping a mandatory technique is a blocking finding for the critic. */
  mandatory: boolean;
}

const FAMILY: Record<TestTechnique, TechniqueFamily> = {
  "equivalence-partitioning": "black-box",
  "boundary-value-analysis": "black-box",
  "decision-table": "black-box",
  "state-transition": "black-box",
  "use-case": "black-box",
  pairwise: "black-box",
  "statement-coverage": "white-box",
  "branch-coverage": "white-box",
  "modified-condition-decision-coverage": "white-box",
  "error-guessing": "experience-based",
  exploratory: "experience-based",
  "checklist-based": "experience-based",
};

const DEPTH_ORDER: Record<TestDepth, number> = {
  smoke: 0,
  standard: 1,
  thorough: 2,
  exhaustive: 3,
};

function atLeast(depth: TestDepth, min: TestDepth): boolean {
  return DEPTH_ORDER[depth] >= DEPTH_ORDER[min];
}

export interface TechniqueSelectionInput {
  traits: ConditionTraits;
  depth: TestDepth;
  level: TestLevel;
  approaches: TestApproach[];
}

export function selectTechniques(
  input: TechniqueSelectionInput,
): TechniqueRecommendation[] {
  const { traits, depth, level, approaches } = input;
  const out: TechniqueRecommendation[] = [];

  const push = (
    technique: TestTechnique,
    rationale: string,
    mandatory = false,
  ): void => {
    out.push({ technique, family: FAMILY[technique], rationale, mandatory });
  };

  // --- black-box -----------------------------------------------------------

  if (traits.hasDiscretePartitions || traits.hasOrderedInputDomain) {
    push(
      "equivalence-partitioning",
      "the input domain splits into classes that should behave identically",
      atLeast(depth, "standard"),
    );
  }

  if (traits.hasOrderedInputDomain) {
    // Deliberately mandatory from "standard" up: boundary defects are the
    // single most common escape in functional testing.
    push(
      "boundary-value-analysis",
      "inputs are ordered, so defects cluster at the edges of each partition",
      atLeast(depth, "standard"),
    );
  }

  if (traits.hasBusinessRules) {
    push(
      "decision-table",
      "the outcome depends on a combination of conditions",
      atLeast(depth, "standard"),
    );
  }

  if (traits.hasStateMachine) {
    push(
      "state-transition",
      "the entity has states with legal and illegal transitions",
      atLeast(depth, "standard"),
    );
    if (atLeast(depth, "thorough")) {
      push(
        "state-transition",
        "at this depth, also cover invalid transitions and unreachable states",
        true,
      );
    }
  }

  if (
    traits.hasUserWorkflow &&
    (level === "system" || level === "acceptance" || level === "system-integration")
  ) {
    push(
      "use-case",
      "an end-to-end workflow exists at this test level",
      level === "acceptance",
    );
  }

  if (traits.independentParameters >= 3) {
    push(
      "pairwise",
      `${traits.independentParameters} independent parameters combine — pairwise keeps coverage high and case count low`,
      traits.independentParameters >= 4,
    );
  }

  // --- white-box -----------------------------------------------------------

  if (traits.codeAccess && (level === "component" || level === "component-integration")) {
    push("statement-coverage", "code is available at component level");
    if (atLeast(depth, "thorough")) {
      push(
        "branch-coverage",
        "depth requires exercising both outcomes of each decision",
        true,
      );
    }
    if (traits.safetyCritical && atLeast(depth, "exhaustive")) {
      push(
        "modified-condition-decision-coverage",
        "safety-critical code at exhaustive depth requires MC/DC",
        true,
      );
    }
  }

  // --- experience-based ----------------------------------------------------

  if (atLeast(depth, "standard")) {
    push(
      "error-guessing",
      "cheap, high-yield pass over known failure patterns for this kind of change",
    );
  }

  if (approaches.includes("reactive") || atLeast(depth, "thorough")) {
    push(
      "exploratory",
      approaches.includes("reactive")
        ? "the reactive approach is in play — run time-boxed charters"
        : "at this depth, add charters to find what scripted cases miss",
      approaches.includes("reactive"),
    );
  }

  if (approaches.includes("methodical") || approaches.includes("process-compliant")) {
    push(
      "checklist-based",
      "the selected approach is driven by a standard or process checklist",
      true,
    );
  }

  return dedupe(out);
}

/** Keeps the strongest entry per technique: mandatory wins, rationales merge. */
function dedupe(
  recommendations: TechniqueRecommendation[],
): TechniqueRecommendation[] {
  const byTechnique = new Map<TestTechnique, TechniqueRecommendation>();
  for (const rec of recommendations) {
    const existing = byTechnique.get(rec.technique);
    if (!existing) {
      byTechnique.set(rec.technique, { ...rec });
      continue;
    }
    existing.mandatory = existing.mandatory || rec.mandatory;
    if (!existing.rationale.includes(rec.rationale)) {
      existing.rationale = `${existing.rationale}; ${rec.rationale}`;
    }
  }
  return [...byTechnique.values()];
}
