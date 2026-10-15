import { describe, expect, it } from "vitest";
import {
  GoldenEntrySchema,
  scorePlan,
  summarizeSuite,
  type ActualPlan,
  type GoldenEntry,
} from "../src/index.js";

const actual: ActualPlan = {
  workItem: "T-1",
  approach: "analytical",
  supportingApproaches: ["regression-averse"],
  depth: "thorough",
  riskLevel: "high",
  levels: ["system", "acceptance"],
  types: ["functional", "regression", "security"],
  mandatoryTechniques: ["boundary-value-analysis", "decision-table"],
  ambiguities: [
    "¿El umbral de 100 es inclusivo?",
    "¿AddressAutocomplete rota el session token tras la selección?",
  ],
  risks: ["Descuento aplicado dos veces en el límite", "Componente compartido sin regresión"],
  caseCount: 12,
  auditFindingCount: 0,
};

const golden = (expect_: Partial<GoldenEntry["expect"]>): GoldenEntry =>
  GoldenEntrySchema.parse({ workItem: "T-1", expect: expect_ });

describe("scorePlan", () => {
  it("scores only structural cleanliness when no judgement was recorded", () => {
    // requireCleanAudit defaults to true, so even an empty entry checks that
    // the plan has no structural gaps. Everything else stays unclaimed.
    const result = scorePlan(golden({}), actual);
    expect(result.scored).toBe(1);
    expect(result.dimensions.filter((d) => d.status === "not-scored")).toHaveLength(
      result.dimensions.length - 1,
    );
  });

  it("never counts an unrecorded expectation as a pass", () => {
    // Depth is the only judgement committed to; with the default audit check
    // the denominator is 2 — not the ten dimensions the scorer knows about.
    const result = scorePlan(golden({ depth: "thorough" }), actual);
    expect(result.scored).toBe(2);
    expect(result.matched).toBe(2);
    expect(result.dimensions.length).toBeGreaterThan(result.scored);
  });

  describe("approach", () => {
    it("matches the expected primary", () => {
      const d = scorePlan(golden({ approach: "analytical" }), actual).dimensions[0]!;
      expect(d.status).toBe("match");
    });

    it("accepts a declared alternative without calling it a match", () => {
      const d = scorePlan(
        golden({ approach: "methodical", approachAlternatives: ["analytical"] }),
        actual,
      ).dimensions[0]!;
      expect(d.status).toBe("acceptable");
      expect(d.detail).toContain("alternativa");
    });

    it("softens to acceptable when the expected approach landed as supporting", () => {
      const d = scorePlan(golden({ approach: "regression-averse" }), actual).dimensions[0]!;
      expect(d.status).toBe("acceptable");
      expect(d.detail).toContain("apoyo");
    });

    it("reports a real disagreement as a mismatch", () => {
      const d = scorePlan(golden({ approach: "reactive" }), actual).dimensions[0]!;
      expect(d.status).toBe("mismatch");
    });
  });

  describe("required sets", () => {
    it("passes when every required item is present, ignoring extras", () => {
      const d = scorePlan(golden({ types: ["functional", "security"] }), actual).dimensions.find(
        (x) => x.dimension === "tipos",
      )!;
      expect(d.status).toBe("match");
    });

    it("names exactly what is missing", () => {
      const d = scorePlan(
        golden({ types: ["functional", "performance", "accessibility"] }),
        actual,
      ).dimensions.find((x) => x.dimension === "tipos")!;
      expect(d.status).toBe("mismatch");
      expect(d.detail).toContain("performance");
      expect(d.detail).toContain("accessibility");
      expect(d.detail).not.toContain("functional");
    });
  });

  describe("topic matching", () => {
    it("finds a topic regardless of case and accents", () => {
      const d = scorePlan(
        golden({ ambiguityTopics: ["SESSION TOKEN", "umbral"] }),
        actual,
      ).dimensions.find((x) => x.dimension === "ambigüedades")!;
      expect(d.status).toBe("match");
    });

    it("reports the topics the plan never raised", () => {
      const d = scorePlan(
        golden({ ambiguityTopics: ["prorrateo", "moneda"] }),
        actual,
      ).dimensions.find((x) => x.dimension === "ambigüedades")!;
      expect(d.status).toBe("mismatch");
      expect(d.detail).toContain("prorrateo");
      expect(d.detail).toContain("moneda");
    });

    it("matches risks written with different accents than the golden", () => {
      const d = scorePlan(
        golden({ riskTopics: ["limite"] }), // plan says "límite"
        actual,
      ).dimensions.find((x) => x.dimension === "riesgos identificados")!;
      expect(d.status).toBe("match");
    });
  });

  describe("case volume", () => {
    it("accepts a count inside the range", () => {
      const d = scorePlan(golden({ minCases: 8, maxCases: 20 }), actual).dimensions.find(
        (x) => x.dimension === "cantidad de casos",
      )!;
      expect(d.status).toBe("match");
    });

    it("rejects too few and too many", () => {
      for (const range of [{ minCases: 20 }, { maxCases: 5 }]) {
        const d = scorePlan(golden(range), actual).dimensions.find(
          (x) => x.dimension === "cantidad de casos",
        )!;
        expect(d.status).toBe("mismatch");
      }
    });
  });

  describe("audit cleanliness", () => {
    it("requires a clean audit by default", () => {
      const d = scorePlan(golden({}), { ...actual, auditFindingCount: 3 }).dimensions.find(
        (x) => x.dimension === "auditoría mecánica",
      )!;
      expect(d.status).toBe("mismatch");
    });

    it("treats a missing audit as a gap, and says so in its own words", () => {
      const d = scorePlan(golden({}), { ...actual, auditFindingCount: null }).dimensions.find(
        (x) => x.dimension === "auditoría mecánica",
      )!;
      expect(d.status).toBe("mismatch");
      expect(d.detail).toContain("no trae auditoría");
    });
  });
});

describe("summarizeSuite", () => {
  const scored = (verdict: boolean | null, approach: "analytical" | "reactive") =>
    scorePlan(
      GoldenEntrySchema.parse({
        workItem: "T",
        expect: { approach },
        humanVerdict: { wouldHaveDoneThis: verdict, notes: "" },
      }),
      actual,
    );

  it("aggregates the mechanical ratio across items", () => {
    const summary = summarizeSuite([scored(null, "analytical"), scored(null, "reactive")]);
    // One dimension right, one wrong, plus two clean audits → 3 of 4.
    expect(summary.dimensionRatio).toBe(0.75);
  });

  it("tracks the human verdict separately from the score", () => {
    const summary = summarizeSuite([
      scored(true, "analytical"),
      scored(false, "analytical"),
      scored(null, "analytical"),
    ]);
    expect(summary).toMatchObject({
      humanApproved: 1,
      humanReviewed: 2,
      humanPending: 1,
    });
  });
});

describe("an expectation that cannot measure the system", () => {
  /**
   * `agrees` decides whether the item scores 2/2 or 1/2, so every assertion
   * below moves the ratio if the item is counted. A disagreeing item that
   * scores the same as the agreeing one would make these tests pass with the
   * exclusion deleted.
   */
  const entry = (
    workItem: string,
    expectProvenance: string,
    { agrees = false, verdict = null }: { agrees?: boolean; verdict?: boolean | null } = {},
  ) =>
    scorePlan(
      GoldenEntrySchema.parse({
        workItem,
        expectProvenance,
        expect: { approach: agrees ? "analytical" : "reactive" },
        humanVerdict: { wouldHaveDoneThis: verdict, notes: "" },
      }),
      actual,
    );

  it("counts a blind expectation, which is the only kind that measures", () => {
    const summary = summarizeSuite([entry("T-1", "blind-human")]);
    // Approach wrong, audit clean → 1 of 2.
    expect(summary.dimensionRatio).toBe(0.5);
    expect(summary.excludedFromRatio).toEqual([]);
  });

  // A ratio whose denominator is invisible is how "100%" over a single audit
  // check comes to look like a measured corpus.
  it("reports the denominator the ratio was computed from", () => {
    const summary = summarizeSuite([
      entry("T-1", "blind-human"),
      entry("T-2", "model", { agrees: true }),
    ]);
    expect(summary).toMatchObject({ matched: 1, scored: 2, itemsInRatio: 1 });
  });

  it("defaults to blind, because entries written before this field predate any plan", () => {
    const parsed = GoldenEntrySchema.parse({ workItem: "T-1", expect: {} });
    expect(parsed.expectProvenance).toBe("blind-human");
  });

  // A model-derived expectation scored against the system is the system
  // grading its own homework, whatever the percentage says.
  it("leaves a model-derived expectation out of the ratio", () => {
    const summary = summarizeSuite([
      entry("T-1", "blind-human"),
      entry("T-2", "model", { agrees: true }),
    ]);
    // The blind item alone: 1 of 2. Counting the agreeing model entry would
    // flatter it to 3 of 4.
    expect(summary.dimensionRatio).toBe(0.5);
    expect(summary.excludedFromRatio).toEqual([
      { workItem: "T-2", provenance: "model" },
    ]);
  });

  it("leaves out an expectation written while the plan already existed", () => {
    const summary = summarizeSuite([entry("T-1", "informed")]);
    expect(summary.dimensionRatio).toBeNull();
    expect(summary.excludedFromRatio).toEqual([
      { workItem: "T-1", provenance: "informed" },
    ]);
  });

  // The verdict is answered WITH the plan in view on purpose, so nothing
  // about how the expectation was written can disqualify it.
  it("still counts the human verdict of every excluded item", () => {
    const summary = summarizeSuite([
      entry("T-1", "model", { verdict: true }),
      entry("T-2", "informed", { verdict: false }),
    ]);
    expect(summary).toMatchObject({ humanApproved: 1, humanReviewed: 2, humanPending: 0 });
  });

  // Dropping them silently is how a label stops describing its number.
  it("keeps showing the dimensions of an excluded item", () => {
    const summary = summarizeSuite([entry("T-1", "model")]);
    expect(summary.results[0]!.dimensions.find((d) => d.dimension === "enfoque")).toMatchObject({
      status: "mismatch",
    });
  });
});

describe("GoldenEntrySchema", () => {
  it("accepts a minimal entry and defaults the verdict to pending", () => {
    const entry = GoldenEntrySchema.parse({ workItem: "T-1", expect: {} });
    expect(entry.humanVerdict.wouldHaveDoneThis).toBeNull();
    expect(entry.expect.requireCleanAudit).toBe(true);
  });

  it("accepts the shipped template, whose fields are all blank", () => {
    // A blank YAML field parses as null. If the schema rejected that, the
    // template could not be used as delivered — the one thing it must do.
    const entry = GoldenEntrySchema.parse({
      workItem: "TICKET-123",
      rationale: null,
      expect: {
        approach: null,
        approachAlternatives: [],
        depth: null,
        riskLevel: null,
        levels: [],
        types: [],
        mandatoryTechniques: [],
        ambiguityTopics: [],
        riskTopics: [],
        minCases: null,
        maxCases: null,
        requireCleanAudit: true,
      },
      humanVerdict: { wouldHaveDoneThis: null, reviewedBy: null, notes: "" },
    });
    expect(entry.expect.approach).toBeUndefined();
    expect(entry.expect.levels).toEqual([]);
    expect(entry.humanVerdict.reviewedBy).toBeUndefined();
  });

  it("rejects a vocabulary typo instead of silently ignoring it", () => {
    const parsed = GoldenEntrySchema.safeParse({
      workItem: "T-1",
      expect: { approach: "analitico" },
    });
    expect(parsed.success).toBe(false);
  });
});

describe("topic matching across languages", () => {
  // The plan is generated in English; a golden entry is written in whatever
  // language its author thinks in. Without alternatives a Spanish topic can
  // never match an English risk description, and a risk the plan DID identify
  // is reported as a gap — a false failure in the measurement instrument.
  const withRisk = (description: string): ActualPlan => ({
    ...actual,
    risks: [description],
  });

  const riskDimension = (entry: GoldenEntry, plan: ActualPlan) =>
    scorePlan(entry, plan).dimensions.find((d) => d.dimension === "riesgos identificados")!;

  it("matches when any `|` alternative appears in the plan", () => {
    const d = riskDimension(
      golden({ riskTopics: ["truncamiento|truncate"] }),
      withRisk("lowering the column could truncate existing vendor data"),
    );
    expect(d.status).toBe("match");
  });

  it("still reports a gap when no alternative appears", () => {
    const d = riskDimension(
      golden({ riskTopics: ["truncamiento|truncate"] }),
      withRisk("timezone drift on the default date"),
    );
    expect(d.status).toBe("mismatch");
  });

  it("does not let an empty alternative match everything", () => {
    // A blank topic matching every plan would turn the instrument into a
    // rubber stamp, so it has to fail closed.
    const d = riskDimension(golden({ riskTopics: ["|"] }), withRisk("cualquier cosa"));
    expect(d.status).toBe("mismatch");
  });
});

describe("blocking expectations", () => {
  // On a ticket too vague to design against, the honest expectation is that
  // the plan produces NO cases and a list of questions. Forbidding zero would
  // make the instrument unable to record the judgement that bucket exists for.
  it("accepts zero as a case expectation", () => {
    const entry = GoldenEntrySchema.parse({
      workItem: "T-1",
      expect: { minCases: 0, maxCases: 0 },
    });
    expect(entry.expect.maxCases).toBe(0);
  });

  it("scores a plan that designed cases anyway as a mismatch", () => {
    const d = scorePlan(golden({ minCases: 0, maxCases: 0 }), actual).dimensions.find(
      (x) => x.dimension === "cantidad de casos",
    )!;
    expect(d.status).toBe("mismatch");
    expect(d.detail).toContain("12 casos");
  });

  it("scores a plan that correctly designed none as a match", () => {
    const d = scorePlan(
      golden({ minCases: 0, maxCases: 0 }),
      { ...actual, caseCount: 0 },
    ).dimensions.find((x) => x.dimension === "cantidad de casos")!;
    expect(d.status).toBe("match");
  });
});
