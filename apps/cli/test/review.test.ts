import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GoldenEntrySchema } from "@kriteria/evals";
import { parse as fromYaml, stringify as toYaml } from "yaml";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reviewCommand } from "../src/review.js";
import type { Ask } from "../src/run.js";

/** Feeds scripted answers; throws if the form asks more than expected. */
function scripted(answers: string[]): Ask {
  const queue = [...answers];
  return async () => {
    if (queue.length === 0) throw new Error("el formulario preguntó más de lo guionado");
    return queue.shift()!;
  };
}

const BRIEF = `> Fuente: apache · https://issues.apache.org/jira/browse/OFBIZ-1

# OFBIZ-1 — Supplier name must allow a maximum of 80 characters

**Tipo:** Bug · **Prioridad:** Major

## Descripción

The field must reject values over 80 characters.

## Criterios de aceptación

- **AC-1** A value of 81 characters is rejected

## Comentarios

### Comentario 1

Lowering the column from 255 to 80 can truncate existing data.
`;

const PLAN = {
  workItem: "OFBIZ-1",
  strategy: {
    approach: "methodical",
    depth: "standard",
    overallRisk: "medium",
    levels: [{ value: "system" }],
    types: [{ value: "functional" }],
    techniquesByLevel: [],
  },
};

let dir: string;
let logs: string[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kriteria-review-"));
  mkdirSync(join(dir, "evals", "golden"), { recursive: true });
  mkdirSync(join(dir, "evals", "briefs"), { recursive: true });
  writeFileSync(join(dir, "evals", "briefs", "OFBIZ-1.md"), BRIEF, "utf8");
  writeFileSync(
    join(dir, "evals", "golden", "OFBIZ-1.yml"),
    toYaml({ workItem: "OFBIZ-1", rationale: "prueba límites", expect: {} }),
    "utf8",
  );
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

const output = () => logs.join("\n");

function writePlan(): void {
  const planDir = join(dir, "out", "OFBIZ-1");
  mkdirSync(planDir, { recursive: true });
  writeFileSync(join(planDir, "testplan.yml"), toYaml(PLAN), "utf8");
  writeFileSync(
    join(planDir, "testcases.yml"),
    toYaml({ cases: [{ id: "TC-1" }, { id: "TC-2" }], exclusions: [] }),
    "utf8",
  );
}

const readGolden = () =>
  GoldenEntrySchema.parse(
    fromYaml(readFileSync(join(dir, "evals", "golden", "OFBIZ-1.yml"), "utf8")),
  );

const review = (phase: "expect" | "verdict", answers: string[]) =>
  reviewCommand({
    key: "OFBIZ-1",
    phase,
    evalsDir: join(dir, "evals"),
    outDir: join(dir, "out"),
    ask: scripted(answers),
  });

describe("qa review — expectation phase", () => {
  // answers: show comments?, approach, alternatives, depth, risk, levels,
  // types, techniques, ambiguities, risks, minCases, maxCases, confirm
  // comments?, criteria lines + blank, approach, alternatives, depth, risk,
  // levels, types, techniques, ambiguities, risks, min, max, confirm
  const FULL = [
    "n",
    "el valor de 81 caracteres se rechaza", "",
    "1", "7", "3", "3", "3", "1", "2", "límite 80", "truncate", "6", "12", "s",
  ];

  it("records the judgement from numbered answers, never raw slugs", async () => {
    await review("expect", FULL);

    const e = readGolden().expect;
    expect(e.approach).toBe("analytical");
    expect(e.approachAlternatives).toEqual(["reactive"]);
    expect(e.depth).toBe("thorough");
    expect(e.riskLevel).toBe("high");
    expect(e.levels).toEqual(["system"]);
    expect(e.types).toEqual(["functional"]);
    expect(e.mandatoryTechniques).toEqual(["boundary-value-analysis"]);
    expect(e.ambiguityTopics).toEqual(["límite 80"]);
    expect(e.riskTopics).toEqual(["truncate"]);
    expect(e.minCases).toBe(6);
    expect(e.maxCases).toBe(12);
  });

  it("shows the ticket so the reviewer never has to open a file", async () => {
    await review("expect", FULL);
    expect(output()).toContain("maximum of 80 characters");
    expect(output()).toContain("AC-1");
  });

  // THE property of this phase: it must not leak a single decision the
  // pipeline made, or the expectation it captures is worthless.
  it("prints nothing the pipeline produced, even when a plan exists", async () => {
    writePlan();

    await review("expect", FULL);

    expect(output()).not.toContain("methodical");
    expect(output()).not.toContain("overallRisk");
    expect(output()).not.toMatch(/casos diseñados/);
    // It may warn that a plan exists — that leaks no decision.
    expect(output()).toContain("NO lo abras todavía");
  });

  it("treats Enter as 'no opinion' and leaves the field unevaluated", async () => {
    await review("expect", ["n", "", "", "", "", "", "", "", "", "", "", "", "s"]);

    const e = readGolden().expect;
    expect(e.approach).toBeUndefined();
    expect(e.depth).toBeUndefined();
    expect(e.riskLevel).toBeUndefined();
    expect(e.levels).toEqual([]);
    expect(e.minCases).toBeUndefined();
    expect(output()).toContain("sin evaluar");
  });

  it("re-asks on an out-of-range number instead of saving garbage", async () => {
    await review("expect", ["n", "", "99", "1", "", "", "", "", "", "", "", "", "", "", "s"]);
    expect(output()).toContain("escribe un número de 1 a 7");
    expect(readGolden().expect.approach).toBe("analytical");
  });

  it("re-asks when a multi-select carries an out-of-range entry", async () => {
    await review("expect", ["n", "", "1", "", "", "", "2,99", "3", "", "", "", "", "", "", "s"]);
    expect(output()).toContain("fuera de rango: 99");
    expect(readGolden().expect.levels).toEqual(["system"]);
  });

  it("offers the comments behind a prompt, since that is where the real spec hides", async () => {
    await review("expect", ["s", ...FULL.slice(1)]);
    expect(output()).toContain("truncate existing data");
  });

  it("discards everything when the reviewer declines to save", async () => {
    await review("expect", [...FULL.slice(0, -1), "n"]);
    expect(readGolden().expect.approach).toBeUndefined();
    expect(output()).toContain("sin cambios");
  });

  it("keeps the rationale that explains why the ticket is in the set", async () => {
    await review("expect", FULL);
    expect(readGolden().rationale).toBe("prueba límites");
  });

  // A senior QA's first move on a spec-less ticket is to write what the
  // criteria should be. Throwing that away loses the most valuable part of
  // the review.
  it("captures the criteria the reviewer writes when the ticket has none", async () => {
    // Strip the AC section, which is the case this field exists for.
    writeFileSync(
      join(dir, "evals", "briefs", "OFBIZ-1.md"),
      BRIEF.replace(
        "- **AC-1** A value of 81 characters is rejected",
        "_(el ticket no declara criterios de aceptación)_",
      ),
      "utf8",
    );

    await review("expect", [
      "n",
      "al crear con tipo y contraparte válidos, la factura se crea",
      "la factura corresponde al tipo y la contraparte elegidos",
      "",
      "1", "7", "3", "3", "3", "1", "2", "", "", "", "", "s",
    ]);

    const entry = readGolden();
    expect(entry.reviewerCriteria).toHaveLength(2);
    expect(entry.reviewerCriteria[0]).toContain("la factura se crea");
    expect(output()).toContain("NO trae criterios de aceptación");
  });

  it("asks only for additions when the ticket already declares criteria", async () => {
    await review("expect", [...FULL]);
    expect(output()).toContain("ya trae criterios");
  });

  it("keeps the criteria out of expect, which is scored dimension by dimension", async () => {
    // Enter on approach skips the alternatives question, so the all-blank run
    // is one answer shorter than the full one.
    await review("expect", ["n", "un criterio", "", "", "", "", "", "", "", "", "", "", "", "s"]);
    const entry = readGolden();
    expect(entry.reviewerCriteria).toEqual(["un criterio"]);
    // Nothing in expect was claimed, so nothing is scored.
    expect(entry.expect.approach).toBeUndefined();
  });

  it("writes a file that still parses as a golden entry", async () => {
    await review("expect", FULL);
    expect(() => readGolden()).not.toThrow();
    expect(readFileSync(join(dir, "evals", "golden", "OFBIZ-1.yml"), "utf8")).toContain(
      "TU criterio",
    );
  });
});

describe("qa review --verdict", () => {
  it("refuses when there is no plan, and says how to make one", async () => {
    await expect(review("verdict", ["s"])).rejects.toThrow(/qa plan --from/);
  });

  it("shows what the system decided, then records the verdict", async () => {
    writePlan();

    await review("verdict", ["s", "Evans Mondragon", "coincide con mi criterio"]);

    expect(output()).toContain("methodical");
    expect(output()).toContain("casos diseñados .... 2");
    expect(readGolden().humanVerdict).toMatchObject({
      wouldHaveDoneThis: true,
      reviewedBy: "Evans Mondragon",
      notes: "coincide con mi criterio",
    });
  });

  it("shows the reviewer's own criteria beside the designed cases", async () => {
    writePlan();
    writeFileSync(
      join(dir, "evals", "golden", "OFBIZ-1.yml"),
      toYaml({
        workItem: "OFBIZ-1",
        rationale: "prueba límites",
        reviewerCriteria: ["la factura se crea sin error"],
        expect: {},
      }),
      "utf8",
    );

    await review("verdict", ["s", "Evans", ""]);

    expect(output()).toContain("la factura se crea sin error");
    expect(output()).toContain("TC-1");
    // The instrument says plainly what it cannot measure.
    expect(output()).toContain("comparar prosa con prosa no es medición");
  });

  it("records a negative verdict just as readily", async () => {
    writePlan();
    await review("verdict", ["n", "Evans", "le falta valores límite"]);
    expect(readGolden().humanVerdict.wouldHaveDoneThis).toBe(false);
  });

  it("leaves the verdict null when the reviewer defers", async () => {
    writePlan();
    await review("verdict", [""]);
    expect(readGolden().humanVerdict.wouldHaveDoneThis).toBeNull();
    expect(output()).toContain("pendiente");
  });

  it("warns when no expectation was recorded, but still takes the verdict", async () => {
    // The verdict IS the Fase 0 criterion, so it must never be blocked by a
    // missing expectation — only the dimension comparison is lost.
    writePlan();

    await review("verdict", ["s", "Evans", ""]);

    expect(output()).toContain("No registraste tu expectativa");
    expect(readGolden().humanVerdict.wouldHaveDoneThis).toBe(true);
  });
});

describe("qa review — missing entry", () => {
  it("points at golden-add instead of inventing an entry", async () => {
    await expect(
      reviewCommand({
        key: "NOPE-1",
        phase: "expect",
        evalsDir: join(dir, "evals"),
        outDir: join(dir, "out"),
        ask: scripted([]),
      }),
    ).rejects.toThrow(/qa golden-add NOPE-1/);
  });
});
