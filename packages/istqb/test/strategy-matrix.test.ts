import { describe, expect, it } from "vitest";
import {
  SUPPORTING_THRESHOLD,
  scoreApproaches,
  selectApproaches,
  type StrategyContext,
} from "../src/strategy-matrix.js";

const baseContext = (overrides: Partial<StrategyContext> = {}): StrategyContext => ({
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
  historicalDefectDensity: 0.2,
  overallRisk: "medium",
  ...overrides,
});

const scoreOf = (ctx: StrategyContext, approach: string): number =>
  scoreApproaches(ctx).find((a) => a.approach === approach)!.score;

describe("selectApproaches", () => {
  it("defaults to analytical when nothing else is triggered", () => {
    expect(selectApproaches(baseContext()).primary.approach).toBe("analytical");
  });

  it("always attaches an auditable rationale to every approach", () => {
    for (const scored of scoreApproaches(baseContext())) {
      expect(scored.rationale.length).toBeGreaterThan(0);
    }
  });

  it("keeps every score within 0..100", () => {
    const extreme = baseContext({
      specQuality: 1,
      hasStateModel: true,
      hasApiContract: true,
      hasBusinessRuleMatrix: true,
      regulatory: ["HIPAA", "SOX"],
      standards: ["OWASP-Top-10", "WCAG-2.2-AA"],
      touchesSharedComponent: true,
      hasRegressionSuite: true,
      automationMaturity: "mature",
      timePressure: "high",
      overallRisk: "critical",
    });
    for (const scored of scoreApproaches(extreme)) {
      expect(scored.score).toBeGreaterThanOrEqual(0);
      expect(scored.score).toBeLessThanOrEqual(100);
    }
  });

  describe("regulatory constraints", () => {
    const regulated = baseContext({ regulatory: ["HIPAA"] });

    it("forces process-compliant to be primary regardless of score", () => {
      const selection = selectApproaches(regulated);
      expect(selection.primary.approach).toBe("process-compliant");
      expect(selection.primary.mandatory).toBe(true);
    });

    it("penalises the reactive approach — exploratory is not auditable", () => {
      expect(scoreOf(regulated, "reactive")).toBeLessThan(
        scoreOf(baseContext(), "reactive"),
      );
    });
  });

  it("picks model-based when a real model exists", () => {
    const selection = selectApproaches(
      baseContext({
        hasStateModel: true,
        hasApiContract: true,
        hasBusinessRuleMatrix: true,
        specQuality: 0.8,
      }),
    );
    const chosen = [
      selection.primary.approach,
      ...selection.supporting.map((s) => s.approach),
    ];
    expect(chosen).toContain("model-based");
  });

  it("scores model-based near the floor when there is no model", () => {
    expect(scoreOf(baseContext(), "model-based")).toBeLessThan(
      SUPPORTING_THRESHOLD,
    );
  });

  it("raises regression-averse when a shared component is touched", () => {
    const shared = baseContext({
      touchesSharedComponent: true,
      changeType: "refactor",
      automationMaturity: "mature",
    });
    const selection = selectApproaches(shared);
    const chosen = [
      selection.primary.approach,
      ...selection.supporting.map((s) => s.approach),
    ];
    expect(chosen).toContain("regression-averse");
  });

  it("turns reactive on when the spec is too thin to design from", () => {
    expect(scoreOf(baseContext({ specQuality: 0.1, timePressure: "high" }), "reactive"))
      .toBeGreaterThan(scoreOf(baseContext(), "reactive"));
  });

  it("prefers directed over reactive when an expert is available", () => {
    const ctx = baseContext({
      specQuality: 0.2,
      domainExpertAvailable: true,
      changeType: "new-feature",
    });
    expect(scoreOf(ctx, "directed")).toBeGreaterThan(scoreOf(ctx, "reactive"));
  });

  it("caps supporting approaches at two unless one is mandatory", () => {
    const selection = selectApproaches(
      baseContext({
        hasStateModel: true,
        hasApiContract: true,
        standards: ["OWASP-Top-10"],
        hasRegressionSuite: true,
        touchesSharedComponent: true,
        automationMaturity: "mature",
        overallRisk: "critical",
      }),
    );
    expect(selection.supporting.length).toBeLessThanOrEqual(2);
  });

  it("ranks all seven approaches for auditability", () => {
    const { all } = selectApproaches(baseContext());
    expect(all).toHaveLength(7);
    const scores = all.map((a) => a.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});
