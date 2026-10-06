/**
 * Deterministic verification of a model-supplied trait.
 *
 * `hasOrderedInputDomain` drives the mandatory-BVA rule, and it is the single
 * highest-leverage trait in the engine: get it wrong and the most defect-dense
 * technique in testing is never applied. But it is only PARTLY a judgement —
 * a spec that says "maximum of 80 characters" has an ordered domain as a
 * matter of fact, not of opinion.
 *
 * So the engine checks it, the same way `buildStrategy` recomputes overall
 * risk instead of believing the caller's claim. Where the text carries a
 * numeric bound and the model said there was none, code wins.
 *
 * Calibrated for FALSE NEGATIVES over false positives: forcing BVA onto every
 * plan is its own failure mode, so a match needs a bound word next to either a
 * number or an ordered noun — never a bare mention of "quantity".
 */

/** Words that assert a limit, a threshold or an ordering. */
const BOUND = String.raw`max(?:imum)?|min(?:imum)?|limit(?:ed|s)?|at\s+most|at\s+least|no\s+more\s+than|no\s+fewer\s+than|up\s+to|exceed(?:s|ing)?|greater\s+than|less\s+than|longer\s+than|shorter\s+than|older\s+than|between|ranges?|cap(?:ped|s)?|threshold|strictly\s+positive|non-?negative|positive|negative|m[aá]ximo|m[ií]nimo|l[ií]mite|mayor\s+que|menor\s+que|entre`;

/** Nouns whose domain is inherently ordered. */
const ORDERED_NOUN = String.raw`characters?|caracteres|length|longitud|decimals?|decimales|precision|quantit(?:y|ies)|cantidad|amount|count|size|percent(?:age)?|porcentaje|price|cost|total|date|fecha|time|duration|age|weight|height|days?|d[ií]as`;

/**
 * Word boundaries are not cosmetic here. Without them `min` matches inside
 * "determine", `date` inside "updated" and `age` inside "message" — and a
 * discriminator that fires on "the message was updated" would force boundary
 * testing onto every plan, which is its own failure mode.
 */
const B = (alternation: string) => String.raw`\b(?:${alternation})\b`;

/**
 * A bound word within ~40 characters of a number or an ordered noun, in
 * either order. The window keeps "maximum of 80 characters" together while
 * refusing to pair a bound word with a noun from a different sentence.
 */
const NEAR = String.raw`[^.;\n]{0,40}?`;

const PATTERNS: readonly { name: string; re: RegExp }[] = [
  {
    name: "bound-near-number",
    re: new RegExp(`${B(BOUND)}${NEAR}\\d+`, "i"),
  },
  {
    name: "number-near-bound",
    re: new RegExp(`\\d+${NEAR}${B(BOUND)}`, "i"),
  },
  {
    name: "bound-near-ordered-noun",
    re: new RegExp(`${B(BOUND)}${NEAR}${B(ORDERED_NOUN)}`, "i"),
  },
  {
    // "Line quantity must be strictly positive" — the noun comes first.
    name: "ordered-noun-near-bound",
    re: new RegExp(`${B(ORDERED_NOUN)}${NEAR}${B(BOUND)}`, "i"),
  },
  {
    // `[\s-]*` so "6-decimal precision" counts.
    name: "number-near-ordered-noun",
    re: new RegExp(`\\d+[\\s-]*${B(ORDERED_NOUN)}`, "i"),
  },
  {
    name: "comparison-operator",
    re: /[<>]=?\s*\d+|\d+\s*[<>]=?/,
  },
];

export interface OrderedDomainEvidence {
  /** Which pattern fired — named so a report can explain itself. */
  pattern: string;
  /** The matching span, trimmed, for the audit trail. */
  excerpt: string;
  /** Index of the text that matched, so the caller can attribute it. */
  sourceIndex: number;
}

/**
 * Scans spec-derived text for a bound that implies an ordered input domain.
 * Returns the first match, or null when the text carries no such evidence.
 */
export function detectOrderedDomain(
  texts: readonly string[],
): OrderedDomainEvidence | null {
  for (const [sourceIndex, text] of texts.entries()) {
    if (!text) continue;
    for (const { name, re } of PATTERNS) {
      const match = re.exec(text);
      if (match) {
        return { pattern: name, excerpt: match[0].trim(), sourceIndex };
      }
    }
  }
  return null;
}

/** A trait the engine overrode, with the evidence that justified it. */
export interface TraitCorrection {
  trait: "hasOrderedInputDomain";
  from: boolean;
  to: boolean;
  reason: string;
}

/**
 * Returns the correction to apply, or null when the model's claim stands.
 *
 * Only ever corrects false → true. The reverse would be the engine claiming
 * an absence of evidence is evidence of absence, which these patterns cannot
 * support: plenty of ordered domains are described without a numeral.
 */
export function correctOrderedDomainTrait(
  claimed: boolean,
  texts: readonly string[],
): TraitCorrection | null {
  if (claimed) return null;
  const evidence = detectOrderedDomain(texts);
  if (!evidence) return null;
  return {
    trait: "hasOrderedInputDomain",
    from: false,
    to: true,
    reason: `el análisis declaró que no hay dominio ordenado, pero su propio texto contiene un límite numérico ("${evidence.excerpt}", patrón ${evidence.pattern}) — valores límite son obligatorios`,
  };
}
