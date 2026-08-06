/**
 * Exit-criteria evaluation — numbers against numbers, not trust.
 *
 * A test plan's exit criteria are prose, but several of them are mechanically
 * checkable against the run: every case executed with evidence, high/critical
 * risks covered by a passing test, no severity-1/2 defect open, mandatory
 * techniques evidenced. Those get a verdict.
 *
 * Everything else returns `unknown` with `needsHumanConfirmation` — the
 * system says "I cannot verify this", never "probably fine". That honesty is
 * what makes the met/not-met verdicts trustworthy.
 */

import type {
  CaseResult,
  DesignedCase,
  ExitCriterionResult,
  ObservedDefect,
} from "@kriteria/core";

export interface ExitEvaluationContext {
  cases: readonly DesignedCase[];
  results: readonly CaseResult[];
  defects: readonly ObservedDefect[];
  /** Risk ids rated high or critical, from the strategy. */
  priorityRiskIds: readonly string[];
  /** Techniques the strategy marked mandatory, across all levels. */
  mandatoryTechniques: readonly string[];
}

type Matcher = {
  test: RegExp;
  evaluate: (ctx: ExitEvaluationContext) => Omit<ExitCriterionResult, "criterion">;
};

/** "1 caso ejecutado" / "3 casos ejecutados" — no "(s)" noise in the report. */
function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

const met = (detail: string): Omit<ExitCriterionResult, "criterion"> => ({
  status: "met",
  detail,
  needsHumanConfirmation: false,
});

const notMet = (detail: string): Omit<ExitCriterionResult, "criterion"> => ({
  status: "not-met",
  detail,
  needsHumanConfirmation: false,
});

const MATCHERS: Matcher[] = [
  {
    // "Every planned test case has been executed and its result recorded with evidence"
    test: /every planned test case .*executed|executed and its result recorded/i,
    evaluate: ({ results }) => {
      const unexecuted = results.filter(
        (r) => r.status === "not-run" || r.status === "blocked",
      );
      if (unexecuted.length > 0) {
        return notMet(
          `${plural(unexecuted.length, "caso sin ejecutar", "casos sin ejecutar")}: ${unexecuted.map((r) => r.caseId).join(", ")}`,
        );
      }
      const noEvidence = results.filter(
        (r) => r.status !== "skipped" && r.evidence.length === 0,
      );
      if (noEvidence.length > 0) {
        return notMet(
          `${plural(noEvidence.length, "caso ejecutado sin evidencia", "casos ejecutados sin evidencia")}: ${noEvidence.map((r) => r.caseId).join(", ")}`,
        );
      }
      return met(`${plural(results.length, "caso ejecutado", "casos ejecutados")} con evidencia registrada`);
    },
  },
  {
    // "Each risk factor rated high or critical is covered by at least one passing test"
    test: /risk factor rated high or critical|high or critical .*covered/i,
    evaluate: ({ cases, results, priorityRiskIds }) => {
      if (priorityRiskIds.length === 0) {
        return met("no hay riesgos altos o críticos en el registro");
      }
      const passedCaseIds = new Set(
        results.filter((r) => r.status === "pass").map((r) => r.caseId),
      );
      const uncovered = priorityRiskIds.filter(
        (riskId) =>
          !cases.some((c) => c.mitigates.includes(riskId) && passedCaseIds.has(c.id)),
      );
      return uncovered.length === 0
        ? met(plural(priorityRiskIds.length, "riesgo prioritario cubierto", "riesgos prioritarios cubiertos") + " por una prueba en verde")
        : notMet(`sin prueba en verde: ${uncovered.join(", ")}`);
    },
  },
  {
    // "No open defect of severity 1 or 2 remains against the change"
    test: /no open defect|defect of severity 1 or 2/i,
    evaluate: ({ defects }) => {
      const severe = defects.filter((d) => d.severity <= 2);
      return severe.length === 0
        ? met("sin defectos de severidad 1 o 2 registrados en la corrida")
        : notMet(
            `${plural(severe.length, "defecto abierto", "defectos abiertos")} de severidad ≤2: ${severe.map((d) => d.id).join(", ")}`,
          );
    },
  },
  {
    // "Mandatory techniques applied and evidenced: ..."
    test: /mandatory techniques applied/i,
    evaluate: ({ cases, results, mandatoryTechniques }) => {
      if (mandatoryTechniques.length === 0) return met("sin técnicas obligatorias declaradas");
      const executedIds = new Set(
        results.filter((r) => r.status === "pass" || r.status === "fail").map((r) => r.caseId),
      );
      const missing = mandatoryTechniques.filter(
        (technique) =>
          !cases.some((c) => c.technique === technique && executedIds.has(c.id)),
      );
      return missing.length === 0
        ? met(`${plural(mandatoryTechniques.length, "técnica obligatoria ejercida", "técnicas obligatorias ejercidas")}`)
        : notMet(`sin caso ejecutado: ${missing.join(", ")}`);
    },
  },
];

export function evaluateExitCriteria(
  criteria: readonly string[],
  ctx: ExitEvaluationContext,
): ExitCriterionResult[] {
  return criteria.map((criterion) => {
    const matcher = MATCHERS.find((m) => m.test.test(criterion));
    if (!matcher) {
      return {
        criterion,
        status: "unknown",
        detail: "el sistema no puede verificar este criterio automáticamente",
        needsHumanConfirmation: true,
      };
    }
    return { criterion, ...matcher.evaluate(ctx) };
  });
}
