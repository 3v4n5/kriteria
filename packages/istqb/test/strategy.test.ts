import { describe, expect, it } from "vitest";
import { buildStrategy, type StrategyInput } from "../src/index.js";

const input = (overrides: Partial<StrategyInput> = {}): StrategyInput => ({
  context: {
    changeType: "enhancement",
    specQuality: 0.7,
    hasStateModel: false,
    hasApiContract: false,
    hasBusinessRuleMatrix: false,
    regulatory: [],
    standards: [],
    touchesSharedComponent: false,
    hasRegressionSuite: false,
    automationMaturity: "partial",
    timePressure: "medium",
    domainExpertAvailable: true,
    historicalDefectDensity: 0.2,
    overallRisk: "low",
  },
  system: {
    hasUserFacingUi: true,
    handlesSensitiveData: false,
    performanceSensitive: false,
    multiPlatform: false,
    crossesServiceBoundary: false,
    codeAccess: true,
  },
  risks: [
    {
      id: "RSK-01",
      description: "Discount is applied twice on renewal",
      area: "billing",
      likelihood: 3,
      impact: 4,
    },
  ],
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
  ...overrides,
});

describe("buildStrategy", () => {
  it("recomputes overall risk from the register and ignores the caller's claim", () => {
    // The caller says "low" while registering a 3x4 factor. The register wins.
    const strategy = buildStrategy(input());
    expect(strategy.risk.overallLevel).toBe("high");
    expect(strategy.depth).toBe("thorough");
  });

  it("selects techniques per level rather than once for the whole plan", () => {
    const strategy = buildStrategy(input());
    const levels = strategy.techniquesByLevel.map((t) => t.level);

    expect(levels).toContain("component");
    expect(levels).toContain("system");

    const component = strategy.techniquesByLevel.find((t) => t.level === "component")!;
    const system = strategy.techniquesByLevel.find((t) => t.level === "system")!;

    expect(component.techniques.map((t) => t.technique)).toContain("branch-coverage");
    expect(system.techniques.map((t) => t.technique)).not.toContain("branch-coverage");
    expect(system.techniques.map((t) => t.technique)).toContain("use-case");
  });

  it("lists every mandatory technique in the exit criteria", () => {
    const strategy = buildStrategy(input());
    const mandatory = strategy.techniquesByLevel
      .flatMap((l) => l.techniques)
      .filter((t) => t.mandatory)
      .map((t) => t.technique);

    expect(mandatory.length).toBeGreaterThan(0);
    const exit = strategy.exitCriteria.join(" ");
    for (const technique of new Set(mandatory)) {
      expect(exit).toContain(technique);
    }
  });

  it("raises a blocking entry criterion when the spec is weak and no expert exists", () => {
    const strategy = buildStrategy(
      input({
        context: {
          ...input().context,
          specQuality: 0.2,
          domainExpertAvailable: false,
        },
      }),
    );
    expect(strategy.entryCriteria.some((c) => c.startsWith("BLOCKER"))).toBe(true);
  });

  it("adds security scope and exit criteria when sensitive data is handled", () => {
    const base = input();
    const strategy = buildStrategy({
      ...base,
      system: { ...base.system, handlesSensitiveData: true },
    });

    expect(strategy.types.map((t) => t.value)).toContain("security");
    expect(strategy.exitCriteria.join(" ")).toContain("security finding");
  });

  it("puts a regulated change under process-compliant with compliance criteria", () => {
    const base = input();
    const strategy = buildStrategy({
      ...base,
      context: { ...base.context, regulatory: ["HIPAA"] },
    });

    expect(strategy.approach.primary.approach).toBe("process-compliant");
    expect(strategy.entryCriteria.join(" ")).toContain("HIPAA");
    expect(strategy.exitCriteria.join(" ")).toContain("Compliance evidence");
  });

  it("scales the case budget with the computed depth", () => {
    const low = buildStrategy({
      ...input(),
      risks: [
        {
          id: "RSK-min",
          description: "Label typo",
          area: "ui",
          likelihood: 1,
          impact: 1,
        },
      ],
    });
    const high = buildStrategy(input());

    expect(low.depth).toBe("smoke");
    expect(high.caseBudgetPerArea.max).toBeGreaterThan(low.caseBudgetPerArea.max);
  });

  it("requires business sign-off for a data migration", () => {
    const base = input();
    const strategy = buildStrategy({
      ...base,
      context: { ...base.context, changeType: "data-migration" },
    });

    expect(strategy.levels.map((l) => l.value)).toContain("acceptance");
    expect(strategy.types.map((t) => t.value)).toContain("reliability");
  });
});
