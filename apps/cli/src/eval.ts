/**
 * `kriteria eval` — score produced plans against the golden set.
 *
 * Reads `evals/golden/*.yml` and the matching `out/<REF>/` artifacts. No API
 * calls: measuring is free and repeatable, so it can run after every prompt
 * or engine change without a token budget conversation.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  GoldenEntrySchema,
  scorePlan,
  summarizeSuite,
  type ActualPlan,
  type EvalResult,
} from "@kriteria/evals";
import { parse as fromYaml } from "yaml";

export interface EvalCommandOptions {
  goldenDir: string;
  outDir: string;
  resultsDir: string;
  /** Score only this work item. */
  only?: string;
}

const ICON: Record<string, string> = {
  match: "✅",
  acceptable: "🟡",
  mismatch: "❌",
  "not-scored": "◻️",
};

export function evalCommand(options: EvalCommandOptions): void {
  const goldenDir = resolve(options.goldenDir);
  if (!existsSync(goldenDir)) {
    throw new Error(`no existe el directorio del golden set: ${goldenDir}`);
  }

  const files = readdirSync(goldenDir).filter((f) => /\.ya?ml$/.test(f));
  if (files.length === 0) {
    throw new Error(
      `el golden set está vacío. Copia evals/golden/_plantilla.yml y llénala con tu criterio antes de medir.`,
    );
  }

  const results: EvalResult[] = [];
  const skipped: string[] = [];

  for (const file of files.sort()) {
    if (file.startsWith("_")) continue; // templates
    const golden = GoldenEntrySchema.parse(
      fromYaml(readFileSync(join(goldenDir, file), "utf8")),
    );
    if (options.only && golden.workItem !== options.only) continue;

    const planDir = join(resolve(options.outDir), golden.workItem);
    if (!existsSync(join(planDir, "testplan.yml"))) {
      skipped.push(`${golden.workItem} (sin artefactos en ${planDir})`);
      continue;
    }

    results.push(scorePlan(golden, readActualPlan(planDir, golden.workItem)));
  }

  if (results.length === 0) {
    console.log("Nada que medir.");
    for (const s of skipped) console.log(`  ◻️ ${s}`);
    return;
  }

  // --- report ---------------------------------------------------------------
  for (const r of results) {
    const verdict =
      r.humanVerdict.wouldHaveDoneThis === true
        ? "✅ el QA lo aprobó"
        : r.humanVerdict.wouldHaveDoneThis === false
          ? "❌ el QA no lo haría así"
          : "⏳ sin revisión humana";
    console.log(
      `\n■ ${r.workItem} — ${r.matched}/${r.scored} dimensiones (${r.ratio === null ? "—" : `${Math.round(r.ratio * 100)}%`}) · ${verdict}`,
    );
    for (const d of r.dimensions) {
      console.log(`  ${ICON[d.status]} ${d.dimension}: ${d.detail}`);
    }
    if (r.humanVerdict.notes) console.log(`  📝 ${r.humanVerdict.notes}`);
  }

  const summary = summarizeSuite(results);
  console.log(`\n${"─".repeat(64)}`);
  console.log(
    `Puntaje mecánico: ${summary.dimensionRatio === null ? "—" : `${Math.round(summary.dimensionRatio * 100)}%`} de las dimensiones evaluadas`,
  );
  console.log(
    `Criterio de Fase 0: ${summary.humanApproved}/${summary.humanReviewed} planes aprobados por el QA` +
      (summary.humanPending > 0 ? ` · ${summary.humanPending} sin revisar` : ""),
  );
  if (summary.humanReviewed >= 5) {
    console.log(
      summary.humanApproved >= 3
        ? "  ✅ umbral ≥3/5 alcanzado"
        : "  ❌ umbral ≥3/5 NO alcanzado — el juicio del sistema necesita trabajo",
    );
  }
  for (const s of skipped) console.log(`  ◻️ omitido: ${s}`);

  mkdirSync(resolve(options.resultsDir), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const path = join(resolve(options.resultsDir), `${stamp}.json`);
  writeFileSync(path, JSON.stringify(summary, null, 2), "utf8");
  console.log(`\nresultados: ${path}`);
}

/** Projects the produced artifacts onto the shape the scorer reads. */
function readActualPlan(planDir: string, workItem: string): ActualPlan {
  const plan = fromYaml(readFileSync(join(planDir, "testplan.yml"), "utf8"));
  const cases = fromYaml(readFileSync(join(planDir, "testcases.yml"), "utf8"));
  const auditPath = join(planDir, "audit.json");
  const audit = existsSync(auditPath)
    ? (JSON.parse(readFileSync(auditPath, "utf8")) as { findings: unknown[] })
    : null;

  const mandatory = new Set<string>();
  for (const level of plan.strategy.techniquesByLevel ?? []) {
    for (const t of level.techniques ?? []) {
      if (t.mandatory) mandatory.add(t.technique);
    }
  }

  return {
    workItem,
    approach: plan.strategy.approach,
    supportingApproaches: plan.strategy.supporting ?? [],
    depth: plan.strategy.depth,
    riskLevel: plan.strategy.overallRisk,
    levels: (plan.strategy.levels ?? []).map((l: { value: string }) => l.value),
    types: (plan.strategy.types ?? []).map((t: { value: string }) => t.value),
    mandatoryTechniques: [...mandatory],
    ambiguities: (plan.analysis?.ambiguities ?? []).map(
      (a: { question: string }) => a.question,
    ),
    risks: (plan.riskRegister?.factors ?? []).map(
      (f: { description: string }) => f.description,
    ),
    caseCount: (cases.cases ?? []).length,
    // A missing audit file is reported as such, not as zero gaps — a stale
    // artifact must never score a false pass.
    auditFindingCount: audit === null ? null : audit.findings.length,
  };
}
