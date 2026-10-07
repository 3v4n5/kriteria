/**
 * Corpus builder for the golden set.
 *
 * Fetches public issues and lays down the three files each golden entry needs:
 *
 *   evals/fixtures/<KEY>.raw.json  raw issue JSON — replayable, zero network
 *   evals/golden/<KEY>.yml         the template, with ONLY workItem/rationale
 *   evals/briefs/<KEY>.md          the readable ticket, for the human reviewer
 *
 * Two deliberate non-features:
 *
 *  - **It never fills a single `expect` field**, not even as an example. A
 *    pre-filled expectation is the one thing that would make the golden set
 *    worthless, because the reviewer would anchor on it instead of judging.
 *  - **The brief carries no analysis.** It is the ticket, reorganised for
 *    reading. Any hint about what to test would leak into the expectation it
 *    exists to inform.
 *
 * Instances are a built-in registry keyed by project prefix, so a mixed list
 * of keys is grouped automatically instead of needing JIRA_BASE_URL set per
 * group by hand.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  adfToText,
  extractAcceptanceCriteria,
  isAdf,
  normalizeJiraIssue,
  type RawJiraIssue,
} from "@kriteria/ingest";
import { fetchJiraIssue, type JiraApiVersion, type JiraEnv } from "./jira-fetch.js";

interface Instance {
  name: string;
  baseUrl: string;
  apiVersion: JiraApiVersion;
  /** Public browse URL prefix for the brief's source line. */
  browse: string;
  projects: readonly string[];
}

/**
 * Public trackers verified to serve issues anonymously. All three are
 * self-hosted Jira, which has no REST v3.
 */
export const INSTANCES: readonly Instance[] = [
  {
    name: "apache",
    baseUrl: "https://issues.apache.org/jira",
    apiVersion: "2",
    browse: "https://issues.apache.org/jira/browse/",
    projects: ["OFBIZ", "FINERACT", "SYNCOPE"],
  },
  {
    name: "jenkins",
    baseUrl: "https://issues.jenkins.io",
    apiVersion: "2",
    browse: "https://issues.jenkins.io/browse/",
    projects: ["JENKINS"],
  },
  {
    name: "mongodb",
    baseUrl: "https://jira.mongodb.org",
    apiVersion: "2",
    browse: "https://jira.mongodb.org/browse/",
    projects: ["COMPASS", "NODE", "SERVER"],
  },
];

export function instanceFor(key: string, override?: string): Instance {
  if (override) {
    const named = INSTANCES.find((i) => i.name === override);
    if (!named) {
      throw new Error(
        `unknown instance "${override}" — known: ${INSTANCES.map((i) => i.name).join(", ")}`,
      );
    }
    return named;
  }
  const prefix = key.split("-")[0]?.toUpperCase() ?? "";
  const found = INSTANCES.find((i) => i.projects.includes(prefix));
  if (!found) {
    throw new Error(
      `cannot infer the instance for "${key}" — pass --instance (${INSTANCES.map((i) => i.name).join(", ")})`,
    );
  }
  return found;
}

function envFor(instance: Instance): JiraEnv {
  return { baseUrl: instance.baseUrl, apiVersion: instance.apiVersion };
}

/** Jira v2 serves plain wiki text; v3 and MCP tools serve ADF. */
export function descriptionText(description: unknown): string {
  if (typeof description === "string") return description;
  if (isAdf(description)) return adfToText(description);
  return "";
}

export interface GoldenAddResult {
  key: string;
  instance: string;
  url: string;
  fetched: boolean;
  acceptanceCriteria: number;
  comments: number;
  redactions: number;
  error?: string;
}

/** Only workItem and rationale are filled; the expect block is left blank. */
export function goldenStub(
  template: string,
  key: string,
  rationale: string,
): string {
  return template
    .replace(/^workItem: .*$/m, `workItem: ${key}`)
    .replace(/^rationale: .*$/m, `rationale: >-\n  ${rationale}`);
}

export function renderBrief(
  key: string,
  instance: Instance,
  raw: RawJiraIssue,
): { markdown: string; acceptanceCriteria: number; comments: number } {
  const fields = raw.fields ?? {};
  const description = descriptionText(fields.description);
  const criteria = extractAcceptanceCriteria(description);
  const comments = [
    ...(fields.comment?.comments ?? []),
    ...(raw.comments ?? []),
  ].map((c) => descriptionText(c.body));

  const lines: string[] = [
    `> Fuente: ${instance.name} · ${instance.browse}${key}`,
    "",
    `# ${key} — ${(fields.summary ?? "(sin título)").trim()}`,
    "",
    `**Tipo:** ${fields.issuetype?.name ?? "—"} · **Prioridad:** ${fields.priority?.name ?? "—"}` +
      (fields.components?.length
        ? ` · **Componentes:** ${fields.components.map((c) => c.name).join(", ")}`
        : ""),
    "",
    "## Descripción",
    "",
    description.trim() || "_(el ticket no tiene descripción)_",
  ];

  lines.push(
    "",
    "## Criterios de aceptación",
    "",
    criteria.length > 0
      ? criteria.map((c) => `- **${c.id}** ${c.text}`).join("\n")
      : "_(el ticket no declara criterios de aceptación)_",
  );

  if (fields.issuelinks?.length) {
    const links = fields.issuelinks
      .map((l) => {
        const other = l.inwardIssue ?? l.outwardIssue;
        return other?.key
          ? `- ${l.type?.name ?? "relates to"}: ${other.key} — ${other.fields?.summary ?? ""}`
          : null;
      })
      .filter((l): l is string => l !== null);
    if (links.length > 0) lines.push("", "## Enlaces", "", links.join("\n"));
  }

  lines.push("", "## Comentarios", "");
  lines.push(
    comments.length > 0
      ? comments
          .map((body, i) => `### Comentario ${i + 1}\n\n${body.trim()}`)
          .join("\n\n")
      : "_(sin comentarios)_",
  );

  return {
    markdown: `${lines.join("\n")}\n`,
    acceptanceCriteria: criteria.length,
    comments: comments.length,
  };
}

export interface GoldenAddOptions {
  keys: readonly string[];
  /** key → rationale. Missing keys get a placeholder the reviewer must edit. */
  rationales?: Record<string, string>;
  instance?: string;
  evalsDir?: string;
  /** Injected in tests. */
  fetchIssue?: (key: string, env: JiraEnv) => Promise<RawJiraIssue>;
  log?: (message: string) => void;
}

const PLACEHOLDER_RATIONALE =
  "PENDIENTE: que juicio pone a prueba este ticket (una linea)";

export async function goldenAddCommand(
  options: GoldenAddOptions,
): Promise<GoldenAddResult[]> {
  const evalsDir = options.evalsDir ?? "evals";
  const log = options.log ?? (() => {});
  const fetchIssue = options.fetchIssue ?? fetchJiraIssue;

  const fixturesDir = join(evalsDir, "fixtures");
  const goldenDir = join(evalsDir, "golden");
  const briefsDir = join(evalsDir, "briefs");
  for (const dir of [fixturesDir, goldenDir, briefsDir]) {
    mkdirSync(dir, { recursive: true });
  }

  const templatePath = join(goldenDir, "_plantilla.yml");
  if (!existsSync(templatePath)) {
    throw new Error(`golden template not found at ${templatePath}`);
  }
  const template = readFileSync(templatePath, "utf8");

  // Grouped by instance so the run reads as one pass per tracker, which is
  // also how the keys were chosen.
  const byInstance = new Map<Instance, string[]>();
  for (const key of options.keys) {
    const instance = instanceFor(key, options.instance);
    byInstance.set(instance, [...(byInstance.get(instance) ?? []), key]);
  }

  const results: GoldenAddResult[] = [];
  for (const [instance, keys] of byInstance) {
    log(`▸ ${instance.name} (${instance.baseUrl}) — ${keys.length} ticket(s)`);
    for (const key of keys) {
      const url = `${instance.browse}${key}`;
      try {
        const raw = await fetchIssue(key, envFor(instance));

        // Normalising here is a validation step, not an output: it proves the
        // fixture can actually drive the pipeline, and reports redaction
        // counts, before anyone spends a token on it.
        const { redactions } = normalizeJiraIssue(raw, { baseUrl: instance.baseUrl });

        writeFileSync(
          join(fixturesDir, `${key}.raw.json`),
          `${JSON.stringify(raw, null, 2)}\n`,
          "utf8",
        );

        const goldenPath = join(goldenDir, `${key}.yml`);
        if (existsSync(goldenPath)) {
          log(`  · ${key}: golden ya existe, no se sobrescribe`);
        } else {
          writeFileSync(
            goldenPath,
            goldenStub(
              template,
              key,
              options.rationales?.[key] ?? PLACEHOLDER_RATIONALE,
            ),
            "utf8",
          );
        }

        const brief = renderBrief(key, instance, raw);
        writeFileSync(join(briefsDir, `${key}.md`), brief.markdown, "utf8");

        results.push({
          key,
          instance: instance.name,
          url,
          fetched: true,
          acceptanceCriteria: brief.acceptanceCriteria,
          comments: brief.comments,
          redactions: redactions.total,
        });
        log(
          `  ✓ ${key}: AC=${brief.acceptanceCriteria} comentarios=${brief.comments} redacciones=${redactions.total}`,
        );
      } catch (error) {
        results.push({
          key,
          instance: instance.name,
          url,
          fetched: false,
          acceptanceCriteria: 0,
          comments: 0,
          redactions: 0,
          error: (error as Error).message,
        });
        log(`  ✗ ${key}: ${(error as Error).message}`);
      }
    }
  }
  return results;
}
