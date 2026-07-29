/**
 * `kriteria plan` — run the full Fase-0 pipeline for one work item and write
 * the artifacts to disk. Artifacts are the deliverable; the console output is
 * just narration.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createAnthropicCaller,
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

  // 2. Run the pipeline.
  const result = await runPlanPipeline(basis, {
    call: createAnthropicCaller(),
    maxRevisions: options.maxRevisions,
    log: (msg) => console.log(`  ${msg}`),
  });

  // 3. Write artifacts.
  const dir = join(options.outDir, basis.source.ref);
  mkdirSync(dir, { recursive: true });
  writeArtifacts(dir, basis.source.ref, result);

  console.log(`\n✓ verdict: ${result.critique.verdict} (${result.revisions} revision(s))`);
  console.log(
    `  usage: ${result.totalUsage.inputTokens} in / ${result.totalUsage.outputTokens} out tokens across ${result.runs.length} call(s)`,
  );
  console.log(`  artifacts: ${dir}/`);
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

  write("testcases.yml", toYaml(result.design));

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
