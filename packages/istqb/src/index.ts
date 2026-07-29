/**
 * @kriteria/istqb — the deterministic core of Kriteria.
 *
 * No LLM calls, no I/O, no domain knowledge about any particular customer.
 * Given a description of the situation it produces a full ISTQB test strategy
 * that a human can audit line by line. Agents supply the judgement that fills
 * the inputs; this module owns the reasoning that turns them into a plan.
 */

export * from "./types.js";
export * from "./risk.js";
export * from "./strategy-matrix.js";
export * from "./techniques.js";
export * from "./scope.js";

import {
  assessRisk,
  caseBudgetForDepth,
  type RiskAssessment,
  type RiskFactor,
} from "./risk.js";
import { recommendLevels, recommendTypes, type SystemTraits } from "./scope.js";
import {
  selectApproaches,
  type ApproachSelection,
  type StrategyContext,
} from "./strategy-matrix.js";
import {
  selectTechniques,
  type ConditionTraits,
  type TechniqueRecommendation,
} from "./techniques.js";
import type { Justified, TestDepth, TestLevel, TestType } from "./types.js";

export interface StrategyInput {
  context: StrategyContext;
  system: SystemTraits;
  risks: RiskFactor[];
  traits: ConditionTraits;
}

export interface LevelTechniques {
  level: TestLevel;
  techniques: TechniqueRecommendation[];
}

export interface TestStrategy {
  risk: RiskAssessment;
  depth: TestDepth;
  approach: ApproachSelection;
  levels: Justified<TestLevel>[];
  types: Justified<TestType>[];
  techniquesByLevel: LevelTechniques[];
  caseBudgetPerArea: { min: number; max: number };
  entryCriteria: string[];
  exitCriteria: string[];
}

/**
 * Composes the whole strategy.
 *
 * Note that `context.overallRisk` supplied by the caller is deliberately
 * ignored and recomputed from `risks`: the risk register is the single source
 * of truth, so a caller cannot claim "low risk" while listing critical factors.
 */
export function buildStrategy(input: StrategyInput): TestStrategy {
  const risk = assessRisk(input.risks);
  const context: StrategyContext = {
    ...input.context,
    overallRisk: risk.overallLevel,
  };

  const approach = selectApproaches(context);
  const levels = recommendLevels(context, input.system);
  const types = recommendTypes(context, input.system);

  const selectedApproaches = [
    approach.primary.approach,
    ...approach.supporting.map((a) => a.approach),
  ];

  const techniquesByLevel: LevelTechniques[] = levels.map(({ value: level }) => ({
    level,
    techniques: selectTechniques({
      traits: input.traits,
      depth: risk.overallDepth,
      level,
      approaches: selectedApproaches,
    }),
  }));

  return {
    risk,
    depth: risk.overallDepth,
    approach,
    levels,
    types,
    techniquesByLevel,
    caseBudgetPerArea: caseBudgetForDepth(risk.overallDepth),
    entryCriteria: buildEntryCriteria(context, input.traits),
    exitCriteria: buildExitCriteria(context, risk, types, techniquesByLevel),
  };
}

function buildEntryCriteria(
  ctx: StrategyContext,
  traits: ConditionTraits,
): string[] {
  const criteria = [
    "Test basis is available and every acceptance criterion is testable",
    "Test environment is provisioned and matches the target configuration",
  ];

  if (ctx.specQuality < 0.4) {
    criteria.push(
      ctx.domainExpertAvailable
        ? "Spec ambiguities are resolved in writing with the domain expert"
        : "BLOCKER: spec quality is insufficient and no domain expert is assigned",
    );
  }
  if (traits.hasDiscretePartitions || traits.hasOrderedInputDomain) {
    criteria.push("Test data covering every identified partition is prepared");
  }
  if (ctx.regulatory.length > 0) {
    criteria.push(
      `Compliance checklist for ${ctx.regulatory.join(", ")} is attached to the run`,
    );
  }
  return criteria;
}

function buildExitCriteria(
  ctx: StrategyContext,
  risk: RiskAssessment,
  types: Justified<TestType>[],
  techniquesByLevel: LevelTechniques[],
): string[] {
  const criteria = [
    "Every planned test case has been executed and its result recorded with evidence",
    "Each risk factor rated high or critical is covered by at least one passing test",
    "No open defect of severity 1 or 2 remains against the change",
  ];

  const mandatory = new Set(
    techniquesByLevel.flatMap((l) =>
      l.techniques.filter((t) => t.mandatory).map((t) => t.technique),
    ),
  );
  if (mandatory.size > 0) {
    criteria.push(
      `Mandatory techniques applied and evidenced: ${[...mandatory].join(", ")}`,
    );
  }

  if (risk.overallDepth === "exhaustive") {
    criteria.push("Branch coverage on the changed units is at least 90%");
  }
  if (types.some((t) => t.value === "regression")) {
    criteria.push("The regression suite is green, or every failure is triaged and accepted");
  }
  if (types.some((t) => t.value === "security")) {
    criteria.push("No High or Critical security finding is left unresolved");
  }
  if (ctx.regulatory.length > 0) {
    criteria.push(
      "Compliance evidence is archived and traceable to each requirement",
    );
  }
  return criteria;
}
