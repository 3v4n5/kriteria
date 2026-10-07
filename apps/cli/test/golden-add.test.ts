import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GoldenEntrySchema } from "@kriteria/evals";
import { parse as fromYaml } from "yaml";
import { beforeEach, describe, expect, it } from "vitest";
import {
  descriptionText,
  goldenAddCommand,
  instanceFor,
  renderBrief,
  INSTANCES,
} from "../src/golden-add.js";
import type { RawJiraIssue } from "@kriteria/ingest";

const TEMPLATE = readFileSync("evals/golden/_plantilla.yml", "utf8");

const issue = (overrides: Partial<NonNullable<RawJiraIssue["fields"]>> = {}): RawJiraIssue => ({
  key: "OFBIZ-1",
  id: "1",
  fields: {
    summary: "Tax amount is dropped on payroll invoice items",
    description: "The service crashes when a Deduction amount is entered.",
    issuetype: { name: "Bug" },
    priority: { name: "Critical" },
    updated: "2026-01-02T03:04:05.000+0000",
    ...overrides,
  },
});

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kriteria-golden-"));
  mkdirSync(join(dir, "golden"), { recursive: true });
  writeFileSync(join(dir, "golden", "_plantilla.yml"), TEMPLATE, "utf8");
});

describe("instanceFor", () => {
  it.each([
    ["OFBIZ-13561", "apache"],
    ["FINERACT-2852", "apache"],
    ["SYNCOPE-1867", "apache"],
    ["JENKINS-73288", "jenkins"],
    ["COMPASS-8949", "mongodb"],
  ])("infers the instance for %s from its project prefix", (key, expected) => {
    expect(instanceFor(key).name).toBe(expected);
  });

  it("refuses to guess for an unknown project instead of picking one", () => {
    expect(() => instanceFor("WHATEVER-1")).toThrow(/cannot infer/);
  });

  it("rejects an instance name that does not exist", () => {
    expect(() => instanceFor("OFBIZ-1", "gitlab")).toThrow(/unknown instance/);
  });

  it("serves every registered instance over REST v2 — none has v3", () => {
    // Self-hosted Jira answers v3 with a redirect to its login page, so a
    // registry entry defaulting to v3 would silently fail to fetch.
    for (const instance of INSTANCES) {
      expect(instance.apiVersion).toBe("2");
    }
  });
});

describe("descriptionText", () => {
  it("passes through the plain text that Jira v2 serves", () => {
    expect(descriptionText("texto plano")).toBe("texto plano");
  });

  it("flattens the ADF that v3 and MCP tools serve", () => {
    const adf = {
      type: "doc",
      version: 1,
      content: [{ type: "paragraph", content: [{ type: "text", text: "hola" }] }],
    };
    expect(descriptionText(adf)).toContain("hola");
  });

  it("returns empty for a missing description rather than throwing", () => {
    expect(descriptionText(undefined)).toBe("");
    expect(descriptionText(null)).toBe("");
  });
});

describe("renderBrief", () => {
  const apache = INSTANCES.find((i) => i.name === "apache")!;

  it("leads with the source and the public URL", () => {
    const { markdown } = renderBrief("OFBIZ-1", apache, issue());
    expect(markdown.split("\n")[0]).toBe(
      "> Fuente: apache · https://issues.apache.org/jira/browse/OFBIZ-1",
    );
  });

  it("extracts acceptance criteria when the ticket declares them", () => {
    const brief = renderBrief(
      "OFBIZ-1",
      apache,
      issue({
        description: [
          "h2. Acceptance Criteria",
          "* The tax amount is persisted with 2 decimals",
          "* A Deduction over the limit returns a validation error",
        ].join("\n"),
      }),
    );
    expect(brief.acceptanceCriteria).toBe(2);
    expect(brief.markdown).toContain("**AC-1**");
  });

  it("says plainly when there are none, instead of leaving the section blank", () => {
    const brief = renderBrief("OFBIZ-1", apache, issue());
    expect(brief.acceptanceCriteria).toBe(0);
    expect(brief.markdown).toContain("no declara criterios de aceptación");
  });

  it("carries the comments, where the real spec often lives", () => {
    const brief = renderBrief(
      "OFBIZ-1",
      apache,
      issue({
        comment: {
          comments: [{ body: "Esto ya se resolvió en otro ticket" }, { body: "Falta decidir el límite" }],
        },
      }),
    );
    expect(brief.comments).toBe(2);
    expect(brief.markdown).toContain("Falta decidir el límite");
  });

  // The brief exists to inform the reviewer's independent judgement. A hint
  // about what to test would leak straight into the expectation.
  it("contains no analysis, suggestion or technique name", () => {
    const { markdown } = renderBrief("OFBIZ-1", apache, issue());
    expect(markdown).not.toMatch(
      /boundary|equivalence|riesgo|recomend|suger|deberías|test case|probar/i,
    );
  });
});

describe("goldenAddCommand", () => {
  const run = (keys: string[], raw: RawJiraIssue = issue(), rationales = {}) =>
    goldenAddCommand({
      keys,
      rationales,
      evalsDir: dir,
      fetchIssue: async () => raw,
    });

  it("writes the fixture, the golden stub and the brief", async () => {
    const [result] = await run(["OFBIZ-1"]);

    expect(result).toMatchObject({ key: "OFBIZ-1", instance: "apache", fetched: true });
    expect(existsSync(join(dir, "fixtures", "OFBIZ-1.raw.json"))).toBe(true);
    expect(existsSync(join(dir, "golden", "OFBIZ-1.yml"))).toBe(true);
    expect(existsSync(join(dir, "briefs", "OFBIZ-1.md"))).toBe(true);
  });

  it("writes a fixture the pipeline can actually replay", async () => {
    await run(["OFBIZ-1"]);
    const raw = JSON.parse(
      readFileSync(join(dir, "fixtures", "OFBIZ-1.raw.json"), "utf8"),
    );
    expect(raw.key).toBe("OFBIZ-1");
    expect(raw.fields.summary).toContain("Tax amount");
  });

  // THE rule for this corpus: a pre-filled expectation would anchor the
  // reviewer and make the whole measurement circular.
  it("leaves every expect field empty", async () => {
    await run(["OFBIZ-1"], issue(), { "OFBIZ-1": "spec incompleta" });

    const parsed = GoldenEntrySchema.parse(
      fromYaml(readFileSync(join(dir, "golden", "OFBIZ-1.yml"), "utf8")),
    );
    expect(parsed.workItem).toBe("OFBIZ-1");
    expect(parsed.rationale).toBe("spec incompleta");
    expect(parsed.expect.approach).toBeUndefined();
    expect(parsed.expect.depth).toBeUndefined();
    expect(parsed.expect.riskLevel).toBeUndefined();
    expect(parsed.expect.minCases).toBeUndefined();
    expect(parsed.expect.maxCases).toBeUndefined();
    expect(parsed.expect.levels).toEqual([]);
    expect(parsed.expect.types).toEqual([]);
    expect(parsed.expect.mandatoryTechniques).toEqual([]);
    expect(parsed.expect.ambiguityTopics).toEqual([]);
    expect(parsed.expect.riskTopics).toEqual([]);
    expect(parsed.humanVerdict.wouldHaveDoneThis).toBeNull();
  });

  it("marks a missing rationale as pending rather than inventing one", async () => {
    await run(["OFBIZ-1"]);
    const yml = readFileSync(join(dir, "golden", "OFBIZ-1.yml"), "utf8");
    expect(yml).toContain("PENDIENTE");
  });

  it("never overwrites a golden entry a human already filled", async () => {
    const path = join(dir, "golden", "OFBIZ-1.yml");
    mkdirSync(join(dir, "golden"), { recursive: true });
    writeFileSync(path, "workItem: OFBIZ-1\nrationale: mi juicio\nexpect:\n  depth: thorough\n", "utf8");

    await run(["OFBIZ-1"]);

    expect(readFileSync(path, "utf8")).toContain("depth: thorough");
  });

  it("groups mixed keys by instance without per-group configuration", async () => {
    const seen: string[] = [];
    const results = await goldenAddCommand({
      keys: ["OFBIZ-1", "JENKINS-2", "FINERACT-3", "COMPASS-4"],
      evalsDir: dir,
      fetchIssue: async (key, env) => {
        seen.push(`${key}@${env.baseUrl}`);
        return { ...issue(), key };
      },
    });

    expect(results.map((r) => r.instance)).toEqual([
      "apache",
      "apache",
      "jenkins",
      "mongodb",
    ]);
    expect(seen).toContain("OFBIZ-1@https://issues.apache.org/jira");
    expect(seen).toContain("JENKINS-2@https://issues.jenkins.io");
    expect(seen).toContain("COMPASS-4@https://jira.mongodb.org");
  });

  it("records a failed fetch without aborting the rest of the batch", async () => {
    let calls = 0;
    const results = await goldenAddCommand({
      keys: ["OFBIZ-1", "OFBIZ-2"],
      evalsDir: dir,
      fetchIssue: async (key) => {
        if (++calls === 1) throw new Error("Jira issue not found");
        return { ...issue(), key };
      },
    });

    expect(results[0]).toMatchObject({ fetched: false });
    expect(results[0]!.error).toContain("not found");
    expect(results[1]).toMatchObject({ fetched: true });
  });

  it("fails loudly when the template is missing, rather than inventing one", async () => {
    const empty = mkdtempSync(join(tmpdir(), "kriteria-empty-"));
    await expect(
      goldenAddCommand({ keys: ["OFBIZ-1"], evalsDir: empty, fetchIssue: async () => issue() }),
    ).rejects.toThrow(/template not found/);
  });
});
