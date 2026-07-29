import { buildStrategy } from "@kriteria/istqb";
import { describe, expect, it } from "vitest";
import {
  AnalysisSchema,
  CriticReportSchema,
  DesignOutputSchema,
  RiskRegisterSchema,
  TestBasisSchema,
  toStrategyInput,
  type Analysis,
  type RiskRegister,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Fixtures — a small but complete work item, the shape agents will produce
// ---------------------------------------------------------------------------

const basis = {
  hash: "a1b2c3d4e5",
  source: {
    kind: "jira" as const,
    ref: "PROJ-101",
    url: "https://example.atlassian.net/browse/PROJ-101",
  },
  title: "Apply tiered discount at checkout",
  description: "As a buyer I get a discount depending on cart total…",
  acceptanceCriteria: [
    { id: "AC-1", text: "Cart >= 100 gets 10% off", testable: true },
    { id: "AC-2", text: "The experience should feel smooth", testable: false },
  ],
  sourceType: "Story",
  labels: ["checkout"],
  components: ["payments"],
  attachments: [],
  links: [],
  discussion: ["Note: rounding rules changed last quarter"],
};

const analysis: Analysis = {
  features: [
    {
      id: "FEA-1",
      name: "Tiered discount",
      summary: "Discount percentage depends on cart total",
      evidence: [{ from: "AC-1", excerpt: "Cart >= 100 gets 10% off" }],
    },
  ],
  actors: [
    { name: "Buyer", kind: "human-role", interest: "pay the right price" },
  ],
  businessRules: [
    {
      id: "BR-1",
      statement: "10% off at total >= 100",
      features: ["FEA-1"],
      evidence: [{ from: "AC-1", excerpt: "Cart >= 100 gets 10% off" }],
    },
  ],
  ambiguities: [
    {
      id: "AMB-1",
      question: "Is the threshold inclusive?",
      workingAssumption: ">= 100 is inclusive",
      riskIfWrong: "Off-by-one pricing at the boundary",
      evidence: [{ from: "AC-1", excerpt: "Cart >= 100" }],
    },
  ],
  signals: {
    context: {
      changeType: "enhancement",
      specQuality: 0.6,
      hasStateModel: false,
      hasApiContract: false,
      hasBusinessRuleMatrix: true,
      regulatory: [],
      standards: [],
      touchesSharedComponent: false,
      hasRegressionSuite: true,
      automationMaturity: "partial",
      timePressure: "medium",
      domainExpertAvailable: true,
      historicalDefectDensity: 0.3,
    },
    system: {
      hasUserFacingUi: true,
      handlesSensitiveData: false,
      performanceSensitive: false,
      multiPlatform: false,
      crossesServiceBoundary: false,
      codeAccess: true,
    },
    traits: {
      hasOrderedInputDomain: true,
      hasDiscretePartitions: true,
      hasStateMachine: false,
      hasBusinessRules: true,
      independentParameters: 2,
      hasUserWorkflow: true,
      codeAccess: true,
      safetyCritical: false,
    },
  },
  unmappedAcceptanceCriteria: ["AC-2"],
};

const risks: RiskRegister = {
  factors: [
    {
      id: "RSK-1",
      description: "Discount applied twice on threshold boundary",
      area: "FEA-1",
      likelihood: 3,
      impact: 4,
      evidence: [
        { from: "discussion[0]", excerpt: "rounding rules changed last quarter" },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Contract validation
// ---------------------------------------------------------------------------

describe("TestBasisSchema", () => {
  it("accepts a normalized work item and applies defaults", () => {
    const parsed = TestBasisSchema.parse(basis);
    expect(parsed.links).toEqual([]);
  });

  it("rejects acceptance criteria with malformed ids", () => {
    const bad = {
      ...basis,
      acceptanceCriteria: [{ id: "CRITERIA-1", text: "x", testable: true }],
    };
    expect(TestBasisSchema.safeParse(bad).success).toBe(false);
  });
});

describe("AnalysisSchema", () => {
  it("accepts a complete analysis", () => {
    expect(AnalysisSchema.safeParse(analysis).success).toBe(true);
  });

  it("rejects a feature without evidence — claims must cite the basis", () => {
    const bad = {
      ...analysis,
      features: [{ ...analysis.features[0]!, evidence: [] }],
    };
    expect(AnalysisSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an ambiguity without a working assumption", () => {
    const { workingAssumption: _drop, ...rest } = analysis.ambiguities[0]!;
    const bad = { ...analysis, ambiguities: [rest] };
    expect(AnalysisSchema.safeParse(bad).success).toBe(false);
  });
});

describe("RiskRegisterSchema", () => {
  it("accepts a register with evidenced factors", () => {
    expect(RiskRegisterSchema.safeParse(risks).success).toBe(true);
  });

  it("rejects an empty register without explicit confirmation", () => {
    expect(RiskRegisterSchema.safeParse({ factors: [] }).success).toBe(false);
  });

  it("accepts an empty register only with a confirmed reason", () => {
    const parsed = RiskRegisterSchema.safeParse({
      factors: [],
      nothingNoteworthy: { confirmed: true, reason: "typo-only label change" },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-scale likelihood", () => {
    const bad = {
      factors: [{ ...risks.factors[0]!, likelihood: 6 }],
    };
    expect(RiskRegisterSchema.safeParse(bad).success).toBe(false);
  });
});

describe("DesignOutputSchema", () => {
  const validCase = {
    id: "TC-1",
    title: "Boundary: cart total exactly 100 gets 10%",
    level: "system",
    type: "functional",
    technique: "boundary-value-analysis",
    priority: "high",
    covers: ["FEA-1"],
    mitigates: ["RSK-1"],
    verifies: ["AC-1"],
    preconditions: ["Catalog seeded with priced items"],
    dataRequirements: ["cart totalling exactly 100.00"],
    steps: [{ action: "Checkout with total 100.00", expected: "10% discount applied" }],
    needsHuman: false,
  };

  it("accepts a traceable case", () => {
    const parsed = DesignOutputSchema.safeParse({
      cases: [validCase],
      exclusions: [],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a case with an unknown technique", () => {
    const bad = {
      cases: [{ ...validCase, technique: "vibes-based" }],
      exclusions: [],
    };
    expect(DesignOutputSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a case covering no feature — untraceable coverage", () => {
    const bad = { cases: [{ ...validCase, covers: [] }], exclusions: [] };
    expect(DesignOutputSchema.safeParse(bad).success).toBe(false);
  });
});

describe("CriticReportSchema", () => {
  it("rejects a pass verdict that coexists with blocker findings", () => {
    const bad = {
      findings: [
        {
          id: "CRT-1",
          kind: "coverage-gap",
          severity: "blocker",
          summary: "AC-2 has no covering case",
          refs: ["AC-2"],
          recommendation: "Clarify AC-2 or add a usability check",
        },
      ],
      verdict: "pass",
      scopeStatement: "Probed coverage and traceability",
    };
    expect(CriticReportSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts needs-revision with blockers", () => {
    const ok = {
      findings: [
        {
          id: "CRT-1",
          kind: "coverage-gap",
          severity: "blocker",
          summary: "AC-2 has no covering case",
          refs: ["AC-2"],
          recommendation: "Clarify AC-2 or add a usability check",
        },
      ],
      verdict: "needs-revision",
      scopeStatement: "Probed coverage and traceability",
    };
    expect(CriticReportSchema.safeParse(ok).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration — validated agent output feeds the engine directly
// ---------------------------------------------------------------------------

describe("toStrategyInput → buildStrategy", () => {
  it("produces a full strategy from validated agent payloads", () => {
    const strategy = buildStrategy(toStrategyInput(analysis, risks));

    // The 3x4 risk factor must land as high/thorough regardless of any claim.
    expect(strategy.risk.overallLevel).toBe("high");
    expect(strategy.depth).toBe("thorough");
    expect(strategy.approach.primary.approach).toBe("analytical");

    // Ordered input domain → BVA must come back mandatory at system level.
    const system = strategy.techniquesByLevel.find((t) => t.level === "system")!;
    const bva = system.techniques.find(
      (t) => t.technique === "boundary-value-analysis",
    );
    expect(bva?.mandatory).toBe(true);
  });
});
