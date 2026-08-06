import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TestRunSchema } from "@kriteria/core";
import { parse as fromYaml, stringify as toYaml } from "yaml";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCommand, type Ask } from "../src/run.js";

/** Feeds scripted answers; throws if the runner asks more than expected. */
function scriptedAsk(answers: string[]): Ask {
  const queue = [...answers];
  return async () => {
    if (queue.length === 0) throw new Error("runner asked more questions than scripted");
    return queue.shift()!;
  };
}

const PLAN = {
  workItem: "DEMO-1",
  strategy: {
    approach: "analytical",
    depth: "thorough",
    techniquesByLevel: [
      { level: "system", techniques: [{ technique: "boundary-value-analysis", mandatory: true }] },
    ],
  },
  exitCriteria: [
    "Every planned test case has been executed and its result recorded with evidence",
    "Each risk factor rated high or critical is covered by at least one passing test",
    "Branch coverage on the changed units is at least 90%",
  ],
  riskRegister: {
    factors: [{ id: "RSK-1", description: "riesgo", area: "FEA-1", likelihood: 3, impact: 4 }],
  },
};

const testCase = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  title: `caso ${id}`,
  level: "system",
  type: "functional",
  technique: "boundary-value-analysis",
  priority: "high",
  covers: ["FEA-1"],
  mitigates: ["RSK-1"],
  verifies: ["AC-1"],
  preconditions: [],
  dataRequirements: [],
  steps: [{ action: "hacer algo", expected: "algo pasa" }],
  needsHuman: false,
  execution: { mode: "guided-manual" },
  ...overrides,
});

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kriteria-run-"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

function writeFixture(cases: unknown[]): void {
  writeFileSync(join(dir, "testplan.yml"), toYaml(PLAN), "utf8");
  writeFileSync(join(dir, "testcases.yml"), toYaml({ cases, exclusions: [] }), "utf8");
}

function readRun() {
  return TestRunSchema.parse(fromYaml(readFileSync(join(dir, "testrun.yml"), "utf8")));
}

describe("runCommand", () => {
  it("records a passing run and writes both artifacts", async () => {
    writeFixture([testCase("TC-1")]);

    await runCommand({
      dir,
      environment: "staging",
      // step verdict, then closing evidence path
      ask: scriptedAsk(["p", ""]),
    });

    const run = readRun();
    expect(run.results[0]).toMatchObject({ caseId: "TC-1", status: "pass" });
    expect(run.summary).toMatchObject({ total: 1, pass: 1, fail: 0 });
    expect(readFileSync(join(dir, "closure.md"), "utf8")).toContain("DEMO-1");
  });

  it("skips cases the router assigned to autonomous modes", async () => {
    writeFixture([
      testCase("TC-1"),
      testCase("TC-2", { execution: { mode: "auto-api" } }),
    ]);

    await runCommand({ dir, environment: "staging", ask: scriptedAsk(["p", ""]) });

    // Only the human-mode case appears — TC-2 belongs to the autonomous runner.
    expect(readRun().results.map((r) => r.caseId)).toEqual(["TC-1"]);
  });

  it("captures a failure with its actual result and raises a defect", async () => {
    writeFixture([testCase("TC-1")]);

    await runCommand({
      dir,
      environment: "staging",
      // fail → actual → evidence path → severity
      ask: scriptedAsk(["f", "el total quedó en 100", "", "2"]),
    });

    const run = readRun();
    expect(run.results[0]!.status).toBe("fail");
    expect(run.results[0]!.steps[0]).toMatchObject({
      status: "fail",
      actual: "el total quedó en 100",
    });
    expect(run.defects[0]).toMatchObject({ id: "DEF-1", severity: 2, caseId: "TC-1" });
    expect(run.verdict).toBe("failed");
  });

  it("records unreached cases as not-run with a reason — never inferred as passed", async () => {
    writeFixture([testCase("TC-1"), testCase("TC-2", { priority: "low" })]);

    // Quit after the first case.
    await runCommand({ dir, environment: "staging", ask: scriptedAsk(["q"]) });

    const run = readRun();
    const notRun = run.results.filter((r) => r.status === "not-run");
    expect(notRun).toHaveLength(2);
    expect(notRun.every((r) => Boolean(r.reason))).toBe(true);
    expect(run.verdict).toBe("incomplete");
  });

  it("treats exhausted input as save-and-exit, not a crash", async () => {
    writeFixture([testCase("TC-1")]);

    await expect(
      runCommand({
        dir,
        environment: "staging",
        ask: async () => {
          const { EndOfInput } = await import("../src/run.js");
          throw new EndOfInput();
        },
      }),
    ).resolves.toBeUndefined();

    expect(readRun().results[0]!.status).toBe("not-run");
  });

  it("resumes an interrupted session instead of re-running finished cases", async () => {
    writeFixture([testCase("TC-1"), testCase("TC-2", { priority: "low" })]);
    // Real evidence file so the evidence exit criterion can actually be met.
    writeFileSync(join(dir, "captura.png"), "fake-png-bytes", "utf8");

    // First session: run TC-1 (higher priority), then quit.
    await runCommand({
      dir,
      environment: "staging",
      ask: scriptedAsk(["p", "captura.png", "q"]),
    });
    expect(readRun().results.find((r) => r.caseId === "TC-1")!.status).toBe("pass");

    // Second session: the scripted asker allows exactly one case's worth of
    // answers, so re-running TC-1 would throw "more questions than scripted".
    await runCommand({
      dir,
      environment: "staging",
      ask: scriptedAsk(["p", "captura.png"]),
    });

    const run = readRun();
    expect(run.results.map((r) => r.status).sort()).toEqual(["pass", "pass"]);
    expect(run.verdict).toBe("passed");
  });

  it("digests evidence files so the record is tamper-evident", async () => {
    writeFixture([testCase("TC-1")]);
    writeFileSync(join(dir, "captura.png"), "fake-png-bytes", "utf8");

    await runCommand({
      dir,
      environment: "staging",
      ask: scriptedAsk(["p", "captura.png"]),
    });

    const evidence = readRun().results[0]!.evidence[0]!;
    expect(evidence).toMatchObject({ kind: "screenshot", path: "captura.png" });
    expect(evidence.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("records a missing evidence file as a note instead of a false digest", async () => {
    writeFixture([testCase("TC-1")]);

    await runCommand({
      dir,
      environment: "staging",
      ask: scriptedAsk(["p", "no-existe.png"]),
    });

    const evidence = readRun().results[0]!.evidence[0]!;
    expect(evidence.kind).toBe("note");
    expect(evidence.sha256).toBeUndefined();
    expect(evidence.description).toContain("no encontrado");
  });

  it("evaluates exit criteria mechanically and flags what it cannot verify", async () => {
    writeFixture([testCase("TC-1")]);

    await runCommand({ dir, environment: "staging", ask: scriptedAsk(["p", ""]) });

    const { exitCriteria } = readRun();
    // Executed but no evidence captured → the criterion must NOT be met.
    expect(exitCriteria[0]).toMatchObject({ status: "not-met" });
    // Priority risk covered by a passing case.
    expect(exitCriteria[1]).toMatchObject({ status: "met" });
    // Branch coverage is not machine-checkable here.
    expect(exitCriteria[2]).toMatchObject({
      status: "unknown",
      needsHumanConfirmation: true,
    });
  });
});
