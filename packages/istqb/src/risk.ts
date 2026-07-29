/**
 * Product risk analysis — the input that drives test depth.
 *
 * risk = likelihood x impact, on the classic 5x5 ISTQB grid. Everything here is
 * pure arithmetic: the model supplies the likelihood/impact judgement, this
 * module decides what that judgement means for the test effort.
 */

import type { RiskLevel, RiskScale, TestDepth } from "./types.js";

export interface RiskFactor {
  /** Stable id so the factor can be traced across runs, e.g. "RSK-01". */
  id: string;
  /** What could go wrong, in business terms. */
  description: string;
  /** Which feature / module / quality characteristic it belongs to. */
  area: string;
  likelihood: RiskScale;
  impact: RiskScale;
}

export interface ScoredRiskFactor extends RiskFactor {
  /** likelihood x impact, 1..25 */
  score: number;
  level: RiskLevel;
  depth: TestDepth;
}

export interface RiskAssessment {
  factors: ScoredRiskFactor[];
  /** Highest individual factor — drives the overall test depth. */
  overallLevel: RiskLevel;
  overallDepth: TestDepth;
  /** Mean score across factors, for reporting and trend tracking. */
  averageScore: number;
  /** Factors at high or critical level, sorted by score descending. */
  priorityFactors: ScoredRiskFactor[];
}

export function scoreRisk(factor: RiskFactor): number {
  return factor.likelihood * factor.impact;
}

/**
 * 5x5 grid thresholds. Deliberately conservative at the top: a single 4x4
 * already lands in "critical" because impact-4 defects reach production users.
 */
export function riskLevelFromScore(score: number): RiskLevel {
  if (score <= 4) return "low";
  if (score <= 9) return "medium";
  if (score <= 15) return "high";
  return "critical";
}

const DEPTH_BY_LEVEL: Record<RiskLevel, TestDepth> = {
  low: "smoke",
  medium: "standard",
  high: "thorough",
  critical: "exhaustive",
};

export function depthForLevel(level: RiskLevel): TestDepth {
  return DEPTH_BY_LEVEL[level];
}

export function scoreFactor(factor: RiskFactor): ScoredRiskFactor {
  const score = scoreRisk(factor);
  const level = riskLevelFromScore(score);
  return { ...factor, score, level, depth: depthForLevel(level) };
}

const LEVEL_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export function assessRisk(factors: readonly RiskFactor[]): RiskAssessment {
  if (factors.length === 0) {
    // No identified risk is not the same as no risk: an empty analysis is
    // itself a finding, so we floor at "medium" rather than "low".
    return {
      factors: [],
      overallLevel: "medium",
      overallDepth: depthForLevel("medium"),
      averageScore: 0,
      priorityFactors: [],
    };
  }

  const scored = factors.map(scoreFactor);
  const overallLevel = scored.reduce<RiskLevel>(
    (worst, f) => (LEVEL_ORDER[f.level] > LEVEL_ORDER[worst] ? f.level : worst),
    "low",
  );
  const total = scored.reduce((sum, f) => sum + f.score, 0);

  return {
    factors: scored,
    overallLevel,
    overallDepth: depthForLevel(overallLevel),
    averageScore: Math.round((total / scored.length) * 100) / 100,
    priorityFactors: scored
      .filter((f) => f.level === "high" || f.level === "critical")
      .sort((a, b) => b.score - a.score),
  };
}

/**
 * Suggested number of test cases per risk area. Guidance, not a hard cap — the
 * designer agent may exceed it, but the critic will ask why.
 */
const CASE_BUDGET: Record<TestDepth, { min: number; max: number }> = {
  smoke: { min: 1, max: 3 },
  standard: { min: 3, max: 8 },
  thorough: { min: 8, max: 20 },
  exhaustive: { min: 20, max: 50 },
};

export function caseBudgetForDepth(depth: TestDepth): {
  min: number;
  max: number;
} {
  return CASE_BUDGET[depth];
}
