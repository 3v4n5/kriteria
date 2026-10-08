/**
 * Minimal `.env` loader.
 *
 * Credentials have to live somewhere that is neither a shell profile (easy to
 * comment out and forget, as happened) nor a command-line flag (lands in
 * shell history and CI logs). A gitignored `.env` at the project root is the
 * remaining option, and this reads it with no dependency.
 *
 * Two rules that matter:
 *  - **The real environment always wins.** CI and one-off `VAR=x cmd` runs
 *    must never be silently overridden by a stale file on someone's disk.
 *  - **Values are never logged.** The caller is told which KEYS were loaded,
 *    never what they contain.
 */

import { existsSync, readFileSync } from "node:fs";

/** Returns the names of the variables it set — never their values. */
export function loadDotenv(path = ".env"): string[] {
  if (!existsSync(path)) return [];

  const loaded: string[] = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, "");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    // Already set: the real environment is authoritative.
    if (process.env[key] !== undefined) continue;

    let value = trimmed.slice(eq + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length > 1) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
    loaded.push(key);
  }
  return loaded;
}
