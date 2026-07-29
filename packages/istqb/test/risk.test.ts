import { describe, expect, it } from "vitest";
import {
  assessRisk,
  caseBudgetForDepth,
  depthForLevel,
  riskLevelFromScore,
  scoreFactor,
  type RiskFactor,
} from "../src/risk.js";

const factor = (
  id: string,
  likelihood: RiskFactor["likelihood"],
  impact: RiskFactor["impact"],
): RiskFactor => ({
  id,
  description: `risk ${id}`,
  area: "checkout",
  likelihood,
  impact,
});

describe("riskLevelFromScore", () => {
  it("maps the 5x5 grid onto four levels", () => {
    expect(riskLevelFromScore(1)).toBe("low");
    expect(riskLevelFromScore(4)).toBe("low");
    expect(riskLevelFromScore(5)).toBe("medium");
    expect(riskLevelFromScore(9)).toBe("medium");
    expect(riskLevelFromScore(10)).toBe("high");
    expect(riskLevelFromScore(15)).toBe("high");
    expect(riskLevelFromScore(16)).toBe("critical");
    expect(riskLevelFromScore(25)).toBe("critical");
  });

  it("puts a 4x4 factor in critical — impact-4 defects reach users", () => {
    expect(scoreFactor(factor("RSK-01", 4, 4)).level).toBe("critical");
  });
});

describe("depthForLevel", () => {
  it("escalates depth with risk", () => {
    expect(depthForLevel("low")).toBe("smoke");
    expect(depthForLevel("medium")).toBe("standard");
    expect(depthForLevel("high")).toBe("thorough");
    expect(depthForLevel("critical")).toBe("exhaustive");
  });
});

describe("assessRisk", () => {
  it("drives the overall level from the worst factor, not the average", () => {
    const assessment = assessRisk([
      factor("RSK-01", 1, 1),
      factor("RSK-02", 1, 1),
      factor("RSK-03", 5, 5),
    ]);

    expect(assessment.overallLevel).toBe("critical");
    expect(assessment.overallDepth).toBe("exhaustive");
    expect(assessment.averageScore).toBeLessThan(10);
  });

  it("sorts priority factors by score and excludes low/medium ones", () => {
    const assessment = assessRisk([
      factor("RSK-low", 1, 2),
      factor("RSK-high", 3, 4),
      factor("RSK-crit", 5, 4),
    ]);

    expect(assessment.priorityFactors.map((f) => f.id)).toEqual([
      "RSK-crit",
      "RSK-high",
    ]);
  });

  it("treats an empty risk register as medium, not low", () => {
    // An empty analysis is a finding in itself: absence of identified risk is
    // not evidence of absence of risk.
    const assessment = assessRisk([]);
    expect(assessment.overallLevel).toBe("medium");
    expect(assessment.overallDepth).toBe("standard");
  });
});

describe("caseBudgetForDepth", () => {
  it("grows monotonically with depth", () => {
    const depths = ["smoke", "standard", "thorough", "exhaustive"] as const;
    const maxima = depths.map((d) => caseBudgetForDepth(d).max);
    expect(maxima).toEqual([...maxima].sort((a, b) => a - b));
  });
});
