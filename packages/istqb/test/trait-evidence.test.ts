import { describe, expect, it } from "vitest";
import { correctOrderedDomainTrait, detectOrderedDomain } from "../src/index.js";

describe("detectOrderedDomain", () => {
  // Real text from the ticket that exposed this gap: the engine never applied
  // boundary-value analysis to a field whose whole requirement is a numeric cap.
  it.each([
    ["The Supplier Name field must enforce a maximum of 80 characters"],
    ["The Notes field has no maximum character limit defined or enforced"],
    ["Line quantity must be strictly positive"],
    ["unit cost is computed at 6-decimal precision"],
    ["Cart total >= 100 gets 10% off"],
    ["the value must not exceed 255"],
    ["el nombre admite un máximo de 80 caracteres"],
    ["expires between 30 and 90 days"],
  ])("finds the bound in %j", (text) => {
    expect(detectOrderedDomain([text])).not.toBeNull();
  });

  // Forcing BVA onto every plan is its own failure mode, so the discriminator
  // has to stay quiet on text that genuinely carries no ordering.
  it.each([
    ["When editing a purchase order, the Order Information section is not displayed"],
    ["Rename Supplier Name to Purchase Order Name across the module"],
    ["The expenses and adjustments section is not visible in the current UI"],
    ["The Vendor field must be implemented as a select, not a free-text input"],
    ["Each line should display the product name and its associated variants"],
    ["Clarification needed on which task this was added to"],
  ])("stays silent on %j", (text) => {
    expect(detectOrderedDomain([text])).toBeNull();
  });

  // Substring matching without word boundaries would fire on all of these:
  // "min" inside determine, "date" inside updated, "age" inside message,
  // "count" inside account, "cap" inside capacity. A discriminator that fires
  // on ordinary prose forces boundary testing onto every plan.
  it.each([
    ["the message was updated by the account owner"],
    ["determine whether the package is available"],
    ["increase capacity and validate the candidate"],
    ["sometimes the usage estimate is stale"],
  ])("is not fooled by a bound word hiding inside another word: %j", (text) => {
    expect(detectOrderedDomain([text])).toBeNull();
  });

  it("attributes the match to the text it came from", () => {
    const evidence = detectOrderedDomain([
      "Renombrar la etiqueta del campo",
      "el campo acepta como máximo 80 caracteres",
    ]);
    expect(evidence?.sourceIndex).toBe(1);
    expect(evidence?.excerpt).toContain("80");
  });

  it("ignores empty entries rather than matching them", () => {
    expect(detectOrderedDomain(["", "   "])).toBeNull();
  });
});

describe("correctOrderedDomainTrait", () => {
  it("overrides a false claim the text contradicts", () => {
    const correction = correctOrderedDomainTrait(false, [
      "must enforce a maximum of 80 characters",
    ]);
    expect(correction).toMatchObject({
      trait: "hasOrderedInputDomain",
      from: false,
      to: true,
    });
    expect(correction?.reason).toContain("80");
  });

  it("leaves a true claim alone — it needs no evidence to stand", () => {
    expect(correctOrderedDomainTrait(true, ["maximum of 80 characters"])).toBeNull();
  });

  it("never corrects true → false: absent evidence is not evidence of absence", () => {
    // Plenty of ordered domains are described without a numeral, so the engine
    // must not downgrade the model's claim just because no pattern fired.
    expect(correctOrderedDomainTrait(true, ["rename the label"])).toBeNull();
  });

  it("leaves a false claim standing when the text really has no bound", () => {
    expect(correctOrderedDomainTrait(false, ["rename the label"])).toBeNull();
  });
});
