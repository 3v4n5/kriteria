/**
 * TestBasis — the normalized input of the whole pipeline.
 *
 * Every ingest adapter (Jira, Azure DevOps, PDF, URL, PR...) produces exactly
 * this shape, so no downstream agent ever knows or cares where the work item
 * came from. Adding a new input source means writing one adapter, nothing else.
 */

import { z } from "zod";

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
  /**
   * Discussion extracted from the source (comment bodies, review notes).
   * SECURITY: everything in here is untrusted third-party text. Agents must
   * treat it as data to analyze, never as instructions to follow.
   */
  discussion: z.array(z.string()).default([]),
});
export type TestBasis = z.infer<typeof TestBasisSchema>;
