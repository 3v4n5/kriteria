/**
 * Procedural memory: how to apply a technique well, versioned as Markdown.
 *
 * The split that matters:
 *   `@kriteria/istqb`  decides WHICH techniques apply  (deterministic, typed)
 *   `@kriteria/playbooks` says HOW to apply each one   (prose, versioned)
 *
 * Neither knows anything about a customer. Organisation-specific knowledge is
 * tenant memory, injected at runtime as a separate, clearly-labelled block —
 * never edited into a playbook, which is shared across every tenant.
 *
 * This is the layer where self-improvement actually lands: the Reflector
 * proposes a delta to a playbook, the golden set scores the candidate, and a
 * human promotes the version. Prompts stay stable; procedure evolves.
 */

import type { TestTechnique } from "@kriteria/istqb";

/** Frontmatter of a playbook file, before validation. */
export interface PlaybookFrontmatter {
  id: string;
  technique: string;
  version: number;
  title: string;
  /** One line. This — and only this — is what the index costs. */
  summary: string;
}

export interface Playbook {
  id: string;
  /** The istqb technique this procedure implements. */
  technique: TestTechnique;
  /**
   * Monotonic version. A run records the version it used, so a plan can be
   * reproduced and a regression can be traced to a specific promotion.
   */
  version: number;
  title: string;
  summary: string;
  /** Markdown procedure, frontmatter stripped. */
  body: string;
  /**
   * SHA-256 of `body`. The version says what was intended; the hash proves
   * what actually ran, so an edited file cannot silently claim an old version.
   */
  sha256: string;
}

/** One line per playbook — the whole point of progressive disclosure. */
export interface PlaybookIndexEntry {
  id: string;
  technique: TestTechnique;
  version: number;
  summary: string;
  /** True when the full body was included in this brief. */
  loaded: boolean;
}

export interface PlaybookSelection {
  /** Full bodies, in the order they should appear in the brief. */
  loaded: Playbook[];
  /** Every known playbook, loaded or not. */
  index: PlaybookIndexEntry[];
  /** Characters of playbook body actually injected. */
  charsUsed: number;
  /**
   * Techniques whose playbook was dropped for budget. Never silent: the brief
   * still lists them in the index so the omission is visible to the agent and
   * to whoever reads the trace.
   */
  omittedForBudget: TestTechnique[];
}

/** What a run records for reproducibility (harness principle 7). */
export interface PlaybookVersionStamp {
  id: string;
  version: number;
  sha256: string;
}
