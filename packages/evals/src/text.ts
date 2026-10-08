/**
 * Topic matching, shared by every comparison the instrument makes.
 *
 * Deliberately dumb: containment over a normalised string, plus explicit
 * `|` alternatives. No stemming and no fuzzy matching — a false match would
 * silently turn a real gap into a pass, which is the one failure mode a
 * measurement instrument must not have.
 */

/** Accent- and case-insensitive. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Does any entry in `haystack` mention this topic?
 *
 * A topic may list alternatives separated by `|` and matches when ANY appears.
 * That exists because plans are generated in English while a golden entry is
 * written in whatever language its author thinks in: `truncamiento|truncate`
 * is the honest way to say "either spelling counts".
 */
export function mentions(haystack: readonly string[], topic: string): boolean {
  const alternatives = topic
    .split("|")
    .map((part) => normalize(part).trim())
    .filter((part) => part.length > 0);
  if (alternatives.length === 0) return false;
  return haystack.some((entry) => {
    const text = normalize(entry);
    return alternatives.some((needle) => text.includes(needle));
  });
}

/**
 * Symmetric topic matching, for comparing two keyword lists.
 *
 * `mentions` has a haystack and a needle — right when one side is prose from
 * a plan. Between two expectations neither side is the haystack: one author
 * may write "truncate" where the other writes "truncation of existing data".
 * So containment is tried both ways.
 *
 * It does NOT close the morphology gap: "truncate" and "truncation" share no
 * containment in either direction and will not match. That is the known
 * weakness of this dimension, and the reason a topic may list `|`
 * alternatives — which is an author's explicit choice rather than a guess
 * made on their behalf.
 */
export function topicsOverlap(topic: string, others: readonly string[]): boolean {
  if (mentions(others, topic)) return true;
  return others.some((other) => mentions([topic], other));
}
