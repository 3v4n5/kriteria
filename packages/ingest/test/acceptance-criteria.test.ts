import { describe, expect, it } from "vitest";
import {
  extractAcceptanceCriteria,
  isTestable,
} from "../src/acceptance-criteria.js";

describe("extractAcceptanceCriteria", () => {
  it("collects bullets under an Acceptance Criteria heading until the next heading", () => {
    const description = [
      "# Context",
      "Some narrative",
      "## Acceptance Criteria",
      "- Cart >= 100 gets 10% off",
      "- Discount shows on the summary line",
      "## Out of scope",
      "- Gift cards",
    ].join("\n");

    const acs = extractAcceptanceCriteria(description);
    expect(acs.map((a) => a.text)).toEqual([
      "Cart >= 100 gets 10% off",
      "Discount shows on the summary line",
    ]);
    expect(acs.map((a) => a.id)).toEqual(["AC-1", "AC-2"]);
  });

  it("supports the Spanish heading", () => {
    const acs = extractAcceptanceCriteria(
      "## Criterios de aceptación\n- El total debe incluir impuestos",
    );
    expect(acs).toHaveLength(1);
  });

  it("extracts Gherkin scenarios anywhere in the text", () => {
    const description = [
      "Details here.",
      "Scenario: boundary discount",
      "Given a cart of 99.99",
      "When I check out",
      "Then no discount is applied",
    ].join("\n");

    const acs = extractAcceptanceCriteria(description);
    expect(acs).toHaveLength(1);
    expect(acs[0]!.text).toContain("boundary discount");
    expect(acs[0]!.testable).toBe(true);
  });

  it("dedupes repeated criteria and keeps ids sequential", () => {
    const acs = extractAcceptanceCriteria(
      "## AC\n- The API returns 201\n- the api returns 201",
    );
    expect(acs).toHaveLength(1);
  });

  it("returns empty for a description with no recognizable ACs", () => {
    expect(extractAcceptanceCriteria("Just prose, nothing structured.")).toEqual(
      [],
    );
  });
});

describe("isTestable", () => {
  it("accepts measurable and verifiable statements", () => {
    expect(isTestable("Response time is under 200ms")).toBe(true);
    expect(isTestable("The form rejects an empty email")).toBe(true);
    expect(isTestable("El sistema debe mostrar el saldo")).toBe(true);
  });

  it("rejects vague statements without a measurable anchor", () => {
    expect(isTestable("The experience should feel smooth")).toBe(false);
    expect(isTestable("Loading must be fast")).toBe(false);
    expect(isTestable("La navegación debe ser fluida")).toBe(false);
  });

  it("accepts vague words when anchored to a number", () => {
    expect(isTestable("Fast: page loads in less than 2 seconds")).toBe(true);
  });
});
