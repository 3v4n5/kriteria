/**
 * Analysis — the Analyst agent's output contract.
 *
 * Two halves with different audiences:
 *  - the human-facing half (features, rules, ambiguities) goes into the plan;
 *  - the machine-facing half (`signals`) feeds @kriteria/istqb verbatim.
 *
 * The enums are built FROM the istqb constant arrays, so the engine and the
 * agent contract can never drift apart: a vocabulary change over there is a
 * compile-and-validation change here.
 */

import {
  AUTOMATION_MATURITY,
  CHANGE_TYPES,
  PRESSURE_LEVELS,
} from "@kriteria/istqb";
import { z } from "zod/v4";

/** Every claim an agent makes must cite where in the basis it came from. */
export const EvidenceSchema = z.object({
  /** e.g. "description", "AC-2", "discussion[3]", "attachment:mockup.png" */
  from: z.string().min(1),
  /** Short verbatim quote or tight paraphrase backing the claim. */
  excerpt: z.string().min(1),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const FeatureSchema = z.object({
  id: z.string().regex(/^FEA-\d+$/),
  name: z.string().min(1),
  summary: z.string().min(1),
  evidence: z.array(EvidenceSchema).min(1),
});
export type Feature = z.infer<typeof FeatureSchema>;

export const ActorSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["human-role", "external-system", "scheduled-process"]),
  interest: z.string().min(1),
});
export type Actor = z.infer<typeof ActorSchema>;

export const BusinessRuleSchema = z.object({
  id: z.string().regex(/^BR-\d+$/),
  statement: z.string().min(1),
  /** Feature ids this rule constrains. */
  features: z.array(z.string().regex(/^FEA-\d+$/)).min(1),
  evidence: z.array(EvidenceSchema).min(1),
});
export type BusinessRule = z.infer<typeof BusinessRuleSchema>;

/**
 * An ambiguity is a first-class deliverable, not a footnote: unresolved
 * ambiguities become entry-criteria blockers or directed-testing questions.
 */
export const AmbiguitySchema = z.object({
  id: z.string().regex(/^AMB-\d+$/),
  question: z.string().min(1),
  /** What the agent will assume if nobody answers. */
  workingAssumption: z.string().min(1),
  /** How wrong things go if the assumption is wrong. */
  riskIfWrong: z.string().min(1),
  evidence: z.array(EvidenceSchema).min(1),
});
export type Ambiguity = z.infer<typeof AmbiguitySchema>;

const Fraction = z.number().min(0).max(1);

/**
 * Machine-facing signals, mirroring the @kriteria/istqb input types
 * (StrategyContext minus overallRisk — the engine recomputes that from the
 * risk register; SystemTraits; ConditionTraits).
 */
export const SignalsSchema = z.object({
  context: z.object({
    changeType: z.enum(CHANGE_TYPES),
    specQuality: Fraction,
    hasStateModel: z.boolean(),
    hasApiContract: z.boolean(),
    hasBusinessRuleMatrix: z.boolean(),
    regulatory: z.array(z.string()),
    standards: z.array(z.string()),
    touchesSharedComponent: z.boolean(),
    hasRegressionSuite: z.boolean(),
    automationMaturity: z.enum(AUTOMATION_MATURITY),
    timePressure: z.enum(PRESSURE_LEVELS),
    domainExpertAvailable: z.boolean(),
    historicalDefectDensity: Fraction,
  }),
  system: z.object({
    hasUserFacingUi: z.boolean(),
    handlesSensitiveData: z.boolean(),
    performanceSensitive: z.boolean(),
    multiPlatform: z.boolean(),
    crossesServiceBoundary: z.boolean(),
    codeAccess: z.boolean(),
  }),
  traits: z.object({
    hasOrderedInputDomain: z.boolean(),
    hasDiscretePartitions: z.boolean(),
    hasStateMachine: z.boolean(),
    hasBusinessRules: z.boolean(),
    independentParameters: z.number().int().min(0),
    hasUserWorkflow: z.boolean(),
    codeAccess: z.boolean(),
    safetyCritical: z.boolean(),
  }),
});
export type Signals = z.infer<typeof SignalsSchema>;

export const AnalysisSchema = z.object({
  features: z.array(FeatureSchema).min(1),
  actors: z.array(ActorSchema),
  businessRules: z.array(BusinessRuleSchema),
  ambiguities: z.array(AmbiguitySchema),
  signals: SignalsSchema,
  /**
   * Acceptance criteria the analyst could NOT map to any feature — surfaced
   * so coverage gaps are loud instead of silently dropped.
   */
  unmappedAcceptanceCriteria: z.array(z.string().regex(/^AC-\d+$/)),
});
export type Analysis = z.infer<typeof AnalysisSchema>;
