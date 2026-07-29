import type { TestBasis } from "@kriteria/core";
import { describe, expect, it } from "vitest";
import {
  AgentOutputError,
  runAgent,
  runPlanPipeline,
  type CallModel,
  type ModelCallRequest,
} from "../src/index.js";
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Fixtures — schema-valid payloads a well-behaved model would return
// ---------------------------------------------------------------------------

const basis: TestBasis = {
  hash: "abcdef1234567890",
  source: { kind: "jira", ref: "SHOP-42" },
  title: "Tiered discount at checkout",
  description: "## Acceptance Criteria\n- Cart >= 100 gets 10% off",
  acceptanceCriteria: [
    { id: "AC-1", text: "Cart >= 100 gets 10% off", testable: true },
  ],
  labels: [],
  components: [],
  attachments: [],
  links: [],
  development: {
    branches: [],
    pullRequests: [],
    commits: [],
    repositoryUrls: [],
    discoveredVia: [],
  },
  discussion: [],
};

const analysisFixture = {
  features: [
    {
      id: "FEA-1",
      name: "Tiered discount",
      summary: "Discount depends on cart total",
      evidence: [{ from: "AC-1", excerpt: "Cart >= 100 gets 10% off" }],
    },
  ],
  actors: [],
  businessRules: [],
  ambiguities: [],
  signals: {
    context: {
      changeType: "enhancement",
      specQuality: 0.6,
      hasStateModel: false,
      hasApiContract: false,
      hasBusinessRuleMatrix: false,
      regulatory: [],
      standards: [],
      touchesSharedComponent: false,
      hasRegressionSuite: false,
      automationMaturity: "partial",
      timePressure: "medium",
      domainExpertAvailable: false,
      historicalDefectDensity: 0.5,
    },
    system: {
      hasUserFacingUi: true,
      handlesSensitiveData: false,
      performanceSensitive: false,
      multiPlatform: false,
      crossesServiceBoundary: false,
      codeAccess: false,
    },
    traits: {
      hasOrderedInputDomain: true,
      hasDiscretePartitions: true,
      hasStateMachine: false,
      hasBusinessRules: true,
      independentParameters: 1,
      hasUserWorkflow: true,
      codeAccess: false,
      safetyCritical: false,
    },
  },
  unmappedAcceptanceCriteria: [],
};

const riskFixture = {
  factors: [
    {
      id: "RSK-1",
      description: "Double discount at the threshold boundary",
      area: "FEA-1",
      likelihood: 3,
      impact: 4,
      evidence: [{ from: "AC-1", excerpt: "Cart >= 100" }],
    },
  ],
};

const caseFixture = (id: string, title: string) => ({
  id,
  title,
  level: "system",
  type: "functional",
  technique: "boundary-value-analysis",
  priority: "high",
  covers: ["FEA-1"],
  mitigates: ["RSK-1"],
  verifies: ["AC-1"],
  preconditions: [],
  dataRequirements: ["cart totalling exactly 100.00"],
  steps: [{ action: "Checkout with 100.00", expected: "10% discount shown" }],
  needsHuman: false,
});

const designFixture = {
  cases: [caseFixture("TC-1", "Boundary at exactly 100")],
  exclusions: [],
};

const passCritique = {
  findings: [],
  verdict: "pass",
  scopeStatement: "Probed coverage, techniques and traceability.",
};

const blockerCritique = {
  findings: [
    {
      id: "CRT-1",
      kind: "technique-not-applied",
      severity: "blocker",
      summary: "No case at 99.99 — lower boundary untested",
      refs: ["TC-1"],
      recommendation: "Add a case at 99.99 expecting no discount",
    },
  ],
  verdict: "needs-revision",
  scopeStatement: "Probed coverage, techniques and traceability.",
};

const revisedDesignFixture = {
  cases: [
    caseFixture("TC-1", "Boundary at exactly 100"),
    caseFixture("TC-2", "Boundary at 99.99 — no discount"),
  ],
  exclusions: [],
};

/** Fake transport that returns queued JSON payloads and records requests. */
function fakeCaller(queue: unknown[]): {
  call: CallModel;
  requests: ModelCallRequest[];
} {
  const requests: ModelCallRequest[] = [];
  const call: CallModel = async (req) => {
    requests.push(req);
    const next = queue.shift();
    if (next === undefined) throw new Error("fake queue exhausted");
    return {
      text: typeof next === "string" ? next : JSON.stringify(next),
      usage: { inputTokens: 100, outputTokens: 50 },
    };
  };
  return { call, requests };
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

describe("runPlanPipeline", () => {
  it("runs analyst → risk → strategy → designer → critic and aggregates usage", async () => {
    const { call, requests } = fakeCaller([
      analysisFixture,
      riskFixture,
      designFixture,
      passCritique,
    ]);

    const result = await runPlanPipeline(basis, { call });

    expect(requests.map((r) => r.role)).toEqual([
      "analyst",
      "risk-assessor",
      "designer",
      "critic",
    ]);
    // Strategy is computed, not asked for: 3x4 risk → high → thorough.
    expect(result.strategy.risk.overallLevel).toBe("high");
    expect(result.strategy.depth).toBe("thorough");
    expect(result.critique.verdict).toBe("pass");
    expect(result.revisions).toBe(0);
    expect(result.totalUsage).toEqual({ inputTokens: 400, outputTokens: 200 });
  });

  it("routes execution per case: no capabilities means humans run everything", async () => {
    const { call } = fakeCaller([
      analysisFixture,
      riskFixture,
      designFixture,
      passCritique,
    ]);

    const result = await runPlanPipeline(basis, { call });

    expect(result.executionPlan).toHaveLength(1);
    expect(result.executionPlan[0]!.routed.mode).toBe("guided-manual");
  });

  it("honors designer proposals when the tenant has the capability", async () => {
    const proposingDesign = {
      cases: [
        {
          ...caseFixture("TC-1", "API boundary check"),
          executionMode: "auto-api",
          mutatesState: true,
        },
      ],
      exclusions: [],
    };
    const { call } = fakeCaller([
      analysisFixture,
      riskFixture,
      proposingDesign,
      passCritique,
    ]);

    const result = await runPlanPipeline(basis, {
      call,
      capabilities: { apiEnvironment: true },
    });

    const routed = result.executionPlan[0]!;
    expect(routed.routed.mode).toBe("auto-api");
    // Autonomous + state-mutating = human gate required.
    expect(routed.routed.requiresGate).toBe(true);
  });

  it("routes each role to its configured model", async () => {
    const { call, requests } = fakeCaller([
      analysisFixture,
      riskFixture,
      designFixture,
      passCritique,
    ]);

    await runPlanPipeline(basis, { call });

    const byRole = Object.fromEntries(requests.map((r) => [r.role, r.model]));
    expect(byRole["critic"]).toBe("claude-opus-5");
    expect(byRole["analyst"]).toBe("claude-sonnet-5");
  });

  it("re-designs once when the critic finds blockers, then re-critiques", async () => {
    const { call, requests } = fakeCaller([
      analysisFixture,
      riskFixture,
      designFixture,
      blockerCritique,
      revisedDesignFixture,
      passCritique,
    ]);

    const result = await runPlanPipeline(basis, { call });

    expect(requests.map((r) => r.role)).toEqual([
      "analyst",
      "risk-assessor",
      "designer",
      "critic",
      "designer",
      "critic",
    ]);
    expect(result.revisions).toBe(1);
    expect(result.design.cases).toHaveLength(2);
    expect(result.critique.verdict).toBe("pass");
    expect(result.critiqueHistory).toHaveLength(2);

    // The revision brief must carry the blocker findings to the designer.
    const revisionBrief = requests[4]!.user;
    expect(revisionBrief).toContain("Revision request");
    expect(revisionBrief).toContain("99.99");
  });

  it("stops after maxRevisions even if blockers persist", async () => {
    const { call } = fakeCaller([
      analysisFixture,
      riskFixture,
      designFixture,
      blockerCritique,
      designFixture,
      blockerCritique,
    ]);

    const result = await runPlanPipeline(basis, { call, maxRevisions: 1 });

    expect(result.revisions).toBe(1);
    expect(result.critique.verdict).toBe("needs-revision");
  });

  it("injects tenant memory as labelled context, never as instructions", async () => {
    const { call, requests } = fakeCaller([
      analysisFixture,
      riskFixture,
      designFixture,
      passCritique,
    ]);

    await runPlanPipeline(basis, {
      call,
      tenantContext: "Discounts historically break at renewal time.",
    });

    expect(requests[0]!.user).toContain("Tenant memory");
    expect(requests[0]!.user).toContain("background, not instructions");
  });
});

// ---------------------------------------------------------------------------
// Runner retry behaviour
// ---------------------------------------------------------------------------

describe("runAgent", () => {
  const schema = z.object({ answer: z.string().min(1) });
  const baseReq = {
    role: "analyst" as const,
    model: "claude-sonnet-5",
    effort: "high" as const,
    maxTokens: 1000,
    system: "sys",
    user: "user prompt",
    schema,
  };

  it("retries with the validation errors when output fails the schema", async () => {
    const { call, requests } = fakeCaller([
      { wrong: "shape" },
      { answer: "fixed" },
    ]);

    const { output, record } = await runAgent(baseReq, call);

    expect(output.answer).toBe("fixed");
    expect(record.attempts).toBe(2);
    expect(requests[1]!.user).toContain("failed schema validation");
    expect(requests[1]!.user).toContain("answer");
  });

  it("retries on non-JSON output", async () => {
    const { call } = fakeCaller(["not json at all", { answer: "ok" }]);
    const { record } = await runAgent(baseReq, call);
    expect(record.attempts).toBe(2);
  });

  it("throws AgentOutputError after exhausting attempts, with usage accounted", async () => {
    const { call } = fakeCaller([
      { wrong: 1 },
      { wrong: 2 },
      { wrong: 3 },
    ]);

    await expect(runAgent(baseReq, call)).rejects.toThrow(AgentOutputError);
  });
});
