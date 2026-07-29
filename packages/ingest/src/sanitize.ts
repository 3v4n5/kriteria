/**
 * Ingest-boundary sanitization — data minimization enforced in code.
 *
 * Everything that crosses from a source system into the pipeline passes
 * through here FIRST. PII and secrets are replaced with typed placeholders
 * before any content is stored, hashed, logged or sent to a model, so the
 * rest of the system never has to be trusted with them.
 *
 * Standards this implements at the boundary:
 *  - GDPR art. 5(1)(c) data minimization / art. 25 data protection by design
 *  - ISO/IEC 27001 A.8 (information classification & handling)
 *  - PCI-DSS req. 3 (PANs are never stored — redacted with Luhn validation)
 *
 * Deliberately deterministic (regex + checksums, no model): the guarantee
 * must hold even when a model misbehaves, and it must be cheap enough to run
 * on every byte of input. Redaction REPORTS counts, never values.
 */

export const REDACTION_KINDS = [
  "private-key",
  "jwt",
  "aws-access-key",
  "generic-secret",
  "payment-card",
  "government-id",
  "email",
  "phone",
] as const;

export type RedactionKind = (typeof REDACTION_KINDS)[number];

export interface RedactionReport {
  /** Occurrences per kind. Values are counts only — never the redacted text. */
  counts: Partial<Record<RedactionKind, number>>;
  total: number;
}

export interface SanitizedText {
  text: string;
  report: RedactionReport;
}

interface Rule {
  kind: RedactionKind;
  pattern: RegExp;
  /** Optional verifier to cut false positives (e.g. Luhn for cards). */
  verify?: (match: string) => boolean;
}

function luhnValid(raw: string): boolean {
  const digits = raw.replace(/[\s-]/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Order matters: structured secrets first (a JWT contains digit runs that
 * could half-match later rules), then financial, then contact data.
 */
const RULES: readonly Rule[] = [
  {
    kind: "private-key",
    pattern:
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    kind: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g,
  },
  {
    kind: "aws-access-key",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    // password=..., api_key: ..., "secret": "...", token=... — value captured
    // up to whitespace/quote. Case-insensitive, tolerant of separators.
    kind: "generic-secret",
    pattern:
      /\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|bearer)\b\s*[:=]\s*["']?[^\s"',;]{6,}/gi,
  },
  {
    kind: "payment-card",
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    verify: luhnValid,
  },
  {
    // US SSN shape; other national ids arrive in Fase 1 as configurable packs.
    kind: "government-id",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    kind: "email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    // Conservative on purpose: requires int'l prefix or separator structure so
    // issue ids and plain quantities don't false-positive. The lookbehind and
    // lookahead forbid matching INSIDE a longer digit run (e.g. a non-Luhn
    // 16-digit id must not be half-eaten as a phone number).
    kind: "phone",
    pattern:
      /(?<![\d.-])(?:(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)[ .-]?)?\d{3}[ .-]\d{3,4}[ .-]\d{3,4}|\+\d{9,15})(?![ .-]?\d)/g,
  },
];

const keepLast4 = (kind: RedactionKind): boolean => kind === "payment-card";

export function sanitizeText(input: string): SanitizedText {
  const counts: Partial<Record<RedactionKind, number>> = {};
  let text = input;

  for (const rule of RULES) {
    text = text.replace(rule.pattern, (match) => {
      if (rule.verify && !rule.verify(match)) return match;
      counts[rule.kind] = (counts[rule.kind] ?? 0) + 1;
      // Cards keep their last 4 (PCI-DSS-permitted) so testers can still tell
      // two test cards apart in a repro description.
      if (keepLast4(rule.kind)) {
        const digits = match.replace(/[\s-]/g, "");
        return `[REDACTED:${rule.kind}:…${digits.slice(-4)}]`;
      }
      return `[REDACTED:${rule.kind}]`;
    });
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { text, report: { counts, total } };
}

/** Merge reports from several sanitized fields into one basis-level report. */
export function mergeReports(reports: RedactionReport[]): RedactionReport {
  const counts: Partial<Record<RedactionKind, number>> = {};
  for (const r of reports) {
    for (const [kind, n] of Object.entries(r.counts)) {
      counts[kind as RedactionKind] = (counts[kind as RedactionKind] ?? 0) + n;
    }
  }
  return { counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}
