/**
 * `kriteria run` — guided execution.
 *
 * Walks a human through every case the router could not automate, one step at
 * a time, capturing verdicts, evidence and defects, and writes testrun.yml
 * plus an ISTQB closure report.
 *
 * Resumable by design: a manual run of a dozen cases takes hours, so state is
 * persisted after every case and an interrupted session picks up where it
 * left off instead of starting over.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  CaseResultSchema,
  TestRunSchema,
  type CaseResult,
  type DesignedCase,
  type EvidenceRef,
  type ObservedDefect,
  type StepResult,
  type TestRun,
} from "@kriteria/core";
import {
  MutationNotApprovedError,
  createFetchClient,
  evaluateExitCriteria,
  runApiCase,
  selectAutonomousCases,
  selectGuidedCases,
  summarize,
  verdictFor,
  type ApiRunContext,
  type HttpClient,
  type RunnableCase,
} from "@kriteria/execution";
import type { ExecutionMode } from "@kriteria/istqb";
import { parse as fromYaml, stringify as toYaml } from "yaml";

const MODE_ES: Record<string, string> = {
  "guided-manual": "manual guiada",
  "dev-guide": "guía para dev",
  "human-only": "solo humano",
};

/** Prompts the operator and resolves with their answer. */
export type Ask = (prompt: string) => Promise<string>;

/** Thrown when input is exhausted — treated as "save and exit", not a crash. */
export class EndOfInput extends Error {
  constructor() {
    super("end of input");
    this.name = "EndOfInput";
  }
}

/**
 * Line-iterator asker.
 *
 * `rl.question()` cannot be used here: with piped stdin every line arrives in
 * one chunk, and lines emitted while no question is pending are dropped. The
 * async iterator pauses the stream between reads, so it works identically for
 * an interactive terminal and for scripted input.
 */
export function createAsker(input: NodeJS.ReadableStream): {
  ask: Ask;
  close: () => void;
} {
  const rl = createInterface({ input, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  return {
    ask: async (prompt) => {
      process.stdout.write(prompt);
      const { value, done } = await lines.next();
      if (done) {
        process.stdout.write("\n");
        throw new EndOfInput();
      }
      return value;
    },
    close: () => rl.close(),
  };
}

export interface RunCommandOptions {
  dir: string;
  environment: string;
  environmentUrl?: string;
  executor?: string;
  /** Base URL of the API test environment — unlocks the auto-api phase. */
  apiBaseUrl?: string;
  /** Bearer token for the API environment. Never persisted to artifacts. */
  apiToken?: string;
  /** Approve state-mutating autonomous requests without prompting (CI). */
  autoApprove?: boolean;
  /** Injectable for tests and scripted runs; defaults to stdin. */
  ask?: Ask;
  /** Injectable for tests; defaults to fetch. */
  http?: HttpClient;
}

export async function runCommand(options: RunCommandOptions): Promise<void> {
  const dir = resolve(options.dir);
  const runPath = join(dir, "testrun.yml");

  const plan = fromYaml(readFileSync(join(dir, "testplan.yml"), "utf8"));
  // The plan names its own work item; the directory name is only a fallback.
  const ref: string = plan.workItem ?? dir.replace(/\/+$/, "").split("/").pop()!;
  const testcases = fromYaml(readFileSync(join(dir, "testcases.yml"), "utf8"));
  const cases: DesignedCase[] = testcases.cases;

  const modeByCaseId = new Map<string, ExecutionMode>(
    cases.map((c: DesignedCase & { execution?: { mode: ExecutionMode } }) => [
      c.id,
      (c as { execution?: { mode: ExecutionMode } }).execution?.mode ?? "guided-manual",
    ]),
  );
  const runnable = selectGuidedCases(cases, modeByCaseId);
  const autonomous = selectAutonomousCases(cases, modeByCaseId);

  // Resume: keep results already recorded, run only what is missing.
  const previous: TestRun | undefined = existsSync(runPath)
    ? TestRumSafeParse(readFileSync(runPath, "utf8"))
    : undefined;
  const doneIds = new Set(
    (previous?.results ?? []).filter((r) => r.status !== "not-run").map((r) => r.caseId),
  );

  const stdinAsker = options.ask ? undefined : createAsker(process.stdin);
  const ask: Ask = options.ask ?? stdinAsker!.ask;
  const results: CaseResult[] = [...(previous?.results ?? []).filter((r) => doneIds.has(r.caseId))];
  const defects: ObservedDefect[] = [...(previous?.defects ?? [])];

  console.log(`\n■ ${ref} — ejecución guiada`);
  console.log(`  Ambiente: ${options.environment}${options.environmentUrl ? ` (${options.environmentUrl})` : ""}`);
  console.log(
    `  ${runnable.length} caso(s) para humano de ${cases.length} totales` +
      (doneIds.size > 0 ? ` · ${doneIds.size} ya ejecutado(s), se retoman los restantes` : ""),
  );
  // --- Phase 1: autonomous API cases --------------------------------------
  if (autonomous.length > 0) {
    if (!options.apiBaseUrl) {
      console.log(
        `  ⚠ ${autonomous.length} caso(s) auto-api sin ambiente configurado — use --api-base-url`,
      );
      for (const c of autonomous) {
        results.push({
          caseId: c.designed.id,
          status: "not-run",
          executionMode: c.mode,
          reason: "sin ambiente de API configurado (--api-base-url)",
          steps: [],
          evidence: [],
        });
      }
    } else {
      console.log(`\n▸ Fase autónoma: ${autonomous.length} caso(s) auto-api contra ${options.apiBaseUrl}`);
      const http = options.http ?? createFetchClient();
      for (const c of autonomous) {
        if (doneIds.has(c.designed.id)) continue;
        const result = await runAutonomousCase(c, options, http, ask, dir);
        results.push(result);
        console.log(`  ${result.status === "pass" ? "✓" : result.status === "fail" ? "✗" : "◻"} ${c.designed.id} ${c.designed.title}`);
        persist();
      }
    }
  }

  // --- Phase 2: guided human cases ----------------------------------------
  console.log(`  Atajos: [p] pasó · [f] falló · [b] bloqueado · [s] omitir · [q] guardar y salir\n`);

  let quit = false;
  for (const [index, runnableCase] of runnable.entries()) {
    if (doneIds.has(runnableCase.designed.id)) continue;
    if (quit) break;

    try {
      const outcome = await runCase(ask, runnableCase, index, runnable.length, dir, defects);
      if (outcome === "quit") {
        quit = true;
        break;
      }
      results.push(outcome);
    } catch (error) {
      if (!(error instanceof EndOfInput)) throw error;
      quit = true;
      break;
    }
    persist(); // after every case — an interrupted session loses nothing
  }

  stdinAsker?.close();

  // Cases never reached are recorded honestly, never inferred.
  for (const c of runnable) {
    if (results.some((r) => r.caseId === c.designed.id)) continue;
    results.push({
      caseId: c.designed.id,
      status: "not-run",
      executionMode: c.mode,
      reason: quit ? "sesión interrumpida por el operador" : "no alcanzado en esta corrida",
      steps: [],
      evidence: [],
    });
  }
  persist();

  const run = buildRun();
  console.log(`\n✓ veredicto: ${run.verdict.toUpperCase()}`);
  console.log(
    `  ${run.summary.pass} pasaron · ${run.summary.fail} fallaron · ${run.summary.blocked} bloqueados · ${run.summary.notRun} sin ejecutar`,
  );
  const unmet = run.exitCriteria.filter((c) => c.status === "not-met");
  if (unmet.length > 0) console.log(`  ⚠ ${unmet.length} criterio(s) de salida NO cumplidos`);
  const pending = run.exitCriteria.filter((c) => c.needsHumanConfirmation);
  if (pending.length > 0) console.log(`  ℹ ${pending.length} criterio(s) requieren confirmación humana`);
  console.log(`  artefactos: ${runPath}, ${join(dir, "closure.md")}`);

  function buildRun(): TestRun {
    const summary = summarize(results);
    const priorityRiskIds: string[] = (plan.strategy.priorityRisks ?? [])
      .map((r: { id: string }) => r.id)
      .concat(
        (plan.riskRegister?.factors ?? [])
          .filter((f: { likelihood: number; impact: number }) => f.likelihood * f.impact >= 10)
          .map((f: { id: string }) => f.id),
      );
    const mandatoryTechniques = [
      ...new Set(
        (plan.strategy.techniquesByLevel ?? []).flatMap((lt: { techniques: { technique: string; mandatory: boolean }[] }) =>
          lt.techniques.filter((t) => t.mandatory).map((t) => t.technique),
        ),
      ),
    ] as string[];

    const exitCriteria = evaluateExitCriteria(plan.exitCriteria ?? [], {
      cases,
      results,
      defects,
      priorityRiskIds: [...new Set(priorityRiskIds)],
      mandatoryTechniques,
    });

    return TestRunSchema.parse({
      runId: `run-${ref}-${startedAt.replace(/[:.]/g, "").slice(0, 15)}`,
      workItem: ref,
      startedAt,
      finishedAt: new Date().toISOString(),
      environment: {
        name: options.environment,
        ...(options.environmentUrl ? { url: options.environmentUrl } : {}),
      },
      executor: { kind: autonomous.length > 0 && runnable.length > 0 ? "mixed" : autonomous.length > 0 ? "system" : "human", ...(options.executor ? { name: options.executor } : {}) },
      results,
      defects,
      summary,
      exitCriteria,
      verdict: verdictFor(summary, exitCriteria),
    });
  }

  function persist(): void {
    const run = buildRun();
    writeFileSync(runPath, toYaml(run), "utf8");
    writeFileSync(join(dir, "closure.md"), closureReport(run, cases), "utf8");
  }
}

const startedAt = new Date().toISOString();

function TestRumSafeParse(raw: string): TestRun | undefined {
  const parsed = TestRunSchema.safeParse(fromYaml(raw));
  return parsed.success ? parsed.data : undefined;
}

// ---------------------------------------------------------------------------
// Autonomous execution of one auto-api case
// ---------------------------------------------------------------------------

async function runAutonomousCase(
  runnable: RunnableCase,
  options: RunCommandOptions,
  http: HttpClient,
  ask: Ask,
  dir: string,
): Promise<CaseResult> {
  const c = runnable.designed;
  const mutating = c.steps.some(
    (s) => s.api && ["POST", "PUT", "PATCH", "DELETE"].includes(s.api.method),
  );

  // State-mutating autonomous requests need explicit human approval.
  let approved = options.autoApprove ?? false;
  if (mutating && !approved) {
    const methods = [...new Set(c.steps.filter((s) => s.api).map((s) => s.api!.method))];
    console.log(`\n  ⚠ ${c.id} altera estado (${methods.join(", ")}) contra ${options.apiBaseUrl}`);
    const answer = (await ask("  ¿Ejecutar? [s/N] ")).trim().toLowerCase();
    approved = answer === "s" || answer === "si" || answer === "y";
    if (!approved) {
      return {
        caseId: c.id,
        status: "skipped",
        executionMode: runnable.mode,
        reason: "el operador no aprobó la ejecución de peticiones que alteran estado",
        steps: [],
        evidence: [],
      };
    }
  }

  const ctx: ApiRunContext = {
    baseUrl: options.apiBaseUrl!,
    ...(options.apiToken ? { headers: { authorization: `Bearer ${options.apiToken}` } } : {}),
    mutationApproved: approved,
  };

  const startedAtIso = new Date().toISOString();
  try {
    const outcome = await runApiCase(c, ctx, http);
    const evidence: EvidenceRef[] = [];
    if (outcome.transcript) {
      evidence.push(writeTranscript(dir, c.id, outcome.transcript));
    }
    const failed = outcome.steps.some((s) => s.status === "fail");
    const executedAny = outcome.steps.some((s) => s.status !== "skipped");
    return CaseResultSchema.parse({
      caseId: c.id,
      status: failed ? "fail" : executedAny ? "pass" : "skipped",
      executionMode: runnable.mode,
      reason: !executedAny ? "ningún paso tenía especificación ejecutable" : undefined,
      startedAt: startedAtIso,
      finishedAt: new Date().toISOString(),
      durationMs: outcome.durationMs,
      steps: outcome.steps,
      evidence,
    });
  } catch (error) {
    if (!(error instanceof MutationNotApprovedError)) throw error;
    return {
      caseId: c.id,
      status: "skipped",
      executionMode: runnable.mode,
      reason: error.message,
      steps: [],
      evidence: [],
    };
  }
}

/** Transcripts are written as evidence files and digested like any other. */
function writeTranscript(dir: string, caseId: string, transcript: string): EvidenceRef {
  const evidenceDir = join(dir, "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const relative = join("evidence", `${caseId}.http.md`);
  writeFileSync(join(dir, relative), transcript, "utf8");
  return {
    kind: "log",
    description: `transcripción HTTP de ${caseId}`,
    path: relative,
    sha256: createHash("sha256").update(transcript).digest("hex"),
  };
}

// ---------------------------------------------------------------------------
// Interactive loop for one case
// ---------------------------------------------------------------------------

async function runCase(
  ask: Ask,
  runnable: RunnableCase,
  index: number,
  total: number,
  dir: string,
  defects: ObservedDefect[],
): Promise<CaseResult | "quit"> {
  const c = runnable.designed;
  const started = Date.now();

  console.log(`\n${"─".repeat(70)}`);
  console.log(`▸ ${c.id} [${index + 1}/${total}] ${c.title}`);
  console.log(
    `  ${c.priority} · ${c.level} · ${c.technique} · ${MODE_ES[runnable.mode] ?? runnable.mode}`,
  );
  if (c.preconditions.length > 0) {
    console.log(`  Precondiciones:`);
    for (const p of c.preconditions) console.log(`    - ${p}`);
  }
  if (c.dataRequirements.length > 0) {
    console.log(`  Datos:`);
    for (const d of c.dataRequirements) console.log(`    - ${d}`);
  }

  const steps: StepResult[] = [];
  const evidence: EvidenceRef[] = [];

  for (const [i, step] of c.steps.entries()) {
    console.log(`\n  Paso ${i + 1}/${c.steps.length}`);
    console.log(`  Acción:    ${step.action}`);
    console.log(`  Esperado:  ${step.expected}`);

    const answer = (await ask("  > ")).trim().toLowerCase();

    if (answer === "q") return "quit";

    if (answer === "p" || answer === "") {
      steps.push({ index: i, status: "pass" });
      continue;
    }

    if (answer === "f" || answer === "b") {
      const actual = (await ask("  ¿Qué ocurrió realmente? ")).trim();
      const status = answer === "f" ? "fail" : "blocked";
      steps.push({ index: i, status, ...(actual ? { actual } : {}) });

      const evidencePath = (await ask("  Evidencia (ruta de archivo, enter para omitir): ")).trim();
      if (evidencePath) evidence.push(makeEvidence(evidencePath, dir, `paso ${i + 1}`));

      if (status === "fail") {
        const severityRaw = (await ask("  Severidad del defecto (1-5, enter = 3): ")).trim();
        const severity = clampSeverity(Number.parseInt(severityRaw, 10));
        defects.push({
          id: `DEF-${defects.length + 1}`,
          summary: actual || `${c.title} — paso ${i + 1} falló`,
          severity,
          caseId: c.id,
          stepIndex: i,
        });
      }

      // A failed or blocked step ends the case: later steps assume this one worked.
      const remaining = c.steps.length - i - 1;
      if (remaining > 0) console.log(`  (${remaining} paso(s) restante(s) no ejecutados)`);
      return CaseResultSchema.parse({
        caseId: c.id,
        status,
        executionMode: runnable.mode,
        reason: status === "blocked" ? actual || "bloqueado durante la ejecución" : undefined,
        startedAt: new Date(started).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
        steps,
        evidence,
      });
    }

    if (answer === "s") {
      const why = (await ask("  Motivo para omitir: ")).trim();
      steps.push({ index: i, status: "skipped", ...(why ? { notes: why } : {}) });
      continue;
    }

    console.log("  Opción no reconocida — use p / f / b / s / q");
    // Re-ask the same step.
    c.steps.splice(i, 0, step);
  }

  // All steps done: capture closing evidence for the case.
  const evidencePath = (await ask("  Evidencia del caso (ruta, enter para omitir): ")).trim();
  if (evidencePath) evidence.push(makeEvidence(evidencePath, dir, "resultado del caso"));

  const allSkipped = steps.every((s) => s.status === "skipped");
  return CaseResultSchema.parse({
    caseId: c.id,
    status: allSkipped ? "skipped" : "pass",
    executionMode: runnable.mode,
    reason: allSkipped ? "todos los pasos fueron omitidos" : undefined,
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    steps,
    evidence,
  });
}

function clampSeverity(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, n));
}

/** Evidence is referenced, never copied — with a digest when the file exists. */
function makeEvidence(path: string, dir: string, description: string): EvidenceRef {
  const absolute = resolve(dir, path);
  const kind = /\.(png|jpe?g|gif|webp)$/i.test(path) ? "screenshot" : "file";
  if (!existsSync(absolute)) {
    return { kind: "note", description: `${description} (archivo no encontrado: ${path})` };
  }
  const sha256 = createHash("sha256").update(readFileSync(absolute)).digest("hex");
  return { kind, description, path, sha256 };
}

// ---------------------------------------------------------------------------
// Closure report (ISTQB test completion)
// ---------------------------------------------------------------------------

function closureReport(run: TestRun, cases: readonly DesignedCase[]): string {
  const titleOf = (id: string) => cases.find((c) => c.id === id)?.title ?? id;
  const icon: Record<string, string> = {
    pass: "✅", fail: "❌", blocked: "⛔", skipped: "⏭️", "not-run": "◻️",
  };

  return [
    `# Informe de cierre — ${run.workItem}`,
    "",
    `**Veredicto: ${run.verdict.toUpperCase()}** · ambiente ${run.environment.name} · ${run.startedAt}`,
    "",
    `| Total | Pasaron | Fallaron | Bloqueados | Omitidos | Sin ejecutar | Tasa de éxito |`,
    `|---|---|---|---|---|---|---|`,
    `| ${run.summary.total} | ${run.summary.pass} | ${run.summary.fail} | ${run.summary.blocked} | ${run.summary.skipped} | ${run.summary.notRun} | ${run.summary.passRate === null ? "—" : `${Math.round(run.summary.passRate * 100)}%`} |`,
    "",
    "## Criterios de salida",
    "",
    ...run.exitCriteria.map(
      (c) =>
        `- ${c.status === "met" ? "✅" : c.status === "not-met" ? "❌" : "❓"} **${c.criterion}**\n  - ${c.detail}`,
    ),
    "",
    "## Resultados por caso",
    "",
    ...run.results.map((r) => {
      const failed = r.steps.filter((s) => s.status !== "pass" && s.status !== "skipped");
      return [
        `- ${icon[r.status]} **${r.caseId}** ${titleOf(r.caseId)}${r.reason ? ` — _${r.reason}_` : ""}`,
        ...failed.map((s) => `  - paso ${s.index + 1}: ${s.status}${s.actual ? ` — ${s.actual}` : ""}`),
        ...r.evidence.map((e) => `  - evidencia: ${e.description}${e.path ? ` (\`${e.path}\`)` : ""}`),
      ].join("\n");
    }),
    "",
    ...(run.defects.length > 0
      ? [
          "## Defectos observados",
          "",
          ...run.defects.map(
            (d) => `- **${d.id}** (sev ${d.severity}) ${d.summary} — ${d.caseId}${d.stepIndex !== undefined ? ` paso ${d.stepIndex + 1}` : ""}`,
          ),
          "",
        ]
      : []),
  ].join("\n");
}
