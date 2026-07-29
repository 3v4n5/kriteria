/**
 * Canonical ISTQB vocabulary (Foundation Level v4.0 / ISO-IEC-IEEE 29119).
 *
 * This package is DOMAIN-AGNOSTIC by contract. It must never reference a
 * specific customer, product, tech stack or vertical. Anything organisation
 * specific belongs in the tenant memory vault, never here.
 */

// ---------------------------------------------------------------------------
// Test levels
// ---------------------------------------------------------------------------

export const TEST_LEVELS = [
  "component",
  "component-integration",
  "system",
  "system-integration",
  "acceptance",
] as const;

export type TestLevel = (typeof TEST_LEVELS)[number];

// ---------------------------------------------------------------------------
// Test types
// ---------------------------------------------------------------------------

export const TEST_TYPES = [
  "functional",
  "performance",
  "security",
  "usability",
  "accessibility",
  "compatibility",
  "reliability",
  "confirmation",
  "regression",
] as const;

export type TestType = (typeof TEST_TYPES)[number];

// ---------------------------------------------------------------------------
// Test approaches — the seven ISTQB test strategies
// ---------------------------------------------------------------------------

export const TEST_APPROACHES = [
  "analytical",
  "model-based",
  "methodical",
  "process-compliant",
  "directed",
  "regression-averse",
  "reactive",
] as const;

export type TestApproach = (typeof TEST_APPROACHES)[number];

export const APPROACH_LABELS: Record<TestApproach, string> = {
  analytical: "Analytical (risk-based)",
  "model-based": "Model-based",
  methodical: "Methodical (checklist / standard driven)",
  "process-compliant": "Process-compliant (regulatory)",
  directed: "Directed / consultative",
  "regression-averse": "Regression-averse",
  reactive: "Reactive (exploratory)",
};

// ---------------------------------------------------------------------------
// Test design techniques
// ---------------------------------------------------------------------------

export const TECHNIQUE_FAMILIES = [
  "black-box",
  "white-box",
  "experience-based",
] as const;

export type TechniqueFamily = (typeof TECHNIQUE_FAMILIES)[number];

export const TEST_TECHNIQUES = [
  // black-box
  "equivalence-partitioning",
  "boundary-value-analysis",
  "decision-table",
  "state-transition",
  "use-case",
  "pairwise",
  // white-box
  "statement-coverage",
  "branch-coverage",
  "modified-condition-decision-coverage",
  // experience-based
  "error-guessing",
  "exploratory",
  "checklist-based",
] as const;

export type TestTechnique = (typeof TEST_TECHNIQUES)[number];

// ---------------------------------------------------------------------------
// Risk
// ---------------------------------------------------------------------------

/** 1 = very low, 5 = very high. */
export type RiskScale = 1 | 2 | 3 | 4 | 5;

export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const TEST_DEPTHS = [
  "smoke",
  "standard",
  "thorough",
  "exhaustive",
] as const;
export type TestDepth = (typeof TEST_DEPTHS)[number];

// ---------------------------------------------------------------------------
// Change context
// ---------------------------------------------------------------------------

export const CHANGE_TYPES = [
  "new-feature",
  "enhancement",
  "bug-fix",
  "refactor",
  "configuration",
  "data-migration",
  "dependency-upgrade",
] as const;

export type ChangeType = (typeof CHANGE_TYPES)[number];

export const PRESSURE_LEVELS = ["low", "medium", "high"] as const;
export type Pressure = (typeof PRESSURE_LEVELS)[number];

export const AUTOMATION_MATURITY = ["none", "partial", "mature"] as const;
export type AutomationMaturity = (typeof AUTOMATION_MATURITY)[number];

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

/**
 * Every decision the engine makes carries its own justification. Rationale is
 * surfaced verbatim in the test plan so a human QA can audit the reasoning
 * without re-running any model.
 */
export interface Justified<T> {
  value: T;
  rationale: string[];
}

export function justified<T>(value: T, ...rationale: string[]): Justified<T> {
  return { value, rationale };
}
