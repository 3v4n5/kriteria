/**
 * The baseline track — an independent model's judgement, kept OUT of the
 * golden set.
 *
 * Why it exists. Filling `expect` with a model's opinion would make the eval
 * measure the system against itself, so that stays forbidden. But a model
 * expectation recorded in a SEPARATE file costs nothing and answers a
 * question the golden set alone cannot:
 *
 *   Kriteria vs human     → the Fase 0 gate
 *   Kriteria vs baseline  → consistency between models
 *   human vs baseline     → whether model judgement PREDICTS human judgement
 *
 * The third is the one that decides whether the corpus can ever be scaled
 * with model judgement and validated by sampling, or whether every entry has
 * to be hand-written forever.
 *
 * Honest limitation, stated here rather than discovered later: the baseline
 * is the same model family as the pipeline, reasoning from the same ISTQB
 * literature. Agreement between them is weak evidence. Disagreement, and
 * agreement with the HUMAN, are the informative outcomes.
 */

import { z } from "zod/v4";
import { ExpectationSchema, type Expectation } from "./golden.js";
import type { DimensionScore, DimensionStatus } from "./score.js";
import { topicsOverlap } from "./text.js";

export const BaselineEntrySchema = z.object({
  workItem: z.string().min(1),
  /**
   * Provenance. `briefSha256` is the whole isolation claim made auditable:
   * it digests the ONLY document the model was given. If the brief changes,
   * the baseline is stale and says so.
   */
  source: z.object({
    model: z.string().min(1),
    generatedAt: z.string(),
    briefSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  expect: ExpectationSchema,
});
export type BaselineEntry = z.infer<typeof BaselineEntrySchema>;

export interface AgreementResult {
  workItem: string;
  dimensions: DimensionScore[];
  /** Dimensions where BOTH sides recorded an opinion. */
  compared: number;
  agreed: number;
  /** agreed / compared, or null when they never both committed to anything. */
  ratio: number | null;
}

/**
 * Compares two expectations — typically the human's against the model's.
 *
 * The scoring rule differs from `scorePlan` on purpose. A plan always has a
 * value for every dimension, so there it is enough for the golden side to
 * hold an opinion. Here BOTH sides can be silent, and a dimension only one
 * of them answered is not a disagreement — it is an absence. Those are
 * reported `not-scored` and never counted either way.
 */
export function compareExpectations(
  workItem: string,
  human: Expectation,
  baseline: Expectation,
): AgreementResult {
  const dimensions: DimensionScore[] = [];
  const add = (dimension: string, status: DimensionStatus, detail: string) =>
    dimensions.push({ dimension, status, detail });
  const bothMustSpeak = (dimension: string) =>
    add(dimension, "not-scored", "una de las dos partes no se pronunció");

  // --- approach -------------------------------------------------------------
  if (human.approach === undefined || baseline.approach === undefined) {
    bothMustSpeak("enfoque");
  } else if (human.approach === baseline.approach) {
    add("enfoque", "match", `ambos: ${human.approach}`);
  } else if (
    human.approachAlternatives.includes(baseline.approach) ||
    baseline.approachAlternatives.includes(human.approach)
  ) {
    add(
      "enfoque",
      "acceptable",
      `distintos pero mutuamente aceptados (humano ${human.approach}, modelo ${baseline.approach})`,
    );
  } else {
    add(
      "enfoque",
      "mismatch",
      `humano ${human.approach}, modelo ${baseline.approach}`,
    );
  }

  // --- scalar judgements ----------------------------------------------------
  for (const [dimension, a, b] of [
    ["profundidad", human.depth, baseline.depth],
    ["nivel de riesgo", human.riskLevel, baseline.riskLevel],
  ] as const) {
    if (a === undefined || b === undefined) bothMustSpeak(dimension);
    else if (a === b) add(dimension, "match", `ambos: ${a}`);
    else add(dimension, "mismatch", `humano ${a}, modelo ${b}`);
  }

  // --- required sets --------------------------------------------------------
  // Agreement means the model demanded everything the human demanded. Extra
  // demands from the model are not a disagreement about the human's claim.
  for (const [dimension, a, b] of [
    ["niveles", human.levels, baseline.levels],
    ["tipos", human.types, baseline.types],
    [
      "técnicas obligatorias",
      human.mandatoryTechniques,
      baseline.mandatoryTechniques,
    ],
  ] as const) {
    if (a.length === 0 || b.length === 0) {
      bothMustSpeak(dimension);
      continue;
    }
    const missing = a.filter((item) => !(b as readonly string[]).includes(item));
    if (missing.length === 0) {
      add(dimension, "match", `el modelo cubre los ${a.length} del humano`);
    } else {
      add(dimension, "mismatch", `el modelo no exigió: ${missing.join(", ")}`);
    }
  }

  // --- topics ---------------------------------------------------------------
  for (const [dimension, a, b] of [
    ["ambigüedades", human.ambiguityTopics, baseline.ambiguityTopics],
    ["riesgos identificados", human.riskTopics, baseline.riskTopics],
  ] as const) {
    if (a.length === 0 || b.length === 0) {
      bothMustSpeak(dimension);
      continue;
    }
    const missed = a.filter((topic) => !topicsOverlap(topic, b));
    if (missed.length === 0) {
      add(dimension, "match", `el modelo nombró los ${a.length} del humano`);
    } else {
      add(dimension, "mismatch", `el modelo no nombró: ${missed.join("; ")}`);
    }
  }

  // --- volume ---------------------------------------------------------------
  // Two ranges agree when they OVERLAP. Comparing midpoints would invent a
  // precision neither side claimed.
  const humanRange = human.minCases !== undefined || human.maxCases !== undefined;
  const modelRange =
    baseline.minCases !== undefined || baseline.maxCases !== undefined;
  if (!humanRange || !modelRange) {
    bothMustSpeak("cantidad de casos");
  } else {
    const lowA = human.minCases ?? 0;
    const highA = human.maxCases ?? Number.POSITIVE_INFINITY;
    const lowB = baseline.minCases ?? 0;
    const highB = baseline.maxCases ?? Number.POSITIVE_INFINITY;
    const label = (lo: number, hi: number) =>
      `${lo}..${hi === Number.POSITIVE_INFINITY ? "∞" : hi}`;
    if (lowA <= highB && lowB <= highA) {
      add(
        "cantidad de casos",
        "match",
        `rangos se solapan (humano ${label(lowA, highA)}, modelo ${label(lowB, highB)})`,
      );
    } else {
      add(
        "cantidad de casos",
        "mismatch",
        `rangos disjuntos (humano ${label(lowA, highA)}, modelo ${label(lowB, highB)})`,
      );
    }
  }

  const compared = dimensions.filter((d) => d.status !== "not-scored").length;
  const agreed = dimensions.filter(
    (d) => d.status === "match" || d.status === "acceptable",
  ).length;

  return {
    workItem,
    dimensions,
    compared,
    agreed,
    ratio: compared === 0 ? null : Math.round((agreed / compared) * 100) / 100,
  };
}

export interface AgreementSummary {
  results: AgreementResult[];
  compared: number;
  agreed: number;
  ratio: number | null;
}

export function summarizeAgreement(
  results: readonly AgreementResult[],
): AgreementSummary {
  const compared = results.reduce((sum, r) => sum + r.compared, 0);
  const agreed = results.reduce((sum, r) => sum + r.agreed, 0);
  return {
    results: [...results],
    compared,
    agreed,
    ratio: compared === 0 ? null : Math.round((agreed / compared) * 100) / 100,
  };
}
