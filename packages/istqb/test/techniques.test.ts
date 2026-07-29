import { describe, expect, it } from "vitest";
import {
  selectTechniques,
  type ConditionTraits,
  type TechniqueSelectionInput,
} from "../src/techniques.js";

const traits = (overrides: Partial<ConditionTraits> = {}): ConditionTraits => ({
  hasOrderedInputDomain: false,
  hasDiscretePartitions: false,
  hasStateMachine: false,
  hasBusinessRules: false,
  independentParameters: 1,
  hasUserWorkflow: false,
  codeAccess: false,
  safetyCritical: false,
  ...overrides,
});

const select = (input: Partial<TechniqueSelectionInput> = {}) =>
  selectTechniques({
    traits: traits(),
    depth: "standard",
    level: "system",
    approaches: ["analytical"],
    ...input,
  });

const names = (input: Partial<TechniqueSelectionInput> = {}) =>
  select(input).map((t) => t.technique);

describe("selectTechniques", () => {
  it("never returns the same technique twice", () => {
    const result = names({
      traits: traits({ hasStateMachine: true }),
      depth: "exhaustive",
    });
    expect(new Set(result).size).toBe(result.length);
  });

  describe("boundary value analysis", () => {
    it("is mandatory whenever inputs are ordered and depth is standard or higher", () => {
      const bva = select({
        traits: traits({ hasOrderedInputDomain: true }),
      }).find((t) => t.technique === "boundary-value-analysis");

      expect(bva?.mandatory).toBe(true);
    });

    it("is not proposed when the input domain has no order", () => {
      expect(names({ traits: traits({ hasDiscretePartitions: true }) })).not.toContain(
        "boundary-value-analysis",
      );
    });

    it("is advisory only at smoke depth", () => {
      const bva = select({
        traits: traits({ hasOrderedInputDomain: true }),
        depth: "smoke",
      }).find((t) => t.technique === "boundary-value-analysis");

      expect(bva?.mandatory).toBe(false);
    });
  });

  it("adds decision tables when the outcome depends on combined conditions", () => {
    expect(names({ traits: traits({ hasBusinessRules: true }) })).toContain(
      "decision-table",
    );
  });

  it("merges the invalid-transition rationale into a single state-transition entry", () => {
    const stateEntries = select({
      traits: traits({ hasStateMachine: true }),
      depth: "thorough",
    }).filter((t) => t.technique === "state-transition");

    expect(stateEntries).toHaveLength(1);
    expect(stateEntries[0]!.mandatory).toBe(true);
    expect(stateEntries[0]!.rationale).toContain("invalid transitions");
  });

  it("proposes pairwise once parameters combine, and requires it past three", () => {
    expect(names({ traits: traits({ independentParameters: 2 }) })).not.toContain(
      "pairwise",
    );

    const three = select({ traits: traits({ independentParameters: 3 }) }).find(
      (t) => t.technique === "pairwise",
    );
    expect(three?.mandatory).toBe(false);

    const four = select({ traits: traits({ independentParameters: 4 }) }).find(
      (t) => t.technique === "pairwise",
    );
    expect(four?.mandatory).toBe(true);
  });

  describe("white-box techniques", () => {
    it("only apply at component level with code access", () => {
      expect(
        names({ traits: traits({ codeAccess: true }), level: "system" }),
      ).not.toContain("statement-coverage");

      expect(
        names({ traits: traits({ codeAccess: true }), level: "component" }),
      ).toContain("statement-coverage");
    });

    it("require MC/DC only for safety-critical code at exhaustive depth", () => {
      const input = {
        traits: traits({ codeAccess: true, safetyCritical: true }),
        level: "component",
      } as const;

      expect(names({ ...input, depth: "thorough" })).not.toContain(
        "modified-condition-decision-coverage",
      );
      expect(names({ ...input, depth: "exhaustive" })).toContain(
        "modified-condition-decision-coverage",
      );
    });
  });

  describe("experience-based techniques", () => {
    it("makes exploratory mandatory under the reactive approach", () => {
      const exploratory = select({ approaches: ["reactive"] }).find(
        (t) => t.technique === "exploratory",
      );
      expect(exploratory?.mandatory).toBe(true);
    });

    it("adds checklist-based whenever a standard or process drives the work", () => {
      expect(names({ approaches: ["methodical"] })).toContain("checklist-based");
      expect(names({ approaches: ["process-compliant"] })).toContain(
        "checklist-based",
      );
      expect(names({ approaches: ["analytical"] })).not.toContain(
        "checklist-based",
      );
    });

    it("skips error guessing at smoke depth", () => {
      expect(names({ depth: "smoke" })).not.toContain("error-guessing");
    });
  });

  it("tags every recommendation with its family", () => {
    const result = select({
      traits: traits({ hasOrderedInputDomain: true, codeAccess: true }),
      level: "component",
    });
    expect(result.every((t) => t.family)).toBe(true);
  });
});
