/**
 * `qa review` — the human judgement screen, as a guided form.
 *
 * Capturing a reviewer's judgement is the most important workflow in the
 * system: the golden set is the measurement instrument, and an instrument
 * nobody can bear to fill does not get filled. Hand-editing YAML is not a
 * user experience, so this asks one question at a time, numbers the valid
 * answers, accepts Enter as "no opinion", and writes the file.
 *
 * Two phases, deliberately separated, because the ORDER is what makes the
 * number mean anything:
 *
 *   qa review <KEY>             what you expected — shows the ticket ONLY
 *   qa review <KEY> --verdict   what you think of the plan — shows the plan
 *
 * The expectation phase never prints a single thing the pipeline produced.
 * That is the contamination discipline moved out of the reviewer's willpower
 * and into the tool.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  APPROACH_LABELS,
  RISK_LEVELS,
  TEST_APPROACHES,
  TEST_DEPTHS,
  TEST_LEVELS,
  TEST_TECHNIQUES,
  TEST_TYPES,
} from "@kriteria/istqb";
import { GoldenEntrySchema, isGoldenEntryFile, type GoldenEntry } from "@kriteria/evals";
import { parse as fromYaml, stringify as toYaml } from "yaml";
import { createAsker, EndOfInput, type Ask } from "./run.js";

// ---------------------------------------------------------------------------
// Presentation: Spanish labels live here, not in the engine. @kriteria/istqb
// owns the vocabulary; how it is shown to this reviewer is a UI concern.
// ---------------------------------------------------------------------------

const DEPTH_LABELS: Record<string, string> = {
  smoke: "smoke — solo que no esté roto",
  standard: "standard — cobertura normal",
  thorough: "thorough — a fondo, incluye bordes y regresión",
  exhaustive: "exhaustive — todo lo que se pueda enumerar",
};

const RISK_LABELS: Record<string, string> = {
  low: "bajo — si falla, molesta",
  medium: "medio — si falla, duele",
  high: "alto — si falla, hay pérdida real",
  critical: "crítico — si falla, es un incidente",
};

const LEVEL_LABELS: Record<string, string> = {
  component: "componente — unidades aisladas",
  "component-integration": "integración de componentes",
  system: "sistema — la aplicación completa",
  "system-integration": "integración de sistemas — cruza servicios",
  acceptance: "aceptación — ¿lo acepta el negocio?",
};

const TYPE_LABELS: Record<string, string> = {
  functional: "funcional — ¿hace lo que dice?",
  performance: "rendimiento",
  security: "seguridad",
  usability: "usabilidad",
  accessibility: "accesibilidad",
  compatibility: "compatibilidad",
  reliability: "confiabilidad",
  confirmation: "confirmación — ¿el fix arregló el bug?",
  regression: "regresión — ¿rompió algo más?",
};

const TECHNIQUE_LABELS: Record<string, string> = {
  "equivalence-partitioning": "particiones de equivalencia — una clase, un caso",
  "boundary-value-analysis": "valores límite — los bordes (79/80/81)",
  "decision-table": "tabla de decisión — combinaciones de condiciones",
  "state-transition": "transición de estados — ciclo de vida",
  "use-case": "caso de uso — flujo de punta a punta",
  pairwise: "pairwise — todos los pares de parámetros",
  "statement-coverage": "cobertura de sentencias (requiere código)",
  "branch-coverage": "cobertura de ramas (requiere código)",
  "modified-condition-decision-coverage": "MC/DC (requiere código, crítico)",
  "error-guessing": "adivinación de errores — ataques por experiencia",
  exploratory: "exploratorio — sesión con carta",
  "checklist-based": "basado en checklist",
};

const label = (map: Record<string, string>, value: string): string =>
  map[value] ?? value;

// ---------------------------------------------------------------------------
// Question primitives
// ---------------------------------------------------------------------------

/** Enter = no opinion. Returns undefined, which scores as `not-scored`. */
async function pickOne<T extends string>(
  ask: Ask,
  question: string,
  options: readonly T[],
  labels: Record<string, string>,
  current?: T | undefined,
): Promise<T | undefined> {
  console.log(`\n${question}`);
  options.forEach((option, i) => {
    const mark = option === current ? " ←" : "";
    console.log(`   ${i + 1}) ${label(labels, option)}${mark}`);
  });
  console.log("   (Enter = no tengo opinión · se reporta sin evaluar)");

  for (;;) {
    const raw = (await ask("   > ")).trim();
    if (raw === "") return current;
    const index = Number.parseInt(raw, 10);
    if (Number.isInteger(index) && index >= 1 && index <= options.length) {
      return options[index - 1];
    }
    console.log(`   ⚠ escribe un número de 1 a ${options.length}, o Enter`);
  }
}

/** Comma- or space-separated numbers. Enter = none. */
async function pickMany<T extends string>(
  ask: Ask,
  question: string,
  options: readonly T[],
  labels: Record<string, string>,
  current: readonly T[] = [],
): Promise<T[]> {
  console.log(`\n${question}`);
  options.forEach((option, i) => {
    const mark = current.includes(option) ? " ←" : "";
    console.log(`   ${i + 1}) ${label(labels, option)}${mark}`);
  });
  console.log("   (varios separados por coma, ej: 1,3,4 · Enter = ninguno)");

  for (;;) {
    const raw = (await ask("   > ")).trim();
    if (raw === "") return [...current];
    const picked = raw
      .split(/[,\s]+/)
      .filter(Boolean)
      .map((n) => Number.parseInt(n, 10));
    const invalid = picked.filter(
      (n) => !Number.isInteger(n) || n < 1 || n > options.length,
    );
    if (invalid.length > 0) {
      console.log(`   ⚠ fuera de rango: ${invalid.join(", ")} — usa 1 a ${options.length}`);
      continue;
    }
    // Deduped and in the engine's own order, so the file is stable.
    const chosen = new Set(picked.map((n) => options[n - 1]!));
    return options.filter((o) => chosen.has(o));
  }
}

/** Free-text keywords, comma separated. */
async function askKeywords(
  ask: Ask,
  question: string,
  hint: string,
  current: readonly string[] = [],
): Promise<string[]> {
  console.log(`\n${question}`);
  console.log(`   ${hint}`);
  if (current.length > 0) console.log(`   actual: ${current.join(", ")}`);
  console.log("   (separa con coma · Enter = ninguno)");
  const raw = (await ask("   > ")).trim();
  if (raw === "") return [...current];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Open-ended list: one item per line, blank line ends it.
 *
 * Used for the criteria a reviewer writes. Not comma-separated like the
 * keyword fields, because a criterion is a full sentence and commas belong
 * inside it.
 */
async function askLines(
  ask: Ask,
  question: string,
  hint: string,
  current: readonly string[] = [],
): Promise<string[]> {
  console.log(`\n${question}`);
  console.log(`   ${hint}`);
  if (current.length > 0) {
    console.log("   ya tenías:");
    current.forEach((c, i) => console.log(`     ${i + 1}. ${c}`));
    console.log("   (Enter en la primera = conservar lo que ya estaba)");
  } else {
    console.log("   (uno por línea · línea vacía para terminar)");
  }

  const out: string[] = [];
  for (;;) {
    const raw = (await ask(`   ${out.length + 1}. `)).trim();
    if (raw === "") break;
    out.push(raw);
  }
  return out.length === 0 ? [...current] : out;
}

async function askNumber(
  ask: Ask,
  question: string,
  current?: number | undefined,
): Promise<number | undefined> {
  for (;;) {
    const raw = (await ask(`\n${question}${current !== undefined ? ` [${current}]` : ""}\n   > `)).trim();
    if (raw === "") return current;
    const n = Number.parseInt(raw, 10);
    if (Number.isInteger(n) && n > 0) return n;
    console.log("   ⚠ escribe un número entero positivo, o Enter para dejarlo vacío");
  }
}

async function askYesNo(ask: Ask, question: string): Promise<boolean | null> {
  for (;;) {
    const raw = (await ask(`\n${question}\n   s = sí · n = no · Enter = decidir después\n   > `))
      .trim()
      .toLowerCase();
    if (raw === "") return null;
    if (["s", "si", "sí", "y", "yes"].includes(raw)) return true;
    if (["n", "no"].includes(raw)) return false;
    console.log("   ⚠ responde s, n, o Enter");
  }
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export interface ReviewCommandOptions {
  key: string;
  /** "expect" shows the ticket only; "verdict" shows the produced plan. */
  phase: "expect" | "verdict";
  evalsDir?: string;
  outDir?: string;
  reviewer?: string;
  ask?: Ask;
  log?: (message: string) => void;
}

export async function reviewCommand(options: ReviewCommandOptions): Promise<void> {
  const evalsDir = options.evalsDir ?? "evals";
  const outDir = options.outDir ?? "out";
  const goldenPath = join(evalsDir, "golden", `${options.key}.yml`);
  if (!existsSync(goldenPath)) {
    throw new Error(
      `no hay entrada de golden set para ${options.key} — créala con: qa golden-add ${options.key}`,
    );
  }

  // The bytes the form started from. It stays open for as long as the
  // reviewer takes to read the report, so the save needs to know whether it
  // is about to overwrite work that arrived in the meantime.
  const openedWith = readFileSync(goldenPath, "utf8");
  const entry = GoldenEntrySchema.parse(fromYaml(openedWith));
  const stdinAsker = options.ask ? undefined : createAsker(process.stdin);
  const ask: Ask = options.ask ?? stdinAsker!.ask;

  try {
    const updated =
      options.phase === "expect"
        ? await expectPhase(ask, entry, join(evalsDir, "briefs", `${options.key}.md`), join(outDir, options.key))
        : await verdictPhase(ask, entry, join(outDir, options.key), options.reviewer);
    if (!updated) {
      console.log("\n✗ sin cambios.");
      return;
    }
    saveWithoutClobbering(goldenPath, openedWith, updated);
    console.log(`\n✓ guardado en ${goldenPath}`);
    if (options.phase === "expect") {
      console.log(
        `  Siguiente: cuando exista el plan, da tu veredicto con\n    pnpm qa review ${options.key} --verdict`,
      );
    }
  } catch (error) {
    if (!(error instanceof EndOfInput)) throw error;
    console.log("\n✗ entrada agotada — no se guardó nada.");
  } finally {
    stdinAsker?.close();
  }
}

/**
 * The expectation phase prints the TICKET and nothing the pipeline produced.
 * Not even "a plan already exists" leaks a decision — only that it is there.
 */
async function expectPhase(
  ask: Ask,
  entry: GoldenEntry,
  briefPath: string,
  planDir: string,
): Promise<GoldenEntry | null> {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ${entry.workItem} — ¿qué habrías hecho tú?`);
  console.log(`${"═".repeat(70)}`);
  if (entry.rationale) console.log(`\n  Está en el set porque: ${entry.rationale}`);

  // Recorded, not just warned about. Whether a plan was on disk is the only
  // part of "was this written blind" a tool can establish, and asking the
  // reviewer to self-report it would put the integrity of the number back
  // where it was: in someone's memory of what they did and did not open.
  const planExisted = existsSync(join(planDir, "testplan.yml"));
  if (planExisted) {
    console.log(
      `\n  ⚠ Ya existe un plan generado para este ticket. NO lo abras todavía:\n` +
        `    si llenas esto con el plan a la vista, el puntaje deja de medir tu criterio.\n` +
        `    Queda anotado que el plan ya estaba, así que este expect no entra al\n` +
        `    promedio de la suite — tus dimensiones se siguen mostrando una por una.`,
    );
  }

  if (!existsSync(briefPath)) {
    console.log(`\n  ⚠ no hay brief en ${briefPath} — vas a juzgar a ciegas.`);
  } else {
    await showBrief(ask, readFileSync(briefPath, "utf8"));
  }

  // Asked BEFORE the strategy questions: writing the criteria is how a
  // reviewer works out what the ticket even asks for, and the answer should
  // inform the decisions that follow — not be an afterthought.
  const hasOwnCriteria = /\*\*AC-\d/.test(
    existsSync(briefPath) ? readFileSync(briefPath, "utf8") : "",
  );
  const reviewerCriteria = await askLines(
    ask,
    hasOwnCriteria
      ? "El ticket ya trae criterios. ¿Agregarías o corregirías alguno?"
      : "Este ticket NO trae criterios de aceptación. ¿Cuáles deberían ser?",
    hasOwnCriteria
      ? "Solo los que falten o estén mal. Enter directo si los de arriba te sirven."
      : "Lo que debe cumplirse para darlo por bueno. Uno por línea.",
    entry.reviewerCriteria,
  );

  console.log(`\n${"─".repeat(70)}`);
  console.log("  Tus decisiones. Enter en cualquiera = no tengo opinión.");
  console.log(`${"─".repeat(70)}`);

  const e = entry.expect;
  const approach = await pickOne(
    ask,
    "1/9 · ¿Qué enfoque de prueba usarías como principal?",
    TEST_APPROACHES,
    APPROACH_LABELS,
    e.approach,
  );
  const approachAlternatives =
    approach === undefined
      ? e.approachAlternatives
      : await pickMany(
          ask,
          "2/9 · ¿Qué otros enfoques aceptarías como razonables?",
          TEST_APPROACHES,
          APPROACH_LABELS,
          e.approachAlternatives,
        );
  const depth = await pickOne(ask, "3/9 · ¿Qué tan a fondo lo probarías?", TEST_DEPTHS, DEPTH_LABELS, e.depth);
  const riskLevel = await pickOne(ask, "4/9 · ¿Qué tan riesgoso es este cambio?", RISK_LEVELS, RISK_LABELS, e.riskLevel);
  const levels = await pickMany(ask, "5/9 · ¿En qué niveles DEBE haber pruebas?", TEST_LEVELS, LEVEL_LABELS, e.levels);
  const types = await pickMany(ask, "6/9 · ¿Qué tipos de prueba DEBE incluir?", TEST_TYPES, TYPE_LABELS, e.types);
  const mandatoryTechniques = await pickMany(
    ask,
    "7/9 · ¿Qué técnicas son NO negociables? (rechazarías el plan sin ellas)",
    TEST_TECHNIQUES,
    TECHNIQUE_LABELS,
    e.mandatoryTechniques,
  );
  const ambiguityTopics = await askKeywords(
    ask,
    "8/9 · ¿Qué le preguntarías al autor antes de diseñar?",
    "Pocas palabras por tema, no frases. Ej: límite 80, modulo vendor",
    e.ambiguityTopics,
  );
  const riskTopics = await askKeywords(
    ask,
    "9/9 · ¿Qué te preocupa que se rompa?",
    "Mismo criterio. Ej: truncamiento|truncate, rename",
    e.riskTopics,
  );
  const minCases = await askNumber(ask, "¿Mínimo de casos que considerarías sensato? (Enter = sin opinión)", e.minCases);
  const maxCases = await askNumber(ask, "¿Máximo?", e.maxCases);

  const expect = {
    ...e,
    ...(approach !== undefined ? { approach } : {}),
    approachAlternatives,
    ...(depth !== undefined ? { depth } : {}),
    ...(riskLevel !== undefined ? { riskLevel } : {}),
    levels,
    types,
    mandatoryTechniques,
    ambiguityTopics,
    riskTopics,
    ...(minCases !== undefined ? { minCases } : {}),
    ...(maxCases !== undefined ? { maxCases } : {}),
  };

  console.log(`\n${"─".repeat(70)}`);
  console.log("  Resumen de lo que registraste:");
  if (reviewerCriteria.length > 0) {
    console.log(`   ✅ criterios que escribiste: ${reviewerCriteria.length}`);
  }
  for (const line of summarize(expect)) console.log(`   ${line}`);
  console.log(`${"─".repeat(70)}`);

  const confirm = await askYesNo(ask, "¿Guardo esto?");
  if (confirm !== true) return null;
  return {
    ...entry,
    expectProvenance: planExisted ? "informed" : "blind-human",
    reviewerCriteria,
    expect,
  };
}

/** The verdict phase is the only place the produced plan is shown. */
async function verdictPhase(
  ask: Ask,
  entry: GoldenEntry,
  planDir: string,
  reviewer?: string,
): Promise<GoldenEntry | null> {
  const planPath = join(planDir, "testplan.yml");
  if (!existsSync(planPath)) {
    throw new Error(
      `no hay plan generado en ${planDir} — córrelo primero:\n    pnpm qa plan --from file:evals/fixtures/${entry.workItem}.raw.json`,
    );
  }

  const blank =
    entry.expect.approach === undefined &&
    entry.expect.depth === undefined &&
    entry.expect.riskLevel === undefined &&
    entry.expect.mandatoryTechniques.length === 0 &&
    entry.expect.ambiguityTopics.length === 0;

  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ${entry.workItem} — veredicto`);
  console.log(`${"═".repeat(70)}`);
  if (blank) {
    console.log(
      "\n  ⚠ No registraste tu expectativa antes. El veredicto sigue valiendo\n" +
        "    (es el criterio de Fase 0), pero no habrá comparación dimensión\n" +
        `    por dimensión. Para registrarla: pnpm qa review ${entry.workItem}`,
    );
  }

  const plan = fromYaml(readFileSync(planPath, "utf8")) as Record<string, any>;
  const cases = fromYaml(
    readFileSync(join(planDir, "testcases.yml"), "utf8"),
  ) as Record<string, any>;
  const strategy = plan.strategy ?? {};

  console.log("\n  Lo que decidió el sistema:");
  console.log(`    enfoque ............ ${strategy.approach ?? "—"}`);
  console.log(`    profundidad ........ ${strategy.depth ?? "—"}`);
  console.log(`    riesgo global ...... ${strategy.overallRisk ?? "—"}`);
  console.log(`    niveles ............ ${(strategy.levels ?? []).map((l: any) => l.value).join(", ") || "—"}`);
  console.log(`    tipos .............. ${(strategy.types ?? []).map((t: any) => t.value).join(", ") || "—"}`);
  console.log(`    casos diseñados .... ${(cases.cases ?? []).length}`);

  if (entry.reviewerCriteria.length > 0) {
    console.log("\n  Los criterios que TÚ escribiste, y los casos del plan:");
    entry.reviewerCriteria.forEach((c, i) => console.log(`    ${i + 1}. ${c}`));
    console.log("\n  Casos diseñados:");
    for (const c of (cases.cases ?? []) as { id: string; title: string }[]) {
      console.log(`    ${c.id} ${c.title}`);
    }
    console.log(
      "\n  (la comparación la haces tú — comparar prosa con prosa no es medición)",
    );
  }

  const report = join(planDir, `informe-${entry.workItem}.html`);
  console.log(
    existsSync(report)
      ? `\n  El informe completo está en:\n    ${report}\n  Ábrelo y léelo antes de responder.`
      : `\n  (sin informe HTML — genéralo con: pnpm qa report ${planDir})`,
  );

  const verdict = await askYesNo(
    ask,
    "LA pregunta de Fase 0: ¿es esto lo que tú habrías hecho?",
  );
  if (verdict === null) {
    console.log("\n  Queda pendiente.");
    return null;
  }

  const who =
    (await ask(`\n¿Quién revisó?${reviewer ? ` [${reviewer}]` : ""}\n   > `)).trim() ||
    reviewer ||
    "";
  const notes = (
    await ask("\n¿Por qué? (una línea · Enter = sin notas)\n   > ")
  ).trim();

  return {
    ...entry,
    humanVerdict: {
      wouldHaveDoneThis: verdict,
      ...(who ? { reviewedBy: who } : {}),
      notes: notes || entry.humanVerdict.notes,
    },
  };
}

/** Prints the ticket in sections, with the comments behind a prompt. */
async function showBrief(ask: Ask, brief: string): Promise<void> {
  const sections = splitSections(brief);
  console.log(`\n${sections.head.trim()}`);
  if (sections.description) {
    console.log(`\n  ── Descripción ──`);
    console.log(indent(truncate(sections.description, 2200)));
  }
  if (sections.criteria) {
    console.log(`\n  ── Criterios de aceptación ──`);
    console.log(indent(sections.criteria));
  }
  if (sections.comments && !/sin comentarios/i.test(sections.comments)) {
    const count = (sections.comments.match(/^### /gm) ?? []).length;
    const show = await askYesNo(
      ask,
      `  Hay ${count} comentario(s). En un ticket real suelen responder o contradecir la descripción. ¿Los muestro?`,
    );
    if (show === true) {
      console.log(`\n  ── Comentarios ──`);
      console.log(indent(truncate(sections.comments, 6000)));
    }
  }
}

function splitSections(brief: string): {
  head: string;
  description: string;
  criteria: string;
  comments: string;
} {
  const grab = (name: string): string => {
    const re = new RegExp(`^## ${name}\\s*$([\\s\\S]*?)(?=^## |\\s*$(?![\\s\\S]))`, "m");
    return re.exec(brief)?.[1]?.trim() ?? "";
  };
  const head = brief.split(/^## /m)[0] ?? "";
  return {
    head,
    description: grab("Descripción"),
    criteria: grab("Criterios de aceptación"),
    comments: grab("Comentarios"),
  };
}

const indent = (text: string): string =>
  text
    .split("\n")
    .map((l) => `    ${l}`)
    .join("\n");

const truncate = (text: string, max: number): string =>
  text.length <= max
    ? text
    : `${text.slice(0, max)}\n… (${text.length - max} caracteres más — están en el brief)`;

function summarize(e: GoldenEntry["expect"]): string[] {
  const out: string[] = [];
  const show = (name: string, value: unknown) => {
    const empty =
      value === undefined || (Array.isArray(value) && value.length === 0);
    out.push(
      `${empty ? "◻️" : "✅"} ${name}: ${empty ? "sin evaluar" : Array.isArray(value) ? value.join(", ") : String(value)}`,
    );
  };
  show("enfoque", e.approach);
  show("profundidad", e.depth);
  show("riesgo", e.riskLevel);
  show("niveles", e.levels);
  show("tipos", e.types);
  show("técnicas obligatorias", e.mandatoryTechniques);
  show("ambigüedades", e.ambiguityTopics);
  show("riesgos", e.riskTopics);
  show(
    "casos",
    e.minCases === undefined && e.maxCases === undefined
      ? undefined
      : `${e.minCases ?? "—"}..${e.maxCases ?? "—"}`,
  );
  return out;
}

const HEADER = `# ─────────────────────────────────────────────────────────────────────────────
# Entrada del golden set. Editada con: pnpm qa review <KEY>
#
# El bloque expect es TU criterio, registrado antes de ver el plan. Un expect
# llenado con el plan a la vista hace que el eval se mida contra si mismo.
# Lo que quede vacio se reporta "sin evaluar", nunca como aprobado.
# ─────────────────────────────────────────────────────────────────────────────`;

function writeEntry(path: string, entry: GoldenEntry, header = HEADER): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${header}\n${toYaml(entry)}`, "utf8");
}

const REJECTED_HEADER = `# ─────────────────────────────────────────────────────────────────────────────
# ESTO NO ES UNA ENTRADA DEL GOLDEN SET. Es lo que respondiste en un
# formulario que NO se pudo guardar: el archivo real habia cambiado mientras
# lo llenabas, y sobrescribirlo habria borrado ese cambio.
#
# Compara este archivo con la entrada real y quedate con lo que valga. Cuando
# termines, borra este. \`qa eval\` no lo mira.
# ─────────────────────────────────────────────────────────────────────────────`;

/** Where a save goes when it refuses to overwrite the real entry. */
export const rejectedCopyPath = (goldenPath: string): string => {
  const path = `${goldenPath}.conflicto`;
  // Suffixed, never `.conflicto.yml`: `qa eval` scores every *.yml in that
  // directory, and a rejected copy must not become a second expectation.
  if (isGoldenEntryFile(path)) throw new Error("la copia rechazada sería puntuada como entrada");
  return path;
};

/**
 * Saves the entry, unless saving would destroy a judgement.
 *
 * Both phases serialise the WHOLE entry back, and they write disjoint halves
 * of it — `expect` and `reviewerCriteria` in one, `humanVerdict` in the
 * other. So a reviewer who fills the expectation in one window while the
 * verdict form is open in another loses whichever saves first, silently. In
 * the one tool whose purpose is to preserve what a human decided, that is the
 * worst available failure.
 *
 * Merging is not the fix: this file holds prose and judgement, and a tool
 * guessing which version was meant would be a different way to lose it. So
 * the save refuses — but the answers just given are a judgement too, so they
 * go to a sibling file instead of the bin, and the reviewer reconciles two
 * real files rather than retyping a form from memory.
 */
function saveWithoutClobbering(
  path: string,
  openedWith: string,
  updated: GoldenEntry,
): void {
  // Missing counts as changed: someone moved it, and recreating it here
  // would undo that just as blindly as overwriting an edit.
  const current = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (current === openedWith) {
    writeEntry(path, updated);
    return;
  }

  const rejected = rejectedCopyPath(path);
  writeEntry(rejected, updated, REJECTED_HEADER);
  throw new Error(
    `${path} cambió mientras llenabas el formulario — no lo sobrescribí.\n` +
      `  Lo que acabas de responder está completo en:\n` +
      `    ${rejected}\n` +
      `  Compara las dos y quédate con la que valga.`,
  );
}
