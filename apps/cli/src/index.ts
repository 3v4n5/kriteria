/**
 * Kriteria CLI — Fase 0 entrypoint.
 *
 *   pnpm qa plan --from jira:SHOP-42
 *   pnpm qa plan --from file:fixtures/raw-issue.json --out out --revisions 1
 */

import { parseArgs } from "node:util";
import { planCommand } from "./plan.js";
import { reportCommand } from "./report.js";

const HELP = `kriteria — agentic QA strategy engine (Fase 0)

Usage:
  qa plan --from <jira:KEY | file:path> [options]
  qa report <out/REF>       Genera informe HTML legible de una corrida

Options:
  --from <src>        Work item source: jira:PROJ-123 or file:raw-issue.json
  --out <dir>         Output directory (default: out)
  --revisions <n>     Max designer revision rounds on blocker findings (default: 1)
  --tenant <slug>     Tenant identifier (reserved for memory injection)
  -h, --help          Show this help

Environment:
  ANTHROPIC_API_KEY   or an \`ant auth login\` profile
  JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN   (only for jira: sources)`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === "-h" || command === "--help") {
    console.log(HELP);
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
    ...(values.tenant ? { tenant: values.tenant } : {}),
  });
}

main().catch((error: unknown) => {
  console.error(`✗ ${(error as Error).message}`);
  process.exitCode = 1;
});
