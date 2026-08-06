import type { CaseResult, DesignedCase, ObservedDefect } from "@kriteria/core";
import type { ExecutionMode } from "@kriteria/istqb";
import { describe, expect, it } from "vitest";
import {
  evaluateExitCriteria,
  selectGuidedCases,
  summarize,
  verdictFor,
} from "../src/index.js";

const designedCase = (
  id: string,
  overrides: Partial<DesignedCase> = {},
): DesignedCase => ({
  id,
  title: `caso ${id}`,
  level: "system",
  type: "functional",
  technique: "boundary-value-analysis",
  priority: "medium",
  covers: ["FEA-1"],
  mitigates: [],
  verifies: [],
  preconditions: [],
  dataRequirements: [],
  steps: [{ action: "hacer algo", expected: "algo pasa" }],
  needsHuman: false,
  ...overrides,
});

const result = (
  caseId: string,
  status: CaseResult["status"],
  overrides: Partial<CaseResult> = {},
): CaseResult => ({
  caseId,
  status,
  executionMode: "guided-manual",
  ...(status === "pass" || status === "fail" ? {} : { reason: "motivo" }),
  steps: [],
  evidence: [{ kind: "note", description: "evidencia" }],
  ...overrides,
});

describe("selectGuidedCases", () => {
  const modes = new Map<string, ExecutionMode>([
    ["TC-1", "auto-api"],
    ["TC-2", "guided-manual"],
    ["TC-3", "human-only"],
    ["TC-4", "auto-web"],
    ["TC-5", "dev-guide"],
  ]);

  it("selects only the modes a human executes", () => {
    const selected = selectGuidedCases(
      ["TC-1", "TC-2", "TC-3", "TC-4", "TC-5"].map((id) => designedCase(id)),
      modes,
    );
    expect(selected.map((c) => c.designed.id)).toEqual(["TC-2", "TC-3", "TC-5"]);
  });

  it("orders by priority so an interrupted session covers what matters first", () => {
    const selected = selectGuidedCases(
      [
        designedCase("TC-2", { priority: "low" }),
        designedCase("TC-3", { priority: "critical" }),
        designedCase("TC-5", { priority: "medium" }),
      ],
      modes,
    );
    expect(selected.map((c) => c.designed.id)).toEqual(["TC-3", "TC-5", "TC-2"]);
  });

  it("defaults unknown cases to guided-manual rather than dropping them", () => {
    const selected = selectGuidedCases([designedCase("TC-9")], new Map());
    expect(selected).toHaveLength(1);
    expect(selected[0]!.mode).toBe("guided-manual");
  });
});

describe("summarize / verdictFor", () => {
  it("counts by status and computes pass rate over executed cases only", () => {
    const summary = summarize([
      result("TC-1", "pass"),
      result("TC-2", "pass"),
      result("TC-3", "fail"),
      result("TC-4", "not-run"),
    ]);
    expect(summary).toMatchObject({ total: 4, pass: 2, fail: 1, notRun: 1 });
    // 2 of 3 executed — not-run is excluded from the denominator.
    expect(summary.passRate).toBeCloseTo(0.67, 2);
  });

  it("fails the run on a single failed case", () => {
    const summary = summarize([result("TC-1", "pass"), result("TC-2", "fail")]);
    expect(verdictFor(summary)).toBe("failed");
  });

  it("reports incomplete — never passed — when cases were not run", () => {
    const summary = summarize([result("TC-1", "pass"), result("TC-2", "not-run")]);
    expect(verdictFor(summary)).toBe("incomplete");
  });

  it("treats blocked cases as incomplete", () => {
    const summary = summarize([result("TC-1", "pass"), result("TC-2", "blocked")]);
    expect(verdictFor(summary)).toBe("incomplete");
  });

  it("does not pass a run in which nothing was executed", () => {
    const summary = summarize([result("TC-1", "skipped")]);
    expect(verdictFor(summary)).toBe("incomplete");
  });

  it("fails when an exit criterion is unmet even if every case passed", () => {
    const summary = summarize([result("TC-1", "pass")]);
    expect(
      verdictFor(summary, [
        { criterion: "x", status: "not-met", detail: "d", needsHumanConfirmation: false },
      ]),
    ).toBe("failed");
  });

  it("passes when everything executed passed", () => {
    const summary = summarize([result("TC-1", "pass"), result("TC-2", "pass")]);
    expect(verdictFor(summary)).toBe("passed");
  });
});

describe("evaluateExitCriteria", () => {
  const ctx = {
    cases: [
      designedCase("TC-1", { mitigates: ["RSK-1"], technique: "boundary-value-analysis" }),
      designedCase("TC-2", { mitigates: ["RSK-2"], technique: "decision-table" }),
    ],
    results: [result("TC-1", "pass"), result("TC-2", "pass")],
    defects: [] as ObservedDefect[],
    priorityRiskIds: ["RSK-1", "RSK-2"],
    mandatoryTechniques: ["boundary-value-analysis", "decision-table"],
  };

  it("marks a criterion it cannot check as unknown, needing human confirmation", () => {
    const [evaluated] = evaluateExitCriteria(
      ["Branch coverage on the changed units is at least 90%"],
      ctx,
    );
    expect(evaluated!.status).toBe("unknown");
    expect(evaluated!.needsHumanConfirmation).toBe(true);
  });

  describe("execution-with-evidence criterion", () => {
    const criterion = "Every planned test case has been executed and its result recorded with evidence";

    it("is met when all cases ran with evidence", () => {
      expect(evaluateExitCriteria([criterion], ctx)[0]!.status).toBe("met");
    });

    it("is not met when a case was not run, naming it", () => {
      const evaluated = evaluateExitCriteria([criterion], {
        ...ctx,
        results: [result("TC-1", "pass"), result("TC-2", "not-run")],
      })[0]!;
      expect(evaluated.status).toBe("not-met");
      expect(evaluated.detail).toContain("TC-2");
    });

    it("is not met when an executed case carries no evidence", () => {
      const evaluated = evaluateExitCriteria([criterion], {
        ...ctx,
        results: [result("TC-1", "pass"), result("TC-2", "pass", { evidence: [] })],
      })[0]!;
      expect(evaluated.status).toBe("not-met");
      expect(evaluated.detail).toContain("sin evidencia");
    });
  });

  describe("priority-risk coverage criterion", () => {
    const criterion = "Each risk factor rated high or critical is covered by at least one passing test";

    it("is met when every priority risk has a green case", () => {
      expect(evaluateExitCriteria([criterion], ctx)[0]!.status).toBe("met");
    });

    it("is not met when the covering case failed — a failing test covers nothing", () => {
      const evaluated = evaluateExitCriteria([criterion], {
        ...ctx,
        results: [result("TC-1", "pass"), result("TC-2", "fail")],
      })[0]!;
      expect(evaluated.status).toBe("not-met");
      expect(evaluated.detail).toContain("RSK-2");
    });
  });

  describe("severe-defect criterion", () => {
    const criterion = "No open defect of severity 1 or 2 remains against the change";

    it("is met with no severe defects", () => {
      expect(evaluateExitCriteria([criterion], ctx)[0]!.status).toBe("met");
    });

    it("is not met when a severity-2 defect exists", () => {
      const evaluated = evaluateExitCriteria([criterion], {
        ...ctx,
        defects: [{ id: "DEF-1", summary: "roto", severity: 2, caseId: "TC-1" }],
      })[0]!;
      expect(evaluated.status).toBe("not-met");
      expect(evaluated.detail).toContain("DEF-1");
    });

    it("ignores low-severity defects", () => {
      const evaluated = evaluateExitCriteria([criterion], {
        ...ctx,
        defects: [{ id: "DEF-1", summary: "cosmético", severity: 4, caseId: "TC-1" }],
      })[0]!;
      expect(evaluated.status).toBe("met");
    });
  });

  describe("mandatory-technique criterion", () => {
    const criterion = "Mandatory techniques applied and evidenced: boundary-value-analysis, decision-table";

    it("is met when each mandatory technique has an executed case", () => {
      expect(evaluateExitCriteria([criterion], ctx)[0]!.status).toBe("met");
    });

    it("is not met when a mandatory technique has no executed case", () => {
      const evaluated = evaluateExitCriteria([criterion], {
        ...ctx,
        results: [result("TC-1", "pass"), result("TC-2", "not-run")],
      })[0]!;
      expect(evaluated.status).toBe("not-met");
      expect(evaluated.detail).toContain("decision-table");
    });
  });
});
