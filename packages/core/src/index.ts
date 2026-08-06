/**
 * @kriteria/core — the typed contracts between agents.
 *
 * Agents don't "reply", they fill in a typed form. Every schema here is the
 * output contract of one pipeline stage; the orchestrator validates each
 * stage's JSON against its schema before the next stage may run, and a
 * failure means retry-with-errors, not a corrupted plan.
 *
 * Pipeline:  TestBasis → Analysis → RiskRegister → (istqb engine) →
 *            DesignOutput → CriticReport
 */

export * from "./test-basis.js";
export * from "./analysis.js";
export * from "./risk.js";
export * from "./test-case.js";
export * from "./test-run.js";
export * from "./critic.js";

import type { StrategyInput } from "@kriteria/istqb";
import type { Analysis } from "./analysis.js";
import type { RiskRegister } from "./risk.js";

/**
 * Bridges validated agent output into the deterministic engine.
 *
 * Deliberately sets overallRisk to "low": @kriteria/istqb ignores the claim
 * and recomputes it from the register, so no agent can talk the depth down.
 */
export function toStrategyInput(
  analysis: Analysis,
  risks: RiskRegister,
): StrategyInput {
  return {
    context: { ...analysis.signals.context, overallRisk: "low" },
    system: analysis.signals.system,
    risks: risks.factors.map((f) => ({
      id: f.id,
      description: f.description,
      area: f.area,
      likelihood: f.likelihood as StrategyInput["risks"][number]["likelihood"],
      impact: f.impact as StrategyInput["risks"][number]["impact"],
    })),
    traits: analysis.signals.traits,
  };
}
