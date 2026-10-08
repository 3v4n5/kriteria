import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadDotenv } from "../src/dotenv.js";

let dir: string;
let saved: Record<string, string | undefined>;

const KEYS = ["KRITERIA_TEST_A", "KRITERIA_TEST_B", "KRITERIA_TEST_QUOTED"];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kriteria-dotenv-"));
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const write = (content: string): string => {
  const path = join(dir, ".env");
  writeFileSync(path, content, "utf8");
  return path;
};

describe("loadDotenv", () => {
  it("does nothing when there is no file", () => {
    expect(loadDotenv(join(dir, "missing"))).toEqual([]);
  });

  it("sets variables and reports their names, never their values", () => {
    const loaded = loadDotenv(write("KRITERIA_TEST_A=valor\nKRITERIA_TEST_B=otro\n"));
    expect(loaded).toEqual(["KRITERIA_TEST_A", "KRITERIA_TEST_B"]);
    expect(loaded.join()).not.toContain("valor");
    expect(process.env["KRITERIA_TEST_A"]).toBe("valor");
  });

  // CI and one-off `VAR=x cmd` runs must never be overridden by a stale file.
  it("never overrides a variable the real environment already set", () => {
    process.env["KRITERIA_TEST_A"] = "del shell";
    const loaded = loadDotenv(write("KRITERIA_TEST_A=del archivo\n"));
    expect(process.env["KRITERIA_TEST_A"]).toBe("del shell");
    expect(loaded).toEqual([]);
  });

  it("skips comments and blank lines", () => {
    const loaded = loadDotenv(write("# comentario\n\n  \nKRITERIA_TEST_A=x\n"));
    expect(loaded).toEqual(["KRITERIA_TEST_A"]);
  });

  it("tolerates a leading `export`, which people paste out of habit", () => {
    loadDotenv(write("export KRITERIA_TEST_A=x\n"));
    expect(process.env["KRITERIA_TEST_A"]).toBe("x");
  });

  it("strips surrounding quotes but keeps inner ones", () => {
    loadDotenv(write(`KRITERIA_TEST_QUOTED="a'b"\n`));
    expect(process.env["KRITERIA_TEST_QUOTED"]).toBe("a'b");
  });

  it("keeps `=` inside a value — API keys and URLs contain them", () => {
    loadDotenv(write("KRITERIA_TEST_A=sk-ant-a=b=c\n"));
    expect(process.env["KRITERIA_TEST_A"]).toBe("sk-ant-a=b=c");
  });

  it("ignores a malformed line rather than throwing mid-startup", () => {
    const loaded = loadDotenv(write("sin igual\n=sin nombre\n1MAL=x\nKRITERIA_TEST_A=ok\n"));
    expect(loaded).toEqual(["KRITERIA_TEST_A"]);
  });
});
