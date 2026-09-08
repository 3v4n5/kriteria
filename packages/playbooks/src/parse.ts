/**
 * Frontmatter parsing, strict on purpose.
 *
 * A playbook with a malformed header is a build-time error, not a warning: it
 * would otherwise be silently skipped and a technique would lose its procedure
 * without anyone noticing until the plan quality dropped.
 */

import { createHash } from "node:crypto";
import { TEST_TECHNIQUES, type TestTechnique } from "@kriteria/istqb";
import { parse as parseYaml } from "yaml";
import type { Playbook } from "./types.js";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export class PlaybookFormatError extends Error {
  constructor(source: string, detail: string) {
    super(`playbook inválido (${source}): ${detail}`);
    this.name = "PlaybookFormatError";
  }
}

const TECHNIQUES = new Set<string>(TEST_TECHNIQUES);

export function parsePlaybook(source: string, raw: string): Playbook {
  const match = FRONTMATTER.exec(raw);
  if (!match) {
    throw new PlaybookFormatError(source, "falta el bloque frontmatter --- … ---");
  }

  let front: unknown;
  try {
    front = parseYaml(match[1]!);
  } catch (error) {
    throw new PlaybookFormatError(source, `frontmatter no es YAML: ${(error as Error).message}`);
  }
  if (front === null || typeof front !== "object") {
    throw new PlaybookFormatError(source, "el frontmatter debe ser un mapa");
  }
  const f = front as Record<string, unknown>;

  const id = requireString(source, f, "id");
  const technique = requireString(source, f, "technique");
  if (!TECHNIQUES.has(technique)) {
    throw new PlaybookFormatError(
      source,
      `technique "${technique}" no pertenece al vocabulario ISTQB del motor`,
    );
  }

  const version = f["version"];
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new PlaybookFormatError(source, "version debe ser un entero >= 1");
  }

  const body = raw.slice(match[0].length).trim();
  if (body.length === 0) {
    throw new PlaybookFormatError(source, "el cuerpo está vacío");
  }

  return {
    id,
    technique: technique as TestTechnique,
    version,
    title: requireString(source, f, "title"),
    summary: requireString(source, f, "summary"),
    body,
    sha256: createHash("sha256").update(body, "utf8").digest("hex"),
  };
}

function requireString(
  source: string,
  front: Record<string, unknown>,
  key: string,
): string {
  const value = front[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PlaybookFormatError(source, `falta el campo "${key}"`);
  }
  return value.trim();
}
