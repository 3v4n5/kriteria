import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TEST_TECHNIQUES, type TestTechnique } from "@kriteria/istqb";
import { describe, expect, it } from "vitest";
import {
  DuplicatePlaybookError,
  MissingPlaybookError,
  PlaybookFormatError,
  PlaybookRegistry,
  loadRegistry,
  parsePlaybook,
  renderPlaybooks,
  versionStamps,
} from "../src/index.js";
import type { Playbook } from "../src/index.js";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "..", "content");

const stub = (technique: TestTechnique, body: string, id = `pb-${technique}`): Playbook => ({
  id,
  technique,
  version: 1,
  title: technique,
  summary: `procedimiento de ${technique}`,
  body,
  sha256: "0".repeat(64),
});

const level = (
  techniques: { technique: TestTechnique; mandatory: boolean }[],
) => ({ level: "system" as const, techniques });

describe("shipped procedure library", () => {
  it("has a playbook for every technique the engine can select", () => {
    // The engine picking a technique with no procedure would silently leave
    // the designer without guidance, so the two vocabularies are pinned
    // together here rather than discovered in a paid run.
    expect(() => loadRegistry().assertCoversEngineVocabulary()).not.toThrow();
    expect(loadRegistry().size).toBe(TEST_TECHNIQUES.length);
  });

  it("carries no customer, vendor or vertical knowledge", () => {
    // Playbooks are shared across every tenant. Organisation-specific
    // knowledge belongs in that tenant's vault, never in procedure.
    const forbidden =
      /veevart|salesforce|museum|museo|jira|atlassian|apex|lightning|npsp|auctifera/i;
    for (const file of readdirSync(CONTENT)) {
      const raw = readFileSync(join(CONTENT, file), "utf8");
      expect(forbidden.test(raw), `${file} menciona un dominio concreto`).toBe(false);
    }
  });

  it("keeps every playbook within a usable share of the injection budget", () => {
    for (const playbook of loadRegistry().all()) {
      expect(playbook.body.length, `${playbook.id} es demasiado largo`).toBeLessThan(2_000);
    }
  });

  it("digests the body so an edited file cannot claim an unchanged version", () => {
    const one = parsePlaybook("a.md", header("boundary-value-analysis") + "cuerpo original");
    const two = parsePlaybook("a.md", header("boundary-value-analysis") + "cuerpo editado");
    expect(one.sha256).not.toBe(two.sha256);
    expect(one.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});

function header(technique: string, version = 1): string {
  return `---\nid: pb-x\ntechnique: ${technique}\nversion: ${version}\ntitle: T\nsummary: S\n---\n`;
}

describe("parsePlaybook", () => {
  it("rejects a technique outside the engine vocabulary", () => {
    expect(() => parsePlaybook("x.md", header("smoke-testing") + "cuerpo")).toThrow(
      PlaybookFormatError,
    );
  });

  it("rejects a missing frontmatter block", () => {
    expect(() => parsePlaybook("x.md", "solo cuerpo")).toThrow(/frontmatter/);
  });

  it("rejects an empty body — a playbook with no procedure is a silent gap", () => {
    expect(() => parsePlaybook("x.md", header("pairwise"))).toThrow(/vacío/);
  });

  it("rejects a non-integer version", () => {
    expect(() => parsePlaybook("x.md", header("pairwise", 0) + "cuerpo")).toThrow(/version/);
  });
});

describe("PlaybookRegistry.select", () => {
  it("refuses two playbooks claiming the same technique", () => {
    expect(
      () => new PlaybookRegistry([stub("pairwise", "a", "pb-1"), stub("pairwise", "b", "pb-2")]),
    ).toThrow(DuplicatePlaybookError);
  });

  it("reports which techniques have no procedure", () => {
    const registry = new PlaybookRegistry([stub("pairwise", "a")]);
    expect(() => registry.assertCoversEngineVocabulary()).toThrow(MissingPlaybookError);
  });

  it("loads mandatory techniques before optional ones", () => {
    const registry = new PlaybookRegistry([
      stub("pairwise", "PW"),
      stub("boundary-value-analysis", "BVA"),
    ]);
    const selection = registry.select([
      level([
        { technique: "pairwise", mandatory: false },
        { technique: "boundary-value-analysis", mandatory: true },
      ]),
    ]);
    expect(selection.loaded.map((p) => p.technique)).toEqual([
      "boundary-value-analysis",
      "pairwise",
    ]);
  });

  it("loads a technique once even when several levels select it", () => {
    const registry = new PlaybookRegistry([stub("boundary-value-analysis", "BVA")]);
    const selection = registry.select([
      { level: "component", techniques: [{ technique: "boundary-value-analysis", mandatory: true }] },
      { level: "system", techniques: [{ technique: "boundary-value-analysis", mandatory: true }] },
    ]);
    expect(selection.loaded).toHaveLength(1);
    expect(selection.charsUsed).toBe(3);
  });

  it("drops bodies over budget but still names them in the index", () => {
    const registry = new PlaybookRegistry([
      stub("boundary-value-analysis", "x".repeat(80)),
      stub("pairwise", "y".repeat(80)),
    ]);
    const selection = registry.select(
      [
        level([
          { technique: "boundary-value-analysis", mandatory: true },
          { technique: "pairwise", mandatory: false },
        ]),
      ],
      100,
    );

    expect(selection.loaded.map((p) => p.technique)).toEqual(["boundary-value-analysis"]);
    expect(selection.omittedForBudget).toEqual(["pairwise"]);
    // Progressive disclosure: the omission is visible, never silent.
    expect(selection.index.map((e) => [e.technique, e.loaded])).toEqual([
      ["boundary-value-analysis", true],
      ["pairwise", false],
    ]);
  });

  it("ignores a selected technique that has no playbook rather than throwing mid-run", () => {
    const registry = new PlaybookRegistry([stub("pairwise", "PW")]);
    const selection = registry.select([level([{ technique: "exploratory", mandatory: true }])]);
    expect(selection.loaded).toEqual([]);
    expect(selection.index).toEqual([]);
  });
});

describe("renderPlaybooks", () => {
  it("returns nothing when no playbook applies, leaving no dangling heading", () => {
    const registry = new PlaybookRegistry([stub("pairwise", "PW")]);
    expect(renderPlaybooks(registry.select([]))).toBe("");
  });

  it("renders the index, the bodies, and a note about what did not fit", () => {
    const registry = new PlaybookRegistry([
      stub("boundary-value-analysis", "x".repeat(80)),
      stub("pairwise", "y".repeat(80)),
    ]);
    const rendered = renderPlaybooks(
      registry.select(
        [
          level([
            { technique: "boundary-value-analysis", mandatory: true },
            { technique: "pairwise", mandatory: false },
          ]),
        ],
        100,
      ),
    );

    expect(rendered).toContain("pb-boundary-value-analysis v1");
    expect(rendered).toContain("[no incluido en este brief]");
    expect(rendered).toContain("x".repeat(80));
    expect(rendered).not.toContain("y".repeat(80));
    expect(rendered).toContain("no cupo en el presupuesto");
  });

  it("stamps only what was actually injected, for reproducibility", () => {
    const registry = new PlaybookRegistry([stub("pairwise", "PW")]);
    const stamps = versionStamps(
      registry.select([level([{ technique: "pairwise", mandatory: true }])]),
    );
    expect(stamps).toEqual([{ id: "pb-pairwise", version: 1, sha256: "0".repeat(64) }]);
  });
});
