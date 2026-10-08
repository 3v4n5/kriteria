/**
 * Generates the independent baseline judgement for a ticket.
 *
 * The isolation claim is STRUCTURAL, not a promise in a comment:
 * `buildBaselinePrompt` accepts a single string — the brief's text — so no
 * plan, strategy, golden entry or critic report can reach the model even by
 * mistake. The brief's digest is recorded alongside the answer, so a stale
 * baseline is detectable rather than silently trusted.
 *
 * Costs one Opus call per ticket against a small output form. It is not free,
 * so it never runs as part of `qa eval`.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BASELINE_REVIEWER_SYSTEM,
  DEFAULT_ROUTING,
  estimateCostUsd,
  runAgent,
  type AgentRunRecord,
  type CallModel,
} from "@kriteria/agents";
import { ExpectationSchema, type Expectation } from "@kriteria/evals";
import { stringify as toYaml } from "yaml";

/**
 * Builds the user message. Takes ONLY the brief — the signature is the
 * isolation guarantee, and a test asserts nothing else leaks in.
 */
export function buildBaselinePrompt(brief: string): string {
  return `Below is one work item. Decide how you would test it.

Leave any field empty where you do not hold a real opinion.

---

${brief.trim()}`;
}

export function briefDigest(brief: string): string {
  return createHash("sha256").update(brief, "utf8").digest("hex");
}

export interface BaselineCommandOptions {
  keys: readonly string[];
  call: CallModel;
  evalsDir?: string;
  /** Overwrite an existing baseline instead of skipping it. */
  force?: boolean;
  log?: (message: string) => void;
}

export interface BaselineCommandResult {
  key: string;
  written: boolean;
  skipped?: string;
  expectation?: Expectation;
  run?: AgentRunRecord;
  costUsd?: number;
}

export async function baselineCommand(
  options: BaselineCommandOptions,
): Promise<BaselineCommandResult[]> {
  const evalsDir = options.evalsDir ?? "evals";
  const log = options.log ?? (() => {});
  const briefsDir = join(evalsDir, "briefs");
  const baselineDir = join(evalsDir, "baseline");
  mkdirSync(baselineDir, { recursive: true });

  const route = DEFAULT_ROUTING["baseline-reviewer"];
  const results: BaselineCommandResult[] = [];

  for (const key of options.keys) {
    const briefPath = join(briefsDir, `${key}.md`);
    if (!existsSync(briefPath)) {
      log(`  ✗ ${key}: no hay brief en ${briefPath}`);
      results.push({ key, written: false, skipped: "sin brief" });
      continue;
    }

    const outPath = join(baselineDir, `${key}.yml`);
    if (existsSync(outPath) && !options.force) {
      log(`  · ${key}: baseline ya existe (--force para regenerar)`);
      results.push({ key, written: false, skipped: "ya existe" });
      continue;
    }

    const brief = readFileSync(briefPath, "utf8");
    const { output, record } = await runAgent(
      {
        role: "baseline-reviewer",
        system: BASELINE_REVIEWER_SYSTEM,
        // The only thing the model sees.
        user: buildBaselinePrompt(brief),
        schema: ExpectationSchema,
        ...route,
      },
      options.call,
    );

    const costUsd = estimateCostUsd(record.model, record.usage);
    writeFileSync(
      outPath,
      `${BASELINE_HEADER}\n${toYaml({
        workItem: key,
        source: {
          model: record.model,
          generatedAt: new Date().toISOString(),
          briefSha256: briefDigest(brief),
        },
        expect: output,
      })}`,
      "utf8",
    );

    log(
      `  ✓ ${key}: ${describe(output)} — ${record.usage.inputTokens}/${record.usage.outputTokens} tok ≈ $${costUsd.toFixed(3)}`,
    );
    results.push({ key, written: true, expectation: output, run: record, costUsd });
  }

  return results;
}

const BASELINE_HEADER = `# ─────────────────────────────────────────────────────────────────────────────
# BASELINE — juicio de un modelo independiente. NO es el golden set.
#
# Generado por un agente que vio UNICAMENTE el brief de este ticket: ni el
# plan de Kriteria, ni la estrategia, ni el golden. La aislacion la impone la
# firma de buildBaselinePrompt, que solo acepta el texto del brief, y
# source.briefSha256 digiere ese unico documento.
#
# Para que sirve: el eval compara tres pares — Kriteria vs humano (el gate de
# Fase 0), Kriteria vs este baseline, y humano vs este baseline. El tercero
# dice si el juicio de un modelo PREDICE el de un humano.
#
# Limite honesto: este baseline es la misma familia de modelo que el pipeline,
# razonando sobre la misma literatura ISTQB. El acuerdo entre ambos es
# evidencia debil. Lo informativo es el desacuerdo, y el acuerdo con el humano.
#
# NO copies esto a evals/golden/. Ahi va tu criterio.
# ─────────────────────────────────────────────────────────────────────────────`;

function describe(e: Expectation): string {
  const parts = [
    e.approach,
    e.depth,
    e.riskLevel ? `riesgo ${e.riskLevel}` : undefined,
    e.mandatoryTechniques.length > 0
      ? `${e.mandatoryTechniques.length} técnica(s)`
      : undefined,
    e.ambiguityTopics.length > 0
      ? `${e.ambiguityTopics.length} ambigüedad(es)`
      : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "sin opinión registrada";
}
