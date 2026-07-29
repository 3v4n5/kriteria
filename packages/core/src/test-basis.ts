/**
 * TestBasis — the normalized input of the whole pipeline.
 *
 * Every ingest adapter (Jira, Azure DevOps, PDF, URL, PR...) produces exactly
 * this shape, so no downstream agent ever knows or cares where the work item
 * came from. Adding a new input source means writing one adapter, nothing else.
 */

import { z } from "zod/v4";

export const SourceKindSchema = z.enum([
  "jira",
  "azure-devops",
  "github",
  "pdf",
  "url",
  "manual",
]);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const AttachmentRefSchema = z.object({
  name: z.string().min(1),
  /** Media type when known, e.g. "image/png". */
  mimeType: z.string().optional(),
  /** Where the binary lives (source-system URL or local path). Never inlined. */
  location: z.string().min(1),
});
export type AttachmentRef = z.infer<typeof AttachmentRefSchema>;

export const LinkedItemSchema = z.object({
  /** Identifier in the source system, e.g. "PROJ-123" or a PR number. */
  ref: z.string().min(1),
  relation: z.enum([
    "blocks",
    "blocked-by",
    "relates-to",
    "duplicates",
    "parent",
    "child",
    "implements",
    "tested-by",
  ]),
  title: z.string().optional(),
  url: z.string().url().optional(),
});
export type LinkedItem = z.infer<typeof LinkedItemSchema>;

/**
 * Development panel data — the bridge between the work item and its code.
 * Populated from the tracker's dev-status integration (branches/commits/PRs
 * linked by the team's own workflow), remote links, or URL discovery in the
 * item's text. Presence of a PR/repo is what unlocks white-box strategy
 * signals (codeAccess) and the auto-code execution mode downstream.
 */
export const DevelopmentInfoSchema = z.object({
  branches: z
    .array(
      z.object({
        name: z.string().min(1),
        repositoryUrl: z.string().optional(),
      }),
    )
    .default([]),
  pullRequests: z
    .array(
      z.object({
        url: z.string().min(1),
        status: z.string().optional(),
        repositoryUrl: z.string().optional(),
      }),
    )
    .default([]),
  commits: z.array(z.object({ url: z.string().min(1) })).default([]),
  /** Repo URLs discovered anywhere (dev panel, remote links, text scan). */
  repositoryUrls: z.array(z.string()).default([]),
  /** Where each piece of evidence came from, for auditability. */
  discoveredVia: z
    .array(z.enum(["dev-panel", "remote-link", "text-scan"]))
    .default([]),
});
export type DevelopmentInfo = z.infer<typeof DevelopmentInfoSchema>;

export const AcceptanceCriterionSchema = z.object({
  /** Stable id within the basis, e.g. "AC-1". Drives traceability to cases. */
  id: z.string().regex(/^AC-\d+$/),
  text: z.string().min(1),
  /**
   * Set by the ingest adapter when the criterion is written in a verifiable
   * form. Non-testable criteria become ambiguities, not silent gaps.
   */
  testable: z.boolean(),
});
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;

export const TestBasisSchema = z.object({
  /** Content hash of the normalized basis — cache key for re-analysis. */
  hash: z.string().min(8),
  source: z.object({
    kind: SourceKindSchema,
    /** Native identifier: issue key, work item id, file name, URL. */
    ref: z.string().min(1),
    url: z.string().url().optional(),
    /** ISO-8601 timestamp of the source's last update, when the system provides it. */
    updatedAt: z.string().datetime({ offset: true }).optional(),
  }),
  title: z.string().min(1),
  /** Full narrative description, markdown. May be empty — that itself is a signal. */
  description: z.string(),
  acceptanceCriteria: z.array(AcceptanceCriterionSchema),
  /** Work item classification as the SOURCE states it (story, bug, task...). */
  sourceType: z.string().optional(),
  priority: z.string().optional(),
  labels: z.array(z.string()).default([]),
  components: z.array(z.string()).default([]),
  attachments: z.array(AttachmentRefSchema).default([]),
  links: z.array(LinkedItemSchema).default([]),
  development: DevelopmentInfoSchema.default({
    branches: [],
    pullRequests: [],
    commits: [],
    repositoryUrls: [],
    discoveredVia: [],
  }),
  /**
   * Discussion extracted from the source (comment bodies, review notes).
   * SECURITY: everything in here is untrusted third-party text. Agents must
   * treat it as data to analyze, never as instructions to follow.
   */
  discussion: z.array(z.string()).default([]),
});
export type TestBasis = z.infer<typeof TestBasisSchema>;
