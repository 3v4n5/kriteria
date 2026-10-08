import { describe, expect, it } from "vitest";
import {
  BaselineEntrySchema,
  compareExpectations,
  ExpectationSchema,
  summarizeAgreement,
  type Expectation,
} from "../src/index.js";

const E = (partial: Partial<Expectation>): Expectation =>
  ExpectationSchema.parse(partial);

const dim = (result: ReturnType<typeof compareExpectations>, name: string) =>
  result.dimensions.find((d) => d.dimension === name)!;

describe("BaselineEntrySchema", () => {
  it("requires the digest of the brief the model saw", () => {
    // Provenance is the isolation claim made auditable; without the digest a
    // stale baseline would be trusted silently.
    expect(() =>
      BaselineEntrySchema.parse({
        workItem: "T-1",
        source: { model: "claude-opus-5", generatedAt: "2026-01-01T00:00:00Z" },
        expect: {},
      }),
    ).toThrow();
  });

  it("rejects a digest that is not a sha256", () => {
    expect(() =>
      BaselineEntrySchema.parse({
        workItem: "T-1",
        source: {
          model: "claude-opus-5",
          generatedAt: "2026-01-01T00:00:00Z",
          briefSha256: "nope",
        },
        expect: {},
      }),
    ).toThrow();
  });

  it("accepts an entry with an entirely blank expectation", () => {
    // A model that honestly held no opinion must still be recordable.
    const entry = BaselineEntrySchema.parse({
      workItem: "T-1",
      source: {
        model: "claude-opus-5",
        generatedAt: "2026-01-01T00:00:00Z",
        briefSha256: "a".repeat(64),
      },
      expect: {},
    });
    expect(entry.expect.approach).toBeUndefined();
  });
});

describe("compareExpectations", () => {
  // THE rule that separates this from scorePlan: a plan always has a value,
  // but two expectations can both be silent. A dimension only one side
  // answered is an absence, not a disagreement, and must count as neither.
  it("scores nothing when only one side holds an opinion", () => {
    const result = compareExpectations("T-1", E({ depth: "thorough" }), E({}));
    expect(result.compared).toBe(0);
    expect(result.ratio).toBeNull();
    expect(dim(result, "profundidad").status).toBe("not-scored");
  });

  it("counts agreement only where both committed", () => {
    const result = compareExpectations(
      "T-1",
      E({ depth: "thorough", riskLevel: "high" }),
      E({ depth: "thorough" }),
    );
    expect(result.compared).toBe(1);
    expect(result.agreed).toBe(1);
    expect(dim(result, "nivel de riesgo").status).toBe("not-scored");
  });

  it("reports a real disagreement", () => {
    const result = compareExpectations(
      "T-1",
      E({ riskLevel: "high" }),
      E({ riskLevel: "medium" }),
    );
    expect(dim(result, "nivel de riesgo")).toMatchObject({ status: "mismatch" });
    expect(dim(result, "nivel de riesgo").detail).toContain("humano high");
  });

  describe("approach", () => {
    it("is a match when identical", () => {
      const r = compareExpectations("T-1", E({ approach: "analytical" }), E({ approach: "analytical" }));
      expect(dim(r, "enfoque").status).toBe("match");
    });

    it("is acceptable when either side listed the other as an alternative", () => {
      const r = compareExpectations(
        "T-1",
        E({ approach: "analytical", approachAlternatives: ["reactive"] }),
        E({ approach: "reactive" }),
      );
      expect(dim(r, "enfoque").status).toBe("acceptable");
    });

    it("is acceptable symmetrically — the model's alternatives count too", () => {
      const r = compareExpectations(
        "T-1",
        E({ approach: "reactive" }),
        E({ approach: "analytical", approachAlternatives: ["reactive"] }),
      );
      expect(dim(r, "enfoque").status).toBe("acceptable");
    });

    it("is a mismatch when neither accepts the other", () => {
      const r = compareExpectations("T-1", E({ approach: "analytical" }), E({ approach: "methodical" }));
      expect(dim(r, "enfoque").status).toBe("mismatch");
    });
  });

  describe("required sets", () => {
    it("agrees when the model demanded everything the human demanded", () => {
      const r = compareExpectations(
        "T-1",
        E({ mandatoryTechniques: ["boundary-value-analysis"] }),
        E({ mandatoryTechniques: ["boundary-value-analysis", "decision-table"] }),
      );
      // Extra demands from the model are not a disagreement about the human's.
      expect(dim(r, "técnicas obligatorias").status).toBe("match");
    });

    it("names what the model failed to demand", () => {
      const r = compareExpectations(
        "T-1",
        E({ mandatoryTechniques: ["boundary-value-analysis", "decision-table"] }),
        E({ mandatoryTechniques: ["decision-table"] }),
      );
      const d = dim(r, "técnicas obligatorias");
      expect(d.status).toBe("mismatch");
      expect(d.detail).toContain("boundary-value-analysis");
    });
  });

  describe("topics", () => {
    it("matches the human's topic against the model's list", () => {
      const r = compareExpectations(
        "T-1",
        E({ riskTopics: ["truncamiento|truncate"] }),
        E({ riskTopics: ["truncate the existing column", "rename"] }),
      );
      expect(dim(r, "riesgos identificados").status).toBe("match");
    });

    it("matches in the other direction too — neither list is the haystack", () => {
      // One author writes the short keyword, the other the long phrase.
      const r = compareExpectations(
        "T-1",
        E({ riskTopics: ["truncate the existing column"] }),
        E({ riskTopics: ["truncate"] }),
      );
      expect(dim(r, "riesgos identificados").status).toBe("match");
    });

    it("does NOT bridge morphology — a known weakness, not an oversight", () => {
      // "truncate" and "truncation" share no containment either way. Closing
      // this with stemming would risk false matches, which would turn a real
      // gap into a pass. Authors bridge it explicitly with `|` instead.
      const r = compareExpectations(
        "T-1",
        E({ riskTopics: ["truncate"] }),
        E({ riskTopics: ["truncation"] }),
      );
      expect(dim(r, "riesgos identificados").status).toBe("mismatch");
    });

    it("reports the topics the model never raised", () => {
      const r = compareExpectations(
        "T-1",
        E({ ambiguityTopics: ["prorrateo", "session token"] }),
        E({ ambiguityTopics: ["session token"] }),
      );
      const d = dim(r, "ambigüedades");
      expect(d.status).toBe("mismatch");
      expect(d.detail).toContain("prorrateo");
    });
  });

  describe("case volume", () => {
    // Comparing midpoints would invent a precision neither side claimed, so
    // two ranges agree exactly when they overlap.
    it("agrees when the ranges overlap", () => {
      const r = compareExpectations(
        "T-1",
        E({ minCases: 18, maxCases: 32 }),
        E({ minCases: 25, maxCases: 40 }),
      );
      expect(dim(r, "cantidad de casos").status).toBe("match");
    });

    it("disagrees when the ranges are disjoint", () => {
      const r = compareExpectations(
        "T-1",
        E({ minCases: 5, maxCases: 10 }),
        E({ minCases: 30, maxCases: 45 }),
      );
      expect(dim(r, "cantidad de casos").status).toBe("mismatch");
    });

    it("treats a half-open range as unbounded on that side", () => {
      const r = compareExpectations("T-1", E({ minCases: 20 }), E({ maxCases: 25 }));
      expect(dim(r, "cantidad de casos").status).toBe("match");
    });
  });

  it("never compares requireCleanAudit — it is a policy, not a judgement", () => {
    const r = compareExpectations("T-1", E({}), E({}));
    expect(r.dimensions.map((d) => d.dimension)).not.toContain("auditoría mecánica");
  });
});

describe("summarizeAgreement", () => {
  it("aggregates over tickets", () => {
    const a = compareExpectations("T-1", E({ depth: "thorough" }), E({ depth: "thorough" }));
    const b = compareExpectations("T-2", E({ depth: "smoke" }), E({ depth: "thorough" }));
    const summary = summarizeAgreement([a, b]);
    expect(summary).toMatchObject({ compared: 2, agreed: 1, ratio: 0.5 });
  });

  it("reports null rather than zero when nothing was ever comparable", () => {
    // Zero would read as total disagreement; null says the question is open.
    const summary = summarizeAgreement([compareExpectations("T-1", E({}), E({}))]);
    expect(summary.ratio).toBeNull();
  });
});
