/**
 * Mechanical plan audit — counting, done by code.
 *
 * Traceability is structural in our schemas, so most of what a reviewer does
 * on a first pass is arithmetic: does every feature have a case, does every
 * mandatory technique appear at its level, do the ids resolve. Computing that
 * here has three effects:
 *
 *  1. The gaps are found for free and deterministically, every time.
 *  2. The designer can be sent back to fix them WITHOUT spending a critic call.
 *  3. The critic receives the coverage table already computed, so its tokens
 *     go to judgement — weak cases, contradictions, strategy mismatch — which
 *     is the only thing a model does better than a `for` loop.
 *
 * Everything here is deterministic and domain-agnostic.
 */

import type { Analysis, DesignedCase, DesignOutput, RiskRegister } from "@kriteria/core";
import type { TestStrategy } from "@kriteria/istqb";

export const AUDIT_KINDS = [
  "uncovered-feature",
  "unverified-criterion",
  "untested-rule",
  "unmitigated-risk",
  "technique-not-applied",
  "dangling-reference",
  "unexecutable-auto-case",
  "budget-exceeded",
] as const;
export type AuditKind = (typeof AUDIT_KINDS)[number];

export interface AuditFinding {
  kind: AuditKind;
  /** blocker = a defect could ship undetected; major = traceability degraded. */
  severity: "blocker" | "major";
  summary: string;
  refs: string[];
}

export interface CoverageTable {
  features: { id: string; cases: string[] }[];
  acceptanceCriteria: { id: string; testable: boolean; cases: string[] }[];
  businessRules: { id: string; cases: string[] }[];
  risks: { id: string; priority: boolean; cases: string[] }[];
  techniquesByLevel: {
    level: string;
    technique: string;
    mandatory: boolean;
    cases: string[];
  }[];
}

export interface PlanAudit {
  findings: AuditFinding[];
  coverage: CoverageTable;
  /** True when at least one finding is a blocker — triggers a free revision. */
  hasBlockers: boolean;
  caseCount: number;
}

export interface AuditInput {
  analysis: Analysis;
  risks: RiskRegister;
  strategy: TestStrategy;
  design: DesignOutput;
  /** Acceptance criteria from the basis: id → testable. */
  acceptanceCriteria: { id: string; testable: boolean }[];
}

export function auditPlan(input: AuditInput): PlanAudit {
  const { analysis, risks, strategy, design, acceptanceCriteria } = input;
  const cases = design.cases;
  const findings: AuditFinding[] = [];

  // --- coverage tables ------------------------------------------------------

  const casesFor = (pick: (c: DesignedCase) => readonly string[], id: string) =>
    cases.filter((c) => pick(c).includes(id)).map((c) => c.id);

  const features = analysis.features.map((f) => ({
    id: f.id,
    cases: casesFor((c) => c.covers, f.id),
  }));

  const criteria = acceptanceCriteria.map((ac) => ({
    id: ac.id,
    testable: ac.testable,
    cases: casesFor((c) => c.verifies, ac.id),
  }));

  const rules = analysis.businessRules.map((r) => ({
    id: r.id,
    cases: casesFor((c) => c.validates, r.id),
  }));

  const priorityRiskIds = new Set(strategy.risk.priorityFactors.map((f) => f.id));
  const riskRows = risks.factors.map((r) => ({
    id: r.id,
    priority: priorityRiskIds.has(r.id),
    cases: casesFor((c) => c.mitigates, r.id),
  }));

  const techniqueRows = strategy.techniquesByLevel.flatMap((lt) =>
    lt.techniques.map((t) => ({
      level: lt.level,
      technique: t.technique,
      mandatory: t.mandatory,
      cases: cases
        .filter((c) => c.level === lt.level && c.technique === t.technique)
        .map((c) => c.id),
    })),
  );

  // --- findings -------------------------------------------------------------

  for (const f of features.filter((x) => x.cases.length === 0)) {
    findings.push({
      kind: "uncovered-feature",
      severity: "blocker",
      summary: `el feature ${f.id} no tiene ningún caso que lo cubra`,
      refs: [f.id],
    });
  }

  for (const ac of criteria.filter((x) => x.testable && x.cases.length === 0)) {
    findings.push({
      kind: "unverified-criterion",
      severity: "blocker",
      summary: `el criterio de aceptación ${ac.id} es testeable y ningún caso lo verifica`,
      refs: [ac.id],
    });
  }

  for (const r of rules.filter((x) => x.cases.length === 0)) {
    findings.push({
      kind: "untested-rule",
      severity: "major",
      summary: `la regla de negocio ${r.id} no es ejercida por ningún caso`,
      refs: [r.id],
    });
  }

  for (const r of riskRows.filter((x) => x.priority && x.cases.length === 0)) {
    findings.push({
      kind: "unmitigated-risk",
      severity: "blocker",
      summary: `el riesgo prioritario ${r.id} no es mitigado por ningún caso`,
      refs: [r.id],
    });
  }

  for (const t of techniqueRows.filter((x) => x.mandatory && x.cases.length === 0)) {
    findings.push({
      kind: "technique-not-applied",
      severity: "blocker",
      summary: `la técnica obligatoria ${t.technique} no tiene ningún caso en el nivel ${t.level}`,
      refs: [`${t.level}:${t.technique}`],
    });
  }

  // Dangling references: a case citing an id that does not exist anywhere.
  const known = {
    FEA: new Set(analysis.features.map((f) => f.id)),
    AC: new Set(acceptanceCriteria.map((a) => a.id)),
    BR: new Set(analysis.businessRules.map((r) => r.id)),
    RSK: new Set(risks.factors.map((r) => r.id)),
  };
  for (const c of cases) {
    const dangling = [
      ...c.covers.filter((id) => !known.FEA.has(id)),
      ...c.verifies.filter((id) => !known.AC.has(id)),
      ...c.validates.filter((id) => !known.BR.has(id)),
      ...c.mitigates.filter((id) => !known.RSK.has(id)),
    ];
    if (dangling.length > 0) {
      findings.push({
        kind: "dangling-reference",
        severity: "major",
        summary: `${c.id} referencia ids inexistentes: ${dangling.join(", ")}`,
        refs: [c.id, ...dangling],
      });
    }
  }

  // A case proposed as auto-api whose steps carry no executable spec is a
  // contradiction between the mode and the content — it would silently
  // degrade to a human checklist at run time.
  for (const c of cases.filter((x) => x.executionMode === "auto-api")) {
    const withoutSpec = c.steps.filter((s) => !s.api).length;
    if (withoutSpec > 0) {
      findings.push({
        kind: "unexecutable-auto-case",
        severity: "major",
        summary: `${c.id} se propone auto-api pero ${withoutSpec} de ${c.steps.length} paso(s) no traen especificación ejecutable`,
        refs: [c.id],
      });
    }
  }

  if (strategy.caseBudget.total !== null && cases.length > strategy.caseBudget.total) {
    findings.push({
      kind: "budget-exceeded",
      severity: "major",
      summary: `el diseño trae ${cases.length} casos y el presupuesto acordado es ${strategy.caseBudget.total}`,
      refs: [],
    });
  }

  return {
    findings,
    coverage: {
      features,
      acceptanceCriteria: criteria,
      businessRules: rules,
      risks: riskRows,
      techniquesByLevel: techniqueRows,
    },
    hasBlockers: findings.some((f) => f.severity === "blocker"),
    caseCount: cases.length,
  };
}

/** Compact rendering for the critic brief: gaps loud, coverage summarized. */
export function renderAudit(audit: PlanAudit): string {
  const lines: string[] = [];

  lines.push("### Auditoría mecánica (ya calculada — no la recalcules)");
  lines.push("");
  if (audit.findings.length === 0) {
    lines.push("Sin huecos estructurales: cobertura, trazabilidad y técnicas obligatorias verificadas.");
  } else {
    lines.push("Huecos estructurales detectados por código:");
    for (const f of audit.findings) {
      lines.push(`- [${f.severity}] ${f.kind}: ${f.summary}`);
    }
  }

  lines.push("");
  lines.push("Tabla de cobertura (id → casos):");
  const rows = [
    ...audit.coverage.features.map((f) => `  ${f.id}: ${f.cases.join(", ") || "—"}`),
    ...audit.coverage.acceptanceCriteria.map(
      (a) => `  ${a.id}${a.testable ? "" : " (no testeable)"}: ${a.cases.join(", ") || "—"}`,
    ),
    ...audit.coverage.businessRules.map((r) => `  ${r.id}: ${r.cases.join(", ") || "—"}`),
    ...audit.coverage.risks.map(
      (r) => `  ${r.id}${r.priority ? " (prioritario)" : ""}: ${r.cases.join(", ") || "—"}`,
    ),
    ...audit.coverage.techniquesByLevel
      .filter((t) => t.mandatory)
      .map((t) => `  ${t.level}/${t.technique} (obligatoria): ${t.cases.join(", ") || "—"}`),
  ];
  lines.push(...rows);
  lines.push("");
  lines.push(
    "Tu trabajo NO es repetir este conteo. Es juzgar lo que el código no puede: " +
      "si los casos realmente ejercen la técnica que declaran, si los pasos verifican " +
      "lo que el título promete, si hay contradicciones entre casos, y si la estrategia " +
      "encaja con las señales.",
  );
  return lines.join("\n");
}
