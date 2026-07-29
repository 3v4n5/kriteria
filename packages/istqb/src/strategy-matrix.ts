/**
 * Approach selection — the single most important decision the system makes.
 *
 * Given the observable signals of a change, score each of the seven ISTQB test
 * approaches and pick a primary plus supporting ones. This is deterministic and
 * fully explainable ON PURPOSE: the LLM's job is to fill in the signals
 * (how good is the spec? is there a state model? what is the blast radius?),
 * not to pick the strategy by vibes.
 */

import {
  TEST_APPROACHES,
  type AutomationMaturity,
  type ChangeType,
  type Pressure,
  type RiskLevel,
  type TestApproach,
} from "./types.js";

export interface StrategyContext {
  changeType: ChangeType;
  /** 0 = no usable spec, 1 = complete, unambiguous, testable spec. */
  specQuality: number;
  /** A documented lifecycle / status machine exists for the entity under test. */
  hasStateModel: boolean;
  /** A machine-readable contract exists (OpenAPI, GraphQL schema, protobuf). */
  hasApiContract: boolean;
  /** Behaviour is expressed as conditions -> outcomes (pricing, eligibility). */
  hasBusinessRuleMatrix: boolean;
  /** Regulatory regimes in force, e.g. ["HIPAA"], ["PCI-DSS"]. */
  regulatory: string[];
  /** Applicable standards/checklists, e.g. ["OWASP-Top-10", "WCAG-2.2-AA"]. */
  standards: string[];
  /** The change touches code shared by several consumers. */
  touchesSharedComponent: boolean;
  hasRegressionSuite: boolean;
  automationMaturity: AutomationMaturity;
  timePressure: Pressure;
  /** A business/domain expert is reachable during the test window. */
  domainExpertAvailable: boolean;
  /** 0..1 — historical defect density of the touched area, from tenant memory. */
  historicalDefectDensity: number;
  overallRisk: RiskLevel;
}

export interface ApproachScore {
  approach: TestApproach;
  /** 0..100 */
  score: number;
  rationale: string[];
  /** True when a constraint makes this approach non-negotiable. */
  mandatory: boolean;
}

export interface ApproachSelection {
  primary: ApproachScore;
  supporting: ApproachScore[];
  /** Every approach with its score, for auditability. */
  all: ApproachScore[];
}

/** Approaches scoring at or above this threshold join as supporting. */
export const SUPPORTING_THRESHOLD = 50;
const MAX_SUPPORTING = 2;

interface Accumulator {
  score: number;
  rationale: string[];
  mandatory: boolean;
}

function add(acc: Accumulator, points: number, reason: string): void {
  acc.score += points;
  acc.rationale.push(`${points >= 0 ? "+" : ""}${points} — ${reason}`);
}

type Scorer = (ctx: StrategyContext, acc: Accumulator) => void;

const SCORERS: Record<TestApproach, Scorer> = {
  /**
   * The default. Risk-based testing is always defensible, so it starts high
   * and only loses ground to approaches with a stronger specific trigger.
   */
  analytical: (ctx, acc) => {
    add(acc, 55, "risk-based testing is the default approach");
    if (ctx.overallRisk === "critical" || ctx.overallRisk === "high") {
      add(acc, 20, `overall product risk is ${ctx.overallRisk}`);
    }
    if (ctx.timePressure === "high") {
      add(acc, 10, "time pressure demands prioritising by risk");
    }
    if (ctx.specQuality >= 0.5) {
      add(acc, 10, "spec is good enough to derive risk from");
    }
  },

  /**
   * Needs an actual model to test against. Without one it scores near zero —
   * "model-based" with no model is just wishful thinking.
   */
  "model-based": (ctx, acc) => {
    add(acc, 10, "baseline");
    if (ctx.hasStateModel) add(acc, 35, "a state model is documented");
    if (ctx.hasApiContract) {
      add(acc, 30, "a machine-readable API contract exists");
    }
    if (ctx.hasBusinessRuleMatrix) {
      add(acc, 20, "behaviour is expressed as a business rule matrix");
    }
    if (ctx.specQuality >= 0.7) add(acc, 10, "spec is precise enough to model");
  },

  methodical: (ctx, acc) => {
    add(acc, 15, "baseline");
    if (ctx.standards.length > 0) {
      add(acc, 30, `applicable standards: ${ctx.standards.join(", ")}`);
    }
    if (ctx.hasRegressionSuite) {
      add(acc, 25, "an existing regression checklist can be reused");
    }
    if (ctx.changeType === "configuration") {
      add(acc, 10, "configuration changes suit checklist verification");
    }
  },

  /**
   * Regulation is not optional. When a regime is in force this approach is
   * flagged mandatory and forced into the selection regardless of score.
   */
  "process-compliant": (ctx, acc) => {
    add(acc, 5, "baseline");
    if (ctx.regulatory.length > 0) {
      add(acc, 50, `regulatory regimes in force: ${ctx.regulatory.join(", ")}`);
      acc.mandatory = true;
    }
    if (ctx.specQuality >= 0.8) {
      add(acc, 15, "spec is formal enough to audit against");
    }
  },

  directed: (ctx, acc) => {
    add(acc, 10, "baseline");
    if (ctx.specQuality < 0.4 && ctx.domainExpertAvailable) {
      add(acc, 30, "spec is weak but a domain expert is available to direct testing");
    }
    if (ctx.changeType === "new-feature" && ctx.specQuality < 0.5) {
      add(acc, 15, "new feature with an incomplete spec needs expert guidance");
    }
    if (ctx.changeType === "data-migration") {
      add(acc, 15, "data migrations need business validation of the output");
    }
  },

  "regression-averse": (ctx, acc) => {
    add(acc, 10, "baseline");
    if (ctx.touchesSharedComponent) {
      add(acc, 35, "the change touches a shared component — wide blast radius");
    }
    if (ctx.automationMaturity === "mature") {
      add(acc, 20, "mature automation makes broad regression cheap");
    }
    if (ctx.changeType === "refactor" || ctx.changeType === "dependency-upgrade") {
      add(acc, 15, `${ctx.changeType} must preserve existing behaviour`);
    }
    if (ctx.historicalDefectDensity > 0.5) {
      add(acc, 10, "this area has a high historical defect density");
    }
  },

  /**
   * Legitimate when there is nothing to design from. Actively penalised under
   * regulation, where undocumented exploratory testing is not auditable.
   */
  reactive: (ctx, acc) => {
    add(acc, 10, "baseline");
    if (ctx.specQuality < 0.3) {
      add(acc, 30, "spec is too thin to design cases up front");
    }
    if (ctx.timePressure === "high") {
      add(acc, 15, "exploratory charters give fast feedback under pressure");
    }
    if (!ctx.hasRegressionSuite) {
      add(acc, 10, "no existing suite to lean on");
    }
    if (ctx.regulatory.length > 0) {
      add(acc, -20, "regulated context requires documented, repeatable testing");
    }
  },
};

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

export function scoreApproaches(ctx: StrategyContext): ApproachScore[] {
  return TEST_APPROACHES.map((approach) => {
    const acc: Accumulator = { score: 0, rationale: [], mandatory: false };
    SCORERS[approach](ctx, acc);
    return {
      approach,
      score: clamp(acc.score),
      rationale: acc.rationale,
      mandatory: acc.mandatory,
    };
  });
}

export function selectApproaches(ctx: StrategyContext): ApproachSelection {
  const all = scoreApproaches(ctx);
  const ranked = [...all].sort((a, b) => b.score - a.score);

  // A mandatory approach wins the primary slot outright.
  const mandatory = ranked.filter((a) => a.mandatory);
  const primary = mandatory[0] ?? ranked[0]!;

  const supporting: ApproachScore[] = [];
  for (const candidate of ranked) {
    if (candidate.approach === primary.approach) continue;
    if (candidate.mandatory) {
      supporting.push(candidate);
      continue;
    }
    if (
      candidate.score >= SUPPORTING_THRESHOLD &&
      supporting.length < MAX_SUPPORTING
    ) {
      supporting.push(candidate);
    }
  }

  return { primary, supporting, all: ranked };
}
