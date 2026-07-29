/**
 * Acceptance-criteria extraction from free-form descriptions.
 *
 * Finds ACs in the shapes teams actually write: an "Acceptance Criteria"
 * section with bullets, and/or Gherkin scenarios anywhere in the text. Each
 * criterion is tagged testable/non-testable with a deterministic heuristic;
 * non-testable ones are the analyst's cue to raise an ambiguity, not a
 * reason to drop them.
 */

import type { AcceptanceCriterion } from "@kriteria/core";

const SECTION_HEADING =
  /^#{0,6}\s*(?:\*\*)?\s*(acceptance criteria|criterios? de aceptaci[oó]n|ac\b)\s*:?\s*(?:\*\*)?\s*$/i;

const ANY_HEADING = /^#{1,6}\s+\S/;

const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+(.+)$/;

/**
 * Vague qualifiers that make a criterion unverifiable unless a measurable
 * anchor (number, unit, %, comparison) appears alongside them.
 */
const VAGUE_TERMS =
  /\b(smooth(ly)?|fast|quick(ly)?|easy|easily|user[- ]?friendly|intuitive|nice|properly|seamless(ly)?|responsive|adecuad[oa]|amigable|intuitiv[oa]|r[aá]pid[oa]|fluid[oa])\b/i;

const MEASURABLE_ANCHOR =
  /(\d|%|\b(less|more|greater|fewer|within|at (least|most)|menor|mayor|m[aá]ximo|m[ií]nimo)\b|[<>=≤≥])/i;

const VERIFIABLE_SHAPE =
  /\b(given|when|then|should|must|shall|displays?|shows?|returns?|rejects?|accepts?|creates?|updates?|deletes?|sends?|cannot|can(?!\s*be\s*nice)|debe(r[aá]n?)?|muestra|retorna|rechaza|acepta|crea|actualiza|elimina|env[ií]a)\b/i;

export function isTestable(text: string): boolean {
  if (VAGUE_TERMS.test(text) && !MEASURABLE_ANCHOR.test(text)) return false;
  return VERIFIABLE_SHAPE.test(text) || MEASURABLE_ANCHOR.test(text);
}

export function extractAcceptanceCriteria(
  description: string,
): AcceptanceCriterion[] {
  const texts: string[] = [];

  // 1) Bullets under an "Acceptance Criteria" heading, until the next heading.
  const lines = description.split(/\r?\n/);
  let inSection = false;
  for (const line of lines) {
    if (SECTION_HEADING.test(line.trim())) {
      inSection = true;
      continue;
    }
    if (inSection && ANY_HEADING.test(line)) inSection = false;
    if (!inSection) continue;

    const bullet = BULLET.exec(line);
    if (bullet?.[1]) texts.push(bullet[1].trim());
  }

  // 2) Gherkin scenarios anywhere — one criterion per scenario block.
  const gherkin =
    /(?:^|\n)\s*(?:scenario|escenario)\s*(?:outline)?\s*:\s*([^\n]+)((?:\n\s*(?:given|when|then|and|but|dado|cuando|entonces|y|pero)\b[^\n]*)+)/gi;
  for (const match of description.matchAll(gherkin)) {
    const title = match[1]!.trim();
    const steps = match[2]!
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
    texts.push(`${title} — ${steps}`);
  }

  // Dedupe while keeping order; assign stable ids.
  const seen = new Set<string>();
  const out: AcceptanceCriterion[] = [];
  for (const text of texts) {
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `AC-${out.length + 1}`, text, testable: isTestable(text) });
  }
  return out;
}
