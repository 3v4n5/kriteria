/**
 * The registry: load, verify completeness, select under budget, render.
 *
 * Selection is DETERMINISTIC and driven by the strategy the istqb engine
 * already produced. The model never picks its own playbooks — that would put
 * a judgement call back in the model's hands that code can make correctly
 * (harness principle 1). What the model gets is procedure for the techniques
 * that were already chosen for it.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TEST_TECHNIQUES, type TestLevel, type TestTechnique } from "@kriteria/istqb";
import { parsePlaybook } from "./parse.js";
import type {
  Playbook,
  PlaybookIndexEntry,
  PlaybookSelection,
  PlaybookVersionStamp,
} from "./types.js";

/**
 * Injection budget in characters (~4 chars/token, so ~3k tokens).
 *
 * Procedural context is not free: it rides on every designer call, including
 * revisions. The cap is deliberately tight — a playbook that cannot say
 * something useful in its share of this budget is too long to be useful.
 */
export const DEFAULT_PLAYBOOK_BUDGET_CHARS = 12_000;

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "content");

export class MissingPlaybookError extends Error {
  constructor(missing: readonly TestTechnique[]) {
    super(
      `sin playbook para: ${missing.join(", ")} — el motor puede elegir esas técnicas y el diseñador quedaría sin procedimiento`,
    );
    this.name = "MissingPlaybookError";
  }
}

export class DuplicatePlaybookError extends Error {
  constructor(technique: TestTechnique) {
    super(`dos playbooks declaran la técnica "${technique}" — la selección sería ambigua`);
    this.name = "DuplicatePlaybookError";
  }
}

export class PlaybookRegistry {
  private readonly byTechnique = new Map<TestTechnique, Playbook>();

  constructor(playbooks: readonly Playbook[]) {
    for (const playbook of playbooks) {
      if (this.byTechnique.has(playbook.technique)) {
        throw new DuplicatePlaybookError(playbook.technique);
      }
      this.byTechnique.set(playbook.technique, playbook);
    }
  }

  get size(): number {
    return this.byTechnique.size;
  }

  get(technique: TestTechnique): Playbook | undefined {
    return this.byTechnique.get(technique);
  }

  all(): Playbook[] {
    return [...this.byTechnique.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Every technique the engine can select must have a procedure. Called by a
   * test, so the two vocabularies can never drift apart unnoticed.
   */
  assertCoversEngineVocabulary(): void {
    const missing = TEST_TECHNIQUES.filter((t) => !this.byTechnique.has(t));
    if (missing.length > 0) throw new MissingPlaybookError(missing);
  }

  /**
   * Picks playbooks for the techniques the strategy selected.
   *
   * Order is mandatory-first, then first-appearance across levels. A technique
   * used at three levels is loaded once — the procedure does not change with
   * the level, only its subject does.
   */
  select(
    techniquesByLevel: readonly {
      level: TestLevel;
      techniques: readonly { technique: TestTechnique; mandatory: boolean }[];
    }[],
    budgetChars: number = DEFAULT_PLAYBOOK_BUDGET_CHARS,
  ): PlaybookSelection {
    const ordered: TestTechnique[] = [];
    const seen = new Set<TestTechnique>();
    for (const pass of [true, false]) {
      for (const level of techniquesByLevel) {
        for (const entry of level.techniques) {
          if (entry.mandatory !== pass || seen.has(entry.technique)) continue;
          seen.add(entry.technique);
          ordered.push(entry.technique);
        }
      }
    }

    const loaded: Playbook[] = [];
    const omittedForBudget: TestTechnique[] = [];
    let charsUsed = 0;

    for (const technique of ordered) {
      const playbook = this.byTechnique.get(technique);
      if (!playbook) continue;
      if (charsUsed + playbook.body.length > budgetChars) {
        omittedForBudget.push(technique);
        continue;
      }
      loaded.push(playbook);
      charsUsed += playbook.body.length;
    }

    const loadedIds = new Set(loaded.map((p) => p.id));
    const index: PlaybookIndexEntry[] = ordered
      .map((technique) => this.byTechnique.get(technique))
      .filter((p): p is Playbook => p !== undefined)
      .map((p) => ({
        id: p.id,
        technique: p.technique,
        version: p.version,
        summary: p.summary,
        loaded: loadedIds.has(p.id),
      }));

    return { loaded, index, charsUsed, omittedForBudget };
  }
}

/** Reads the shipped procedure library. Throws on any malformed file. */
export function loadRegistry(dir: string = CONTENT_DIR): PlaybookRegistry {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
  return new PlaybookRegistry(
    files.map((file) => parsePlaybook(file, readFileSync(join(dir, file), "utf8"))),
  );
}

/**
 * Renders the brief block. Returns an empty string when nothing was selected,
 * so the caller can concatenate unconditionally without leaving a dangling
 * heading in the prompt.
 */
export function renderPlaybooks(selection: PlaybookSelection): string {
  if (selection.index.length === 0) return "";

  const lines: string[] = [
    "## Procedure (playbooks)",
    "",
    "How to apply the techniques the strategy already selected. These are",
    "method, not permission: they never widen or narrow the strategy, and the",
    "work item always wins on facts about itself.",
    "",
    "Index:",
    ...selection.index.map(
      (e) =>
        `- ${e.id} v${e.version} (${e.technique}) — ${e.summary}${e.loaded ? "" : " [no incluido en este brief]"}`,
    ),
  ];

  for (const playbook of selection.loaded) {
    lines.push("", `### ${playbook.title} (${playbook.id} v${playbook.version})`, "", playbook.body);
  }

  if (selection.omittedForBudget.length > 0) {
    lines.push(
      "",
      `Nota: el procedimiento de ${selection.omittedForBudget.join(", ")} no cupo en el presupuesto de contexto. Aplica la técnica con tu criterio y decláralo.`,
    );
  }

  return lines.join("\n");
}

/** The stamp a run persists so the plan can be reproduced exactly. */
export function versionStamps(selection: PlaybookSelection): PlaybookVersionStamp[] {
  return selection.loaded.map((p) => ({ id: p.id, version: p.version, sha256: p.sha256 }));
}
