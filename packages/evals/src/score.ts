/**
 * Scoring — comparing a produced plan against a senior QA's expectations.
 *
 * Every dimension resolves to one of four states, and the distinction between
 * the last two is what keeps the number meaningful:
 *
 *   match       — the plan decided what was expected
 *   acceptable  — a listed alternative, not the first choice
 *   mismatch    — a real disagreement
 *   not-scored  — no expectation was recorded, so nothing is claimed
 *
 * `not-scored` never counts as a pass. A sparse golden entry yields a small
 * denominator and says so, rather than reporting a flattering ratio over
 * dimensions nobody committed to.
 */

import type { Expectation, GoldenEntry } from "./golden.js";

/** The subset of a produced plan the scorer reads. */
export interface ActualPlan {
  workItem: string;
  approach: string;
  supportingApproaches: string[];
  depth: string;
  riskLevel: string;
  levels: string[];
  types: string[];
  mandatoryTechniques: string[];
  /** Ambiguity questions, as written in the plan. */
  ambiguities: string[];
  /** Risk descriptions, as written in the register. */
  risks: string[];
  caseCount: number;
  /**
   * Structural gaps left by the mechanical audit. `null` means the run has no
   * audit at all (an older artifact) — absence of a report is not a clean
   * report, so it scores as a mismatch with its own wording.
   */
  auditFindingCount: number | null;
}

export type DimensionStatus = "match" | "acceptable" | "mismatch" | "not-scored";

export interface DimensionScore {
  dimension: string;
  status: DimensionStatus;
  detail: string;
}

export interface EvalResult {
  workItem: string;
  dimensions: DimensionScore[];
  /** Dimensions that were actually scored (match + acceptable + mismatch). */
  scored: number;
  matched: number;
  /** matched / scored, or null when nothing was scored. */
  ratio: number | null;
  humanVerdict: GoldenEntry["humanVerdict"];
}

/** Accent- and case-insensitive containment, for topic matching. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function mentions(haystack: readonly string[], topic: string): boolean {
  const needle = normalize(topic);
  return haystack.some((entry) => normalize(entry).includes(needle));
}

export function scorePlan(golden: GoldenEntry, actual: ActualPlan): EvalResult {
  const e: Expectation = golden.expect;
  const dimensions: DimensionScore[] = [];

  const add = (dimension: string, status: DimensionStatus, detail: string) =>
    dimensions.push({ dimension, status, detail });

  const skip = (dimension: string) =>
    add(dimension, "not-scored", "sin expectativa registrada");

  // --- approach -------------------------------------------------------------
  if (e.approach === undefined) {
    skip("enfoque");
  } else if (actual.approach === e.approach) {
    add("enfoque", "match", `${actual.approach} como se esperaba`);
  } else if (e.approachAlternatives.includes(actual.approach as never)) {
    add(
      "enfoque",
      "acceptable",
      `${actual.approach} es una alternativa aceptada (esperado ${e.approach})`,
    );
  } else if (actual.supportingApproaches.includes(e.approach)) {
    add(
      "enfoque",
      "acceptable",
      `${e.approach} quedó como apoyo y no como primario (primario: ${actual.approach})`,
    );
  } else {
    add("enfoque", "mismatch", `esperado ${e.approach}, obtenido ${actual.approach}`);
  }

  // --- depth / risk ---------------------------------------------------------
  for (const [dimension, expected, got] of [
    ["profundidad", e.depth, actual.depth],
    ["nivel de riesgo", e.riskLevel, actual.riskLevel],
  ] as const) {
    if (expected === undefined) skip(dimension);
    else if (expected === got) add(dimension, "match", `${got} como se esperaba`);
    else add(dimension, "mismatch", `esperado ${expected}, obtenido ${got}`);
  }

  // --- required sets --------------------------------------------------------
  for (const [dimension, required, got] of [
    ["niveles", e.levels, actual.levels],
    ["tipos", e.types, actual.types],
    ["técnicas obligatorias", e.mandatoryTechniques, actual.mandatoryTechniques],
  ] as const) {
    if (required.length === 0) {
      skip(dimension);
      continue;
    }
    const missing = required.filter((item) => !got.includes(item));
    if (missing.length === 0) {
      add(dimension, "match", `presentes: ${required.join(", ")}`);
    } else {
      add(dimension, "mismatch", `faltan: ${missing.join(", ")}`);
    }
  }

  // --- topics the plan had to raise ----------------------------------------
  for (const [dimension, topics, haystack] of [
    ["ambigüedades", e.ambiguityTopics, actual.ambiguities],
    ["riesgos identificados", e.riskTopics, actual.risks],
  ] as const) {
    if (topics.length === 0) {
      skip(dimension);
      continue;
    }
    const missed = topics.filter((topic) => !mentions(haystack, topic));
    if (missed.length === 0) {
      add(dimension, "match", `cubiertos ${topics.length} tema(s)`);
    } else {
      add(dimension, "mismatch", `sin levantar: ${missed.join("; ")}`);
    }
  }

  // --- volume ---------------------------------------------------------------
  if (e.minCases === undefined && e.maxCases === undefined) {
    skip("cantidad de casos");
  } else {
    const tooFew = e.minCases !== undefined && actual.caseCount < e.minCases;
    const tooMany = e.maxCases !== undefined && actual.caseCount > e.maxCases;
    if (!tooFew && !tooMany) {
      add("cantidad de casos", "match", `${actual.caseCount} casos dentro del rango`);
    } else {
      add(
        "cantidad de casos",
        "mismatch",
        `${actual.caseCount} casos, esperado ${e.minCases ?? "—"}..${e.maxCases ?? "—"}`,
      );
    }
  }

  // --- structural cleanliness ----------------------------------------------
  if (!e.requireCleanAudit) {
    skip("auditoría mecánica");
  } else if (actual.auditFindingCount === null) {
    add(
      "auditoría mecánica",
      "mismatch",
      "la corrida no trae auditoría (artefacto anterior a esta capacidad)",
    );
  } else if (actual.auditFindingCount === 0) {
    add("auditoría mecánica", "match", "sin huecos estructurales");
  } else {
    add(
      "auditoría mecánica",
      "mismatch",
      `${actual.auditFindingCount} hueco(s) estructural(es) sin cerrar`,
    );
  }

  const scored = dimensions.filter((d) => d.status !== "not-scored").length;
  const matched = dimensions.filter(
    (d) => d.status === "match" || d.status === "acceptable",
  ).length;

  return {
    workItem: golden.workItem,
    dimensions,
    scored,
    matched,
    ratio: scored === 0 ? null : Math.round((matched / scored) * 100) / 100,
    humanVerdict: golden.humanVerdict,
  };
}

export interface SuiteSummary {
  results: EvalResult[];
  /** Mechanical: matched dimensions over scored dimensions, all items. */
  dimensionRatio: number | null;
  /** The Fase-0 metric: items a human confirmed, over items reviewed. */
  humanApproved: number;
  humanReviewed: number;
  humanPending: number;
}

export function summarizeSuite(results: readonly EvalResult[]): SuiteSummary {
  const scored = results.reduce((sum, r) => sum + r.scored, 0);
  const matched = results.reduce((sum, r) => sum + r.matched, 0);
  const verdicts = results.map((r) => r.humanVerdict.wouldHaveDoneThis);

  return {
    results: [...results],
    dimensionRatio: scored === 0 ? null : Math.round((matched / scored) * 100) / 100,
    humanApproved: verdicts.filter((v) => v === true).length,
    humanReviewed: verdicts.filter((v) => v !== null).length,
    humanPending: verdicts.filter((v) => v === null).length,
  };
}
