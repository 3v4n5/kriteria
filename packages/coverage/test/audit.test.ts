import type { Analysis, DesignedCase, RiskRegister } from "@kriteria/core";
import { buildStrategy, reconcileCaseBudget, type TestStrategy } from "@kriteria/istqb";
import { describe, expect, it } from "vitest";
import { auditPlan, renderAudit, type AuditInput } from "../src/index.js";

const analysis = {
  features: [
    { id: "FEA-1", name: "descuento", summary: "s", evidence: [{ from: "AC-1", excerpt: "e" }] },
    { id: "FEA-2", name: "envío", summary: "s", evidence: [{ from: "AC-2", excerpt: "e" }] },
  ],
  actors: [],
  businessRules: [
    { id: "BR-1", statement: "10% sobre 100", features: ["FEA-1"], evidence: [{ from: "AC-1", excerpt: "e" }] },
  ],
  ambiguities: [],
  signals: {
    context: {
      changeType: "enhancement", specQuality: 0.7, hasStateModel: false, hasApiContract: false,
      hasBusinessRuleMatrix: true, regulatory: [], standards: [], touchesSharedComponent: false,
      hasRegressionSuite: false, automationMaturity: "partial", timePressure: "medium",
      domainExpertAvailable: true, historicalDefectDensity: 0.3,
    },
    system: {
      hasUserFacingUi: true, handlesSensitiveData: false, performanceSensitive: false,
      multiPlatform: false, crossesServiceBoundary: false, codeAccess: false,
    },
    traits: {
      hasOrderedInputDomain: true, hasDiscretePartitions: true, hasStateMachine: false,
      hasBusinessRules: true, independentParameters: 1, hasUserWorkflow: true,
      codeAccess: false, safetyCritical: false,
    },
  },
  unmappedAcceptanceCriteria: [],
} as Analysis;

const risks: RiskRegister = {
  factors: [
    { id: "RSK-1", description: "doble descuento", area: "FEA-1", likelihood: 4, impact: 4,
      evidence: [{ from: "AC-1", excerpt: "e" }] },
    { id: "RSK-2", description: "cosmético", area: "FEA-2", likelihood: 1, impact: 2,
      evidence: [{ from: "AC-2", excerpt: "e" }] },
  ],
};

const strategy: TestStrategy = buildStrategy({
  context: { ...analysis.signals.context, overallRisk: "low" },
  system: analysis.signals.system,
  risks: risks.factors.map((f) => ({
    id: f.id, description: f.description, area: f.area,
    likelihood: f.likelihood as 1 | 2 | 3 | 4 | 5, impact: f.impact as 1 | 2 | 3 | 4 | 5,
  })),
  traits: analysis.signals.traits,
  areaCount: 2,
  policyCaseCap: 24,
});

const acceptanceCriteria = [
  { id: "AC-1", testable: true },
  { id: "AC-2", testable: true },
  { id: "AC-3", testable: false },
];

const designedCase = (id: string, o: Partial<DesignedCase> = {}): DesignedCase => ({
  id, title: `caso ${id}`, level: "system", type: "functional",
  technique: "boundary-value-analysis", priority: "high",
  covers: ["FEA-1"], mitigates: ["RSK-1"], verifies: ["AC-1"], validates: ["BR-1"],
  preconditions: [], dataRequirements: [],
  steps: [{ action: "a", expected: "b" }], needsHuman: false, ...o,
});

const input = (cases: DesignedCase[]): AuditInput => ({
  analysis, risks, strategy,
  design: { cases, exclusions: [] },
  acceptanceCriteria,
});

describe("auditPlan", () => {
  it("flags a feature nobody covers as a blocker", () => {
    const audit = auditPlan(input([designedCase("TC-1")]));
    const finding = audit.findings.find((f) => f.kind === "uncovered-feature");
    expect(finding).toMatchObject({ severity: "blocker", refs: ["FEA-2"] });
    expect(audit.hasBlockers).toBe(true);
  });

  it("flags a testable criterion nobody verifies, and ignores a non-testable one", () => {
    const audit = auditPlan(input([designedCase("TC-1")]));
    const unverified = audit.findings.filter((f) => f.kind === "unverified-criterion");
    expect(unverified.map((f) => f.refs[0])).toEqual(["AC-2"]);
    // AC-3 is not testable — its absence is an ambiguity, not a coverage gap.
    expect(unverified.some((f) => f.refs.includes("AC-3"))).toBe(false);
  });

  it("flags a business rule no case exercises — the link the schema now carries", () => {
    const audit = auditPlan(input([designedCase("TC-1", { validates: [] })]));
    expect(audit.findings.find((f) => f.kind === "untested-rule")).toMatchObject({
      severity: "major",
      refs: ["BR-1"],
    });
  });

  it("flags an unmitigated PRIORITY risk but tolerates a low one", () => {
    const audit = auditPlan(input([designedCase("TC-1", { mitigates: [] })]));
    const unmitigated = audit.findings.filter((f) => f.kind === "unmitigated-risk");
    expect(unmitigated.map((f) => f.refs[0])).toEqual(["RSK-1"]);
  });

  it("flags a mandatory technique with no case at its level", () => {
    // Only a system-level case exists; other levels lose their mandatory techniques.
    const audit = auditPlan(input([designedCase("TC-1")]));
    const missing = audit.findings.filter((f) => f.kind === "technique-not-applied");
    expect(missing.every((f) => f.severity === "blocker")).toBe(true);
  });

  it("catches dangling references to ids that do not exist", () => {
    const audit = auditPlan(input([designedCase("TC-1", { covers: ["FEA-1", "FEA-9"] })]));
    expect(audit.findings.find((f) => f.kind === "dangling-reference")).toMatchObject({
      severity: "major",
      refs: ["TC-1", "FEA-9"],
    });
  });

  it("catches an auto-api case whose steps carry no executable spec", () => {
    const audit = auditPlan(
      input([designedCase("TC-1", { executionMode: "auto-api" })]),
    );
    expect(audit.findings.find((f) => f.kind === "unexecutable-auto-case")).toMatchObject({
      severity: "major",
    });
  });

  it("does not flag an auto-api case that does carry specs", () => {
    const audit = auditPlan(
      input([
        designedCase("TC-1", {
          executionMode: "auto-api",
          steps: [
            {
              action: "a",
              expected: "b",
              api: { method: "GET", path: "/x", assertions: [{ type: "status", equals: 200 }] },
            },
          ],
        }),
      ]),
    );
    expect(audit.findings.some((f) => f.kind === "unexecutable-auto-case")).toBe(false);
  });

  it("flags a design that exceeds the agreed budget", () => {
    const many = Array.from({ length: 30 }, (_, i) => designedCase(`TC-${i + 1}`));
    const audit = auditPlan(input(many));
    expect(audit.findings.find((f) => f.kind === "budget-exceeded")).toBeDefined();
  });

  it("reports no findings when everything traces", () => {
    const complete = strategy.techniquesByLevel.flatMap((lt, li) =>
      lt.techniques.map((t, ti) =>
        designedCase(`TC-${li * 10 + ti + 1}`, {
          level: lt.level,
          technique: t.technique,
          covers: ["FEA-1", "FEA-2"],
          verifies: ["AC-1", "AC-2"],
        }),
      ),
    );
    const audit = auditPlan(input(complete));
    expect(audit.findings).toEqual([]);
    expect(audit.hasBlockers).toBe(false);
  });

  it("builds a coverage table linking every id to its cases", () => {
    const audit = auditPlan(input([designedCase("TC-1")]));
    expect(audit.coverage.features).toContainEqual({ id: "FEA-1", cases: ["TC-1"] });
    expect(audit.coverage.features).toContainEqual({ id: "FEA-2", cases: [] });
    expect(audit.coverage.risks.find((r) => r.id === "RSK-1")!.priority).toBe(true);
    expect(audit.coverage.risks.find((r) => r.id === "RSK-2")!.priority).toBe(false);
  });
});

describe("renderAudit", () => {
  it("tells the critic not to recount, and shows the gaps", () => {
    const rendered = renderAudit(auditPlan(input([designedCase("TC-1")])));
    expect(rendered).toContain("no la recalcules");
    expect(rendered).toContain("FEA-2");
    expect(rendered).toContain("juzgar lo que el código no puede");
  });
});

describe("reconcileCaseBudget", () => {
  it("leaves the budget alone when depth fits under the cap", () => {
    const budget = reconcileCaseBudget({ min: 3, max: 8 }, 2, 24);
    expect(budget.capped).toBe(false);
    expect(budget.implied).toEqual({ min: 6, max: 16 });
  });

  it("caps declaredly, stating what depth implied and why it was bound", () => {
    const budget = reconcileCaseBudget({ min: 20, max: 50 }, 6, 24);
    expect(budget.capped).toBe(true);
    expect(budget.total).toBe(24);
    expect(budget.implied).toEqual({ min: 120, max: 300 });
    // The rationale is what stops reviewers flagging a contradiction.
    expect(budget.rationale).toContain("120-300");
    expect(budget.rationale).toContain("prioriza por riesgo");
  });

  it("treats a null cap as no economic limit", () => {
    const budget = reconcileCaseBudget({ min: 20, max: 50 }, 6, null);
    expect(budget.capped).toBe(false);
    expect(budget.total).toBeNull();
  });
});
