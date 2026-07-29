/**
 * Jira adapter — raw issue payload → validated, sanitized TestBasis.
 *
 * Transport-free by design: the caller (CLI, worker) fetches the issue via
 * MCP or REST and hands the raw JSON here. That keeps normalization fully
 * unit-testable and means swapping transports never touches this logic.
 *
 * Security invariants:
 *  1. Every free-text field is sanitized BEFORE anything else touches it.
 *  2. Reporter/assignee/comment-author names are dropped entirely — the
 *     pipeline analyzes work items, not people (GDPR data minimization).
 *  3. Attachments are carried as references, never fetched or inlined here.
 *  4. The output is parsed through TestBasisSchema — this module cannot emit
 *     an out-of-contract object.
 */

import { createHash } from "node:crypto";
import {
  TestBasisSchema,
  type LinkedItem,
  type TestBasis,
} from "@kriteria/core";
import { extractAcceptanceCriteria } from "./acceptance-criteria.js";
import { adfToText } from "./adf.js";
import {
  mergeReports,
  sanitizeText,
  type RedactionReport,
} from "./sanitize.js";

/**
 * Loose input shape covering both the Atlassian REST v3 payload and the
 * flattened shapes MCP servers return. Everything is optional; the adapter
 * is defensive because source payloads drift.
 */
export interface RawJiraIssue {
  key?: string;
  id?: string;
  self?: string;
  fields?: {
    summary?: string;
    description?: unknown;
    issuetype?: { name?: string };
    priority?: { name?: string };
    labels?: string[];
    components?: { name?: string }[];
    updated?: string;
    issuelinks?: {
      type?: { name?: string; inward?: string; outward?: string };
      inwardIssue?: { key?: string; fields?: { summary?: string } };
      outwardIssue?: { key?: string; fields?: { summary?: string } };
    }[];
    attachment?: { filename?: string; mimeType?: string; content?: string }[];
    parent?: { key?: string; fields?: { summary?: string } };
    subtasks?: { key?: string; fields?: { summary?: string } }[];
    comment?: { comments?: { body?: unknown }[] };
  };
  /** Some MCP tools return comments at the top level. */
  comments?: { body?: unknown }[];
}

export interface JiraIngestResult {
  basis: TestBasis;
  /** Counts only — safe to log and to show in the UI. Never raw values. */
  redactions: RedactionReport;
}

const RELATION_MAP: Record<string, LinkedItem["relation"]> = {
  blocks: "blocks",
  "is blocked by": "blocked-by",
  duplicates: "duplicates",
  "is duplicated by": "duplicates",
  "relates to": "relates-to",
  "tested by": "tested-by",
  implements: "implements",
};

function mapRelation(raw: string | undefined): LinkedItem["relation"] {
  return RELATION_MAP[raw?.toLowerCase() ?? ""] ?? "relates-to";
}

export function normalizeJiraIssue(
  raw: RawJiraIssue,
  opts: { baseUrl?: string } = {},
): JiraIngestResult {
  const fields = raw.fields ?? {};
  const key = raw.key ?? raw.id ?? "UNKNOWN";
  const reports: RedactionReport[] = [];

  const clean = (value: string): string => {
    const { text, report } = sanitizeText(value);
    reports.push(report);
    return text;
  };

  const title = clean(fields.summary ?? "(no summary)");
  const description = clean(adfToText(fields.description ?? ""));

  // Comments: bodies only. Author identities are deliberately not carried.
  const rawComments = fields.comment?.comments ?? raw.comments ?? [];
  const discussion = rawComments
    .map((c) => clean(adfToText(c.body ?? "")))
    .filter((text) => text.length > 0);

  const links: LinkedItem[] = [];
  for (const link of fields.issuelinks ?? []) {
    if (link.outwardIssue?.key) {
      const item: LinkedItem = {
        ref: link.outwardIssue.key,
        relation: mapRelation(link.type?.outward),
      };
      const summary = link.outwardIssue.fields?.summary;
      if (summary) item.title = clean(summary);
      links.push(item);
    }
    if (link.inwardIssue?.key) {
      const item: LinkedItem = {
        ref: link.inwardIssue.key,
        relation: mapRelation(link.type?.inward),
      };
      const summary = link.inwardIssue.fields?.summary;
      if (summary) item.title = clean(summary);
      links.push(item);
    }
  }
  if (fields.parent?.key) {
    const item: LinkedItem = { ref: fields.parent.key, relation: "parent" };
    const summary = fields.parent.fields?.summary;
    if (summary) item.title = clean(summary);
    links.push(item);
  }
  for (const sub of fields.subtasks ?? []) {
    if (sub.key) links.push({ ref: sub.key, relation: "child" });
  }

  const attachments = (fields.attachment ?? [])
    .filter((a) => a.filename && a.content)
    .map((a) => ({
      name: a.filename!,
      location: a.content!,
      ...(a.mimeType ? { mimeType: a.mimeType } : {}),
    }));

  const acceptanceCriteria = extractAcceptanceCriteria(description);

  const unhashed = {
    source: {
      kind: "jira" as const,
      ref: key,
      ...(opts.baseUrl ? { url: `${opts.baseUrl}/browse/${key}` } : {}),
      ...(fields.updated ? { updatedAt: fields.updated } : {}),
    },
    title,
    description,
    acceptanceCriteria,
    ...(fields.issuetype?.name ? { sourceType: fields.issuetype.name } : {}),
    ...(fields.priority?.name ? { priority: fields.priority.name } : {}),
    labels: (fields.labels ?? []).map(clean),
    components: (fields.components ?? [])
      .map((c) => c.name)
      .filter((n): n is string => Boolean(n)),
    attachments,
    links,
    discussion,
  };

  // Hash of sanitized content only: two ingests of an unchanged (post-
  // redaction) issue produce the same hash, and raw PII never feeds a digest.
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        t: unhashed.title,
        d: unhashed.description,
        ac: unhashed.acceptanceCriteria.map((a) => a.text),
        disc: unhashed.discussion,
      }),
    )
    .digest("hex")
    .slice(0, 16);

  return {
    basis: TestBasisSchema.parse({ ...unhashed, hash }),
    redactions: mergeReports(reports),
  };
}
