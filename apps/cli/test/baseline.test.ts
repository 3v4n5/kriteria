import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BaselineEntrySchema } from "@kriteria/evals";
import type { CallModel, ModelCallRequest } from "@kriteria/agents";
import { parse as fromYaml } from "yaml";
import { beforeEach, describe, expect, it } from "vitest";
import { baselineCommand, briefDigest, buildBaselinePrompt } from "../src/baseline.js";

const BRIEF = `> Fuente: apache · https://issues.apache.org/jira/browse/OFBIZ-1

# OFBIZ-1 — Supplier name must allow a maximum of 80 characters

## Descripción

The field must reject values over 80 characters, on the frontend and the backend.
`;

const ANSWER = {
  approach: "analytical",
  depth: "thorough",
  riskLevel: "high",
  mandatoryTechniques: ["boundary-value-analysis"],
  ambiguityTopics: ["80"],
  minCases: 6,
  maxCases: 12,
};

function caller(payload: unknown = ANSWER): {
  call: CallModel;
  requests: ModelCallRequest[];
} {
  const requests: ModelCallRequest[] = [];
  const call: CallModel = async (req) => {
    requests.push(req);
    return {
      text: JSON.stringify(payload),
      usage: { inputTokens: 1000, outputTokens: 200 },
    };
  };
  return { call, requests };
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kriteria-baseline-"));
  mkdirSync(join(dir, "briefs"), { recursive: true });
  writeFileSync(join(dir, "briefs", "OFBIZ-1.md"), BRIEF, "utf8");
});

describe("buildBaselinePrompt", () => {
  // The isolation guarantee is the SIGNATURE: one string, the brief. There is
  // no parameter through which a plan, a strategy, a golden entry or a critic
  // report could reach the model, by mistake or otherwise.
  it("takes exactly one argument", () => {
    expect(buildBaselinePrompt.length).toBe(1);
  });

  it("carries the brief and nothing resembling a produced plan", () => {
    const prompt = buildBaselinePrompt(BRIEF);
    expect(prompt).toContain("maximum of 80 characters");
    expect(prompt).not.toMatch(
      /testplan|testcases|TC-\d|RSK-\d|FEA-\d|critic|veredicto|overallRisk|techniquesByLevel/i,
    );
  });

  it("tells the model that silence is allowed", () => {
    // Without this the model fills every field, and an invented expectation
    // corrupts the comparison the baseline exists for.
    expect(buildBaselinePrompt(BRIEF)).toMatch(/empty|vacío/i);
  });
});

describe("baselineCommand", () => {
  it("writes a schema-valid entry with the digest of the brief it read", async () => {
    const { call } = caller();

    const results = await baselineCommand({ keys: ["OFBIZ-1"], call, evalsDir: dir });

    expect(results[0]).toMatchObject({ key: "OFBIZ-1", written: true });
    const entry = BaselineEntrySchema.parse(
      fromYaml(readFileSync(join(dir, "baseline", "OFBIZ-1.yml"), "utf8")),
    );
    expect(entry.workItem).toBe("OFBIZ-1");
    expect(entry.expect.approach).toBe("analytical");
    expect(entry.source.briefSha256).toBe(briefDigest(BRIEF));
  });

  it("sends only the brief to the model", async () => {
    const { call, requests } = caller();

    await baselineCommand({ keys: ["OFBIZ-1"], call, evalsDir: dir });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.role).toBe("baseline-reviewer");
    expect(requests[0]!.user).toContain("maximum of 80 characters");
    expect(requests[0]!.user).not.toMatch(/TC-\d|RSK-\d|testplan/i);
  });

  it("uses the strongest model, since this is a reference standard", async () => {
    const { call, requests } = caller();
    await baselineCommand({ keys: ["OFBIZ-1"], call, evalsDir: dir });
    expect(requests[0]!.model).toBe("claude-opus-5");
  });

  it("records a blank judgement rather than forcing an opinion", async () => {
    const { call } = caller({});

    await baselineCommand({ keys: ["OFBIZ-1"], call, evalsDir: dir });

    const entry = BaselineEntrySchema.parse(
      fromYaml(readFileSync(join(dir, "baseline", "OFBIZ-1.yml"), "utf8")),
    );
    expect(entry.expect.approach).toBeUndefined();
    expect(entry.expect.mandatoryTechniques).toEqual([]);
  });

  it("warns in the file itself not to copy it into the golden set", async () => {
    const { call } = caller();
    await baselineCommand({ keys: ["OFBIZ-1"], call, evalsDir: dir });
    const yml = readFileSync(join(dir, "baseline", "OFBIZ-1.yml"), "utf8");
    expect(yml).toContain("NO es el golden set");
    expect(yml).toContain("evals/golden");
  });

  it("skips an existing baseline so a re-run costs nothing", async () => {
    const { call, requests } = caller();
    await baselineCommand({ keys: ["OFBIZ-1"], call, evalsDir: dir });
    const second = await baselineCommand({ keys: ["OFBIZ-1"], call, evalsDir: dir });

    expect(second[0]).toMatchObject({ written: false, skipped: "ya existe" });
    expect(requests).toHaveLength(1);
  });

  it("regenerates on --force", async () => {
    const { call, requests } = caller();
    await baselineCommand({ keys: ["OFBIZ-1"], call, evalsDir: dir });
    await baselineCommand({ keys: ["OFBIZ-1"], call, evalsDir: dir, force: true });
    expect(requests).toHaveLength(2);
  });

  it("reports a missing brief instead of calling the model with nothing", async () => {
    const { call, requests } = caller();

    const results = await baselineCommand({ keys: ["NOPE-1"], call, evalsDir: dir });

    expect(results[0]).toMatchObject({ written: false, skipped: "sin brief" });
    expect(requests).toHaveLength(0);
  });

  it("reports the cost, since this command is not free", async () => {
    const { call } = caller();
    const results = await baselineCommand({ keys: ["OFBIZ-1"], call, evalsDir: dir });
    expect(results[0]!.costUsd).toBeGreaterThan(0);
  });
});
