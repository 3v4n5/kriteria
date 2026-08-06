/**
 * Minimal JSON path resolver — dot and bracket notation only.
 *
 *   data.items[0].id   ·   [2].name   ·   meta.total
 *
 * No dependency, no expression language: a path either addresses a value or
 * it does not. An assertion vocabulary that cannot compute is an assertion
 * vocabulary that cannot surprise you.
 */

export const MISSING = Symbol("missing");
export type Resolved = unknown | typeof MISSING;

export function resolveJsonPath(root: unknown, path: string): Resolved {
  const segments = parsePath(path);
  if (segments === null) return MISSING;

  let current: unknown = root;
  for (const segment of segments) {
    if (current === null || current === undefined) return MISSING;
    if (typeof segment === "number") {
      if (!Array.isArray(current) || segment >= current.length) return MISSING;
      current = current[segment];
      continue;
    }
    if (typeof current !== "object" || Array.isArray(current)) return MISSING;
    if (!(segment in (current as Record<string, unknown>))) return MISSING;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Returns null for a syntactically invalid path. */
function parsePath(path: string): (string | number)[] | null {
  const segments: (string | number)[] = [];
  for (const raw of path.split(".")) {
    if (raw === "" && segments.length > 0) return null;
    const match = raw.match(/^([^[\]]*)((?:\[\d+\])*)$/);
    if (!match) return null;
    const [, name, indexes] = match;
    if (name) segments.push(name);
    for (const index of indexes!.matchAll(/\[(\d+)\]/g)) {
      segments.push(Number.parseInt(index[1]!, 10));
    }
    if (!name && !indexes) return null;
  }
  return segments.length > 0 ? segments : null;
}
