/**
 * `kriteria plan` — run the full Fase-0 pipeline for one work item and write
 * the artifacts to disk. Artifacts are the deliverable; the console output is
 * just narration.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { StageCache } from "@kriteria/agents";
import {
  createAnthropicCaller,
  estimateCostUsd,
  runPlanPipeline,
  type PlanResult,
} from "@kriteria/agents";
import { normalizeJiraIssue, type RawJiraIssue } from "@kriteria/ingest";
import { stringify as toYaml } from "yaml";
import { fetchJiraIssue, jiraEnvFromProcess } from "./jira-fetch.js";

export interface PlanCommandOptions {
  /** "jira:KEY" or "file:path/to/raw-issue.json" */
  from: string;
  outDir: string;
  maxRevisions: number;
  tenant?: string;
}

export async function planCommand(options: PlanCommandOptions): Promise<void> {
  const [kind, ...rest] = options.from.split(":");
  const ref = rest.join(":");
  if (!ref) throw new Error(`--from must be "jira:KEY" or "file:path", got "${options.from}"`);

  // 1. Fetch raw + normalize/sanitize at the boundary.
  let raw: RawJiraIssue;
  if (kind === "jira") {
    raw = await fetchJiraIssue(ref, jiraEnvFromProcess());
  } else if (kind === "file") {
    raw = JSON.parse(readFileSync(ref, "utf8")) as RawJiraIssue;
  } else {
    throw new Error(`unsupported source "${kind}" — use jira: or file:`);
  }

  const baseUrl = process.env["JIRA_BASE_URL"];
  const { basis, redactions } = normalizeJiraIssue(
    raw,
    baseUrl ? { baseUrl } : {},
  );

  console.log(`■ ${basis.source.ref} — ${basis.title}`);
  console.log(
    `  sanitization: ${redactions.total} redaction(s)` +
      (redactions.total > 0 ? ` ${JSON.stringify(redactions.counts)}` : ""),
  );

  // 2. Run the pipeline, with a file-backed stage cache so a failed run never
  //    re-bills the stages that already succeeded.
  const dir = join(options.outDir, basis.source.ref);
  const result = await runPlanPipeline(basis, {
    call: createAnthropicCaller(),
    maxRevisions: options.maxRevisions,
    cache: fileStageCache(join(dir, ".cache")),
    log: (msg) => console.log(`  ${msg}`),
  });

  // 3. Write artifacts.
  mkdirSync(dir, { recursive: true });
  writeArtifacts(dir, basis.source.ref, result);

  console.log(`\n✓ verdict: ${result.critique.verdict} (${result.revisions} revision(s))`);
  const costUsd = result.runs.reduce(
    (sum, r) => sum + estimateCostUsd(r.model, r.usage),
    0,
  );
  console.log(
    `  usage: ${result.totalUsage.inputTokens} in / ${result.totalUsage.outputTokens} out tokens across ${result.runs.length} call(s) ≈ $${costUsd.toFixed(3)} USD`,
  );
  console.log(`  artifacts: ${dir}/`);
}

function fileStageCache(cacheDir: string): StageCache {
  return {
    get(key) {
      const path = join(cacheDir, `${key}.json`);
      if (!existsSync(path)) return undefined;
      try {
        return JSON.parse(readFileSync(path, "utf8"));
      } catch {
        return undefined;
      }
    },
    set(key, value) {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(join(cacheDir, `${key}.json`), JSON.stringify(value), "utf8");
    },
  };
}

function writeArtifacts(dir: string, ref: string, result: PlanResult): void {
  const write = (name: string, content: string) =>
    writeFileSync(join(dir, name), content, "utf8");

  write(
    "testplan.yml",
    toYaml({
      workItem: ref,
      strategy: {
        approach: result.strategy.approach.primary.approach,
        approachRationale: result.strategy.approach.primary.rationale,
        supporting: result.strategy.approach.supporting.map((s) => s.approach),
        depth: result.strategy.depth,
        overallRisk: result.strategy.risk.overallLevel,
        levels: result.strategy.levels,
        types: result.strategy.types,
        techniquesByLevel: result.strategy.techniquesByLevel,
        caseBudgetPerArea: result.strategy.caseBudgetPerArea,
      },
      entryCriteria: result.strategy.entryCriteria,
      exitCriteria: result.strategy.exitCriteria,
      riskRegister: result.riskRegister,
      analysis: {
        features: result.analysis.features,
        actors: result.analysis.actors,
        businessRules: result.analysis.businessRules,
        ambiguities: result.analysis.ambiguities,
        unmappedAcceptanceCriteria: result.analysis.unmappedAcceptanceCriteria,
      },
    }),
  );

  // Cases ship with their ROUTED execution mode attached — the deliverable
  // states who runs what, honestly degraded to the tenant's capabilities.
  const routingById = new Map(result.executionPlan.map((e) => [e.caseId, e]));
  write(
    "testcases.yml",
    toYaml({
      cases: result.design.cases.map((c) => {
        const routing = routingById.get(c.id);
        return {
          ...c,
          execution: routing
            ? {
                mode: routing.routed.mode,
                proposed: routing.proposed ?? null,
                degraded: routing.routed.degraded,
                requiresGate: routing.routed.requiresGate,
                reason: routing.routed.reason,
              }
            : null,
        };
      }),
      exclusions: result.design.exclusions,
    }),
  );

  write(
    "critic.md",
    [
      `# Critic report — ${ref}`,
      "",
      `Verdict: **${result.critique.verdict}** after ${result.revisions} revision(s)`,
      "",
      `Scope: ${result.critique.scopeStatement}`,
      "",
      ...result.critiqueHistory.flatMap((report, round) => [
        `## Round ${round + 1} — ${report.verdict}`,
        "",
        ...(report.findings.length === 0
          ? ["No findings."]
          : report.findings.map(
              (f) =>
                `- **[${f.severity}] ${f.id}** (${f.kind}) ${f.summary}\n  - refs: ${f.refs.join(", ") || "—"}\n  - fix: ${f.recommendation}`,
            )),
        "",
      ]),
    ].join("\n"),
  );

  write(
    "run.json",
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        revisions: result.revisions,
        verdict: result.critique.verdict,
        totalUsage: result.totalUsage,
        calls: result.runs,
      },
      null,
      2,
    ),
  );
}
