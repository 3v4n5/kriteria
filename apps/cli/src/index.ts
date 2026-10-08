/**
 * Kriteria CLI — Fase 0 entrypoint.
 *
 *   pnpm qa plan --from jira:SHOP-42
 *   pnpm qa plan --from file:fixtures/raw-issue.json --out out --revisions 1
 */

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createAnthropicCaller } from "@kriteria/agents";
import { baselineCommand } from "./baseline.js";
import { goldenAddCommand } from "./golden-add.js";
import { planCommand } from "./plan.js";
import { evalCommand } from "./eval.js";
import { reportCommand } from "./report.js";
import { runCommand } from "./run.js";

const HELP = `kriteria — agentic QA strategy engine (Fase 0)

Usage:
  qa plan --from <jira:KEY | file:path> [options]
  qa run <out/REF> --env <nombre> [--url <url>] [--as <nombre>]
                   [--api-base-url <url>] [--auto-approve]
                            Ejecuta casos auto-api y luego guía los manuales (reanudable)
  qa report <out/REF>       Genera informe HTML legible de una corrida
  qa eval [--only REF]      Puntúa los planes contra el golden set (sin costo de API)
  qa baseline <KEY...>      Juicio de un modelo independiente que solo ve el brief,
                            para medir si predice el tuyo. CUESTA API (Opus).
  qa golden-add <KEY...>    Trae tickets públicos al corpus: fixture + golden en
                            blanco + brief legible. Nunca llena \`expect\`.

Options:
  --from <src>        Work item source: jira:PROJ-123 or file:raw-issue.json
  --out <dir>         Output directory (default: out)
  --revisions <n>     Max designer revision rounds on blocker findings (default: 1)
  --tenant <slug>     Tenant identifier (reserved for memory injection)
  --playbooks         Inject procedural playbooks for the selected techniques.
                      Off by default: it changes the designer's input, so a
                      plan built with it is not comparable to one built without
  -h, --help          Show this help

Environment:
  ANTHROPIC_API_KEY   or an \`ant auth login\` profile
  JIRA_BASE_URL       required for jira: sources
  JIRA_EMAIL, JIRA_API_TOKEN   optional — omit both to read a public tracker
                      anonymously; half a pair is treated as neither
  JIRA_API_VERSION    "3" (Atlassian Cloud, default) or "2" (Server/DC —
                      required for issues.apache.org, issues.jenkins.io, …)
  KRITERIA_API_BASE_URL, KRITERIA_API_TOKEN   (ambiente de pruebas para auto-api)`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === "-h" || command === "--help") {
    console.log(HELP);
    return;
  }
  if (command === "run") {
    const dir = rest[0];
    if (!dir || dir.startsWith("--")) throw new Error("uso: qa run out/<REF> --env <nombre>");
    const { values } = parseArgs({
      args: rest.slice(1),
      options: {
        env: { type: "string", default: "local" },
        url: { type: "string" },
        as: { type: "string" },
        "api-base-url": { type: "string" },
        "auto-approve": { type: "boolean", default: false },
      },
    });
    // The API token comes from the environment only — never a flag, so it
    // cannot land in shell history or a CI log line.
    const apiToken = process.env["KRITERIA_API_TOKEN"];
    const apiBaseUrl = values["api-base-url"] ?? process.env["KRITERIA_API_BASE_URL"];
    await runCommand({
      dir,
      environment: values.env!,
      ...(values.url ? { environmentUrl: values.url } : {}),
      ...(values.as ? { executor: values.as } : {}),
      ...(apiBaseUrl ? { apiBaseUrl } : {}),
      ...(apiToken ? { apiToken } : {}),
      autoApprove: values["auto-approve"]!,
    });
    return;
  }
  if (command === "golden-add") {
    const { values, positionals: keys } = parseArgs({
      args: rest,
      options: {
        instance: { type: "string" },
        evals: { type: "string", default: "evals" },
        rationales: { type: "string" },
      },
      allowPositionals: true,
    });
    if (keys.length === 0) {
      throw new Error("uso: qa golden-add <KEY> [<KEY>...] [--instance <nombre>]");
    }
    // A JSON map of key → rationale. A file rather than flags because the
    // rationale is a sentence per ticket, and the batch is usually a dozen.
    const rationales = values.rationales
      ? (JSON.parse(readFileSync(values.rationales, "utf8")) as Record<string, string>)
      : undefined;
    const results = await goldenAddCommand({
      keys,
      ...(rationales ? { rationales } : {}),
      ...(values.instance ? { instance: values.instance } : {}),
      evalsDir: values.evals!,
      log: (msg) => console.log(msg),
    });
    const failed = results.filter((r) => !r.fetched);
    console.log(
      `\n✓ ${results.length - failed.length}/${results.length} tickets en el corpus`,
    );
    if (failed.length > 0) process.exitCode = 1;
    return;
  }
  if (command === "baseline") {
    const { values, positionals: keys } = parseArgs({
      args: rest,
      options: {
        evals: { type: "string", default: "evals" },
        force: { type: "boolean", default: false },
      },
      allowPositionals: true,
    });
    if (keys.length === 0) {
      throw new Error("uso: qa baseline <KEY> [<KEY>...] [--force]");
    }
    const results = await baselineCommand({
      keys,
      call: createAnthropicCaller(),
      evalsDir: values.evals!,
      force: values.force!,
      log: (msg) => console.log(msg),
    });
    const written = results.filter((r) => r.written);
    const cost = written.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
    console.log(
      `\n✓ ${written.length}/${results.length} baseline(s) generado(s) ≈ $${cost.toFixed(3)} USD`,
    );
    return;
  }
  if (command === "eval") {
    const { values } = parseArgs({
      args: rest,
      options: {
        golden: { type: "string", default: "evals/golden" },
        out: { type: "string", default: "out" },
        results: { type: "string", default: "evals/results" },
        baseline: { type: "string", default: "evals/baseline" },
        only: { type: "string" },
      },
    });
    evalCommand({
      goldenDir: values.golden!,
      outDir: values.out!,
      resultsDir: values.results!,
      baselineDir: values.baseline!,
      ...(values.only ? { only: values.only } : {}),
    });
    return;
  }
  if (command === "report") {
    const dir = rest[0];
    if (!dir) throw new Error("uso: qa report out/<REF>");
    console.log(`✓ ${reportCommand(dir)}`);
    return;
  }
  if (command !== "plan") {
    console.error(`unknown command "${command}"\n`);
    console.log(HELP);
    process.exitCode = 1;
    return;
  }

  const { values } = parseArgs({
    args: rest,
    options: {
      from: { type: "string" },
      out: { type: "string", default: "out" },
      revisions: { type: "string", default: "1" },
      tenant: { type: "string" },
      playbooks: { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || !values.from) {
    console.log(HELP);
    if (!values.from) process.exitCode = 1;
    return;
  }

  await planCommand({
    from: values.from,
    outDir: values.out!,
    maxRevisions: Number.parseInt(values.revisions!, 10) || 1,
    playbooks: values.playbooks!,
    ...(values.tenant ? { tenant: values.tenant } : {}),
  });
}

main().catch((error: unknown) => {
  console.error(`✗ ${(error as Error).message}`);
  process.exitCode = 1;
});
