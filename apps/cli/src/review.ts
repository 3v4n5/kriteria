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

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
import {
  GoldenEntrySchema,
  isExpectationBlank,
  isGoldenEntryFile,
  type GoldenEntry,
} from "@kriteria/evals";
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

/**
 * The two topic checklists.
 *
 * These questions used to be free text, and that quietly required the reviewer
 * to be a domain expert on whatever repository the ticket came from. The
 * corpus is public Apache and Jenkins issues: "what would you ask the author"
 * is unanswerable if you have never seen the module, and a question nobody can
 * answer is a field that stays empty — which is exactly where this corpus sat
 * for months.
 *
 * What a senior QA CAN judge from a hundred words of someone else's ticket is
 * structural: which of the things a test designer needs this ticket does not
 * say, and which generic failure modes this kind of change invites. So both
 * questions became checklists over those.
 *
 * The keyword behind each option is a constant written here by hand, exactly
 * like the Spanish labels for the ISTQB enums above. The reviewer still
 * supplies the judgement — which boxes — and no model writes into `expect`.
 * Typing a topic stays available for the case where the reviewer does know the
 * module and has something specific to say.
 */
interface TopicOption {
  /** Matched against the plan's prose by containment. See `mentions`. */
  readonly keyword: string;
  readonly label: string;
}

/** What the ticket does not say — becomes `ambiguityTopics`. */
const GAP_CHECKLIST: readonly TopicOption[] = [
  { keyword: "expected|esperado", label: "qué resultado se espera — dice qué está mal, no qué debería pasar" },
  { keyword: "reproduc", label: "cómo reproducirlo — los pasos, o el caso donde ocurre" },
  { keyword: "version|entorno|environment", label: "en qué versión o entorno pasa" },
  { keyword: "config|setting|parametr", label: "qué configuración hace falta para que ocurra" },
  { keyword: "scope|alcance", label: "hasta dónde llega el cambio — qué NO debería tocarse" },
  { keyword: "example|ejemplo|sample", label: "datos o valores concretos de ejemplo" },
  { keyword: "accept|criteri|verif", label: "cómo se verifica que quedó bien" },
  { keyword: "root cause|causa|why", label: "por qué pasa — la causa, no solo el síntoma" },
  { keyword: "impact|afecta|user", label: "a quién afecta y en qué flujo" },
];

/** How this kind of change tends to break — becomes `riskTopics`. */
const FAILURE_CHECKLIST: readonly TopicOption[] = [
  { keyword: "boundary|limit|limite|edge", label: "los bordes — vacío, cero, el máximo, lo muy largo" },
  { keyword: "invalid|malformed|invalido", label: "datos inválidos o mal formados" },
  { keyword: "regress|regresion", label: "que el arreglo rompa lo que ya funcionaba" },
  { keyword: "concurren|race|simultane", label: "concurrencia — dos cosas a la vez, orden de los eventos" },
  { keyword: "permission|role|authoriz|permiso", label: "permisos — quién puede ver o hacer qué" },
  { keyword: "performance|volume|rendimiento", label: "rendimiento con volumen real" },
  { keyword: "backward|compat|migrat", label: "compatibilidad con los datos o la configuración que ya existen" },
  { keyword: "integrat|integracion", label: "la integración con otro sistema o servicio" },
  { keyword: "error handling|failure|fallo", label: "qué pasa cuando algo falla — el manejo del error" },
  { keyword: "incomplete|partial|missed", label: "que el cambio se aplique en un camino y se olvide de otro" },
];

/**
 * A checklist of topics, with typing still allowed.
 *
 * Numbers pick from the list. Anything that is not a list of numbers is read
 * as topics typed by hand, so a reviewer who knows the module is never forced
 * through a generic menu to say something specific.
 */
async function pickTopics(
  ask: Ask,
  question: string,
  hint: string,
  options: readonly TopicOption[],
  current: readonly string[] = [],
): Promise<string[]> {
  console.log(`\n${question}`);
  console.log(`   ${hint}`);
  options.forEach((option, i) => {
    const mark = current.includes(option.keyword) ? " \u2190" : "";
    console.log(`   ${String(i + 1).padStart(2)}) ${option.label}${mark}`);
  });
  if (current.length > 0) console.log(`   actual: ${current.join(", ")}`);
  console.log("   (marca varias con coma, ej: 1,3,7 · Enter = ninguna)");
  // The matcher is plain containment, on purpose: a fuzzy match would turn a
  // real gap into a silent pass. The cost of that lands on anyone typing a
  // topic by hand, so it is said right where they would type it.
  console.log("   (o escríbelo tú: usa la raíz — block encuentra blocking y blocked)");

  for (;;) {
    const raw = (await ask("   > ")).trim();
    if (raw === "") return [...current];
    const parts = raw.split(/[,\s]+/).filter(Boolean);
    if (!parts.every((part) => /^\d+$/.test(part))) {
      return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    const picked = parts.map((part) => Number.parseInt(part, 10));
    const invalid = picked.filter((n) => n < 1 || n > options.length);
    if (invalid.length > 0) {
      console.log(
        `   \u26a0 fuera de rango: ${invalid.join(", ")} — usa 1 a ${options.length}, o escribe el tema`,
      );
      continue;
    }
    const chosen = new Set(picked);
    // In the table's own order, so the file is stable however it was typed.
    return options.filter((_, i) => chosen.has(i + 1)).map((option) => option.keyword);
  }
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
  /**
   * The short expectation form: five questions instead of ten.
   *
   * It drops the ones that cost judgement without buying much — and
   * deliberately drops `levels` and `types`, which are the two the engine
   * matched most easily, so the short form scores HARSHER than the long one,
   * not kinder. What it keeps is where the system and a human have actually
   * diverged: whether to design at all, depth, risk, and the questions a
   * reviewer would ask before touching a case.
   */
  short?: boolean;
  evalsDir?: string;
  outDir?: string;
  reviewer?: string;
  ask?: Ask;
  log?: (message: string) => void;
}

/** What a single form did, so a queue of them knows whether to continue. */
export type ReviewOutcome = "saved" | "unchanged" | "aborted";

export async function reviewCommand(
  options: ReviewCommandOptions,
): Promise<ReviewOutcome> {
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
        ? await expectPhase(
            ask,
            entry,
            join(evalsDir, "briefs", `${options.key}.md`),
            join(outDir, options.key),
            join(evalsDir, "baseline", `${options.key}.yml`),
            options.short === true,
          )
        : await verdictPhase(ask, entry, join(outDir, options.key), options.reviewer);
    if (!updated) {
      console.log("\n✗ sin cambios.");
      return "unchanged";
    }
    saveWithoutClobbering(goldenPath, openedWith, updated);
    console.log(`\n✓ guardado en ${goldenPath}`);
    if (options.phase === "expect") {
      console.log(
        `  Siguiente: cuando exista el plan, da tu veredicto con\n    pnpm qa review ${options.key} --verdict`,
      );
    }
    return "saved";
  } catch (error) {
    if (!(error instanceof EndOfInput)) throw error;
    console.log("\n✗ entrada agotada — no se guardó nada.");
    return "aborted";
  } finally {
    stdinAsker?.close();
  }
}

/**
 * Golden entries whose expectation nobody has filled, split by whether a
 * blind one is still possible.
 *
 * `blind` is the asset: a brief to read and no model output on disk, so the
 * expectation measures the system. `spent` already has a plan or a baseline,
 * and an expectation written now would be recorded `informed` and kept out
 * of the mechanical ratio — still worth having, but it is no longer the
 * thing the corpus exists for. `noBrief` has nothing to read.
 */
export function pendingExpectations(
  evalsDir: string,
  outDir: string,
): { blind: string[]; spent: string[]; noBrief: string[] } {
  const goldenDir = join(evalsDir, "golden");
  const blind: string[] = [];
  const spent: string[] = [];
  const noBrief: string[] = [];

  for (const file of readdirSync(goldenDir).filter(isGoldenEntryFile).sort()) {
    if (file.startsWith("_")) continue; // templates
    const entry = GoldenEntrySchema.parse(
      fromYaml(readFileSync(join(goldenDir, file), "utf8")),
    );
    if (!isExpectationBlank(entry.expect)) continue;
    const key = entry.workItem;
    if (!existsSync(join(evalsDir, "briefs", `${key}.md`))) {
      noBrief.push(key);
    } else if (
      existsSync(join(outDir, key, "testplan.yml")) ||
      existsSync(join(evalsDir, "baseline", `${key}.yml`))
    ) {
      spent.push(key);
    } else {
      blind.push(key);
    }
  }
  return { blind, spent, noBrief };
}

export interface PendingReviewOptions {
  evalsDir?: string;
  outDir?: string;
  /** The five-question form. See `ReviewCommandOptions.short`. */
  short?: boolean;
  /** Stop after this many tickets, so a session can be bounded up front. */
  limit?: number;
  ask?: Ask;
}

/**
 * Walk the unfilled expectations, one form after another.
 *
 * The queue exists because the bottleneck was never the engine — it is that
 * recording a judgement cost a decision about WHICH ticket plus a command
 * plus ten questions, and the corpus has sat at one filled entry out of
 * twenty for months. Here the reviewer picks nothing: the next blind ticket
 * comes up on its own, and stopping is always one keystroke away.
 */
export async function pendingReviewCommand(
  options: PendingReviewOptions = {},
): Promise<void> {
  const evalsDir = options.evalsDir ?? "evals";
  const outDir = options.outDir ?? "out";
  const { blind, spent, noBrief } = pendingExpectations(evalsDir, outDir);

  if (blind.length === 0) {
    console.log("\n✓ no queda ninguna expectativa ciega pendiente.");
    if (spent.length > 0) {
      console.log(
        `  ${spent.length} con salida de modelo ya en disco (${spent.join(", ")}):\n` +
          "    su expectativa ya no puede ser ciega. Se llenan una por una con\n" +
          "    qa review <KEY>, y quedan marcadas informed.",
      );
    }
    if (noBrief.length > 0) {
      console.log(`  ${noBrief.length} sin brief que leer: ${noBrief.join(", ")}`);
    }
    return;
  }

  const queue = options.limit ? blind.slice(0, options.limit) : blind;
  const stdinAsker = options.ask ? undefined : createAsker(process.stdin);
  const ask: Ask = options.ask ?? stdinAsker!.ask;

  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ${queue.length} expectativa(s) ciega(s) pendiente(s)`);
  console.log(`${"═".repeat(70)}`);
  console.log(
    "\n  Ninguna de estas tiene plan generado, así que lo que registres aquí\n" +
      "  mide al sistema de verdad. En cualquier momento: q para parar — lo\n" +
      "  que ya guardaste se queda guardado.",
  );

  let saved = 0;
  try {
    for (const [index, key] of queue.entries()) {
      console.log(`\n■ ${index + 1} de ${queue.length} — ${key}`);
      const outcome = await reviewCommand({
        key,
        phase: "expect",
        evalsDir,
        outDir,
        ask,
        ...(options.short === true ? { short: true } : {}),
      });
      if (outcome === "aborted") break;
      if (outcome === "saved") saved++;
      if (index === queue.length - 1) break;
      const more = await ask("\n¿Sigues con el siguiente? (Enter = sí · q = parar)\n   > ");
      if (more.trim().toLowerCase() === "q") break;
    }
  } catch (error) {
    if (!(error instanceof EndOfInput)) throw error;
  } finally {
    stdinAsker?.close();
  }

  console.log(`\n✓ ${saved} de ${queue.length} registradas.`);
  const left = blind.length - saved;
  if (left > 0) {
    console.log(
      `  ${left === 1 ? "queda 1 ciega" : `quedan ${left} ciegas`} — sigue con: pnpm qa review --pendientes`,
    );
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
  baselinePath: string,
  short = false,
): Promise<GoldenEntry | null> {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ${entry.workItem} — ¿qué habrías hecho tú?`);
  console.log(`${"═".repeat(70)}`);
  if (entry.rationale) console.log(`\n  Está en el set porque: ${entry.rationale}`);

  // Recorded, not just warned about. What model output was on disk is the
  // only part of "was this written blind" a tool can establish, and asking
  // the reviewer to self-report it would put the integrity of the number
  // back where it was: in someone's memory of what they did and did not open.
  //
  // A baseline counts for the same reason a plan does. It is a model's
  // judgement of this same brief, reached without the reviewer — reading one
  // first shapes the expectation exactly as reading the plan would, and it
  // is the more tempting of the two because it is short and answers the same
  // nine questions the form is about to ask.
  const priorOutput = [
    existsSync(join(planDir, "testplan.yml")) ? "un plan generado" : null,
    existsSync(baselinePath) ? "un baseline de modelo" : null,
  ].filter(Boolean);
  const planExisted = priorOutput.length > 0;
  if (planExisted) {
    console.log(
      `\n  ⚠ Ya existe ${priorOutput.join(" y ")} para este ticket. NO lo abras todavía:\n` +
        `    si llenas esto con eso a la vista, el puntaje deja de medir tu criterio.\n` +
        `    Queda anotado que ya estaba, así que este expect no entra al promedio\n` +
        `    de la suite — tus dimensiones se siguen mostrando una por una.`,
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
  // The short form skips this one, and it is the reason the short form is
  // worth having: on a corpus of real tickets most carry NO acceptance
  // criteria, so this prompt asks the reviewer to WRITE them in prose before
  // any of the scored questions. It is the most expensive thing in the form
  // and the only part `qa eval` never reads. A form nobody finishes measures
  // nothing, so in `--rapido` it waits for the long form.
  const reviewerCriteria = short
    ? entry.reviewerCriteria
    : await askLines(
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
  if (short) {
    console.log(
      "  (formulario corto: 5 preguntas, todas de opción múltiple — se contestan\n" +
        "   leyendo solo lo de arriba, sin conocer el código. Los criterios de\n" +
        `   aceptación y las demás te las pide el largo: qa review ${entry.workItem})`,
    );
  }
  console.log(`${"─".repeat(70)}`);

  const e = entry.expect;
  // Numbered by a counter, not by hand: the short form asks five of these and
  // the long one ten, and a hardcoded "3/10" is wrong in one of the two.
  const total = short ? 5 : 10;
  let asked = 0;
  const q = (text: string) => `${++asked}/${total} · ${text}`;
  // Asked first because every question after it presupposes a plan. On an
  // item too thin to design against, the honest answer is a list of
  // questions, and the engine can now give exactly that — so the form has
  // to be able to ask for it, or a correct refusal scores as a failure.
  const shouldDesign = await askYesNo(
    ask,
    q("¿Se pueden diseñar pruebas con lo que este ticket dice?") + "\n" +
      "   s = sí: alcanza para saber qué comprobarías y cómo sabrías que quedó bien\n" +
      "   n = no: el sistema debería negarse y pedir información, no inventar el escenario",
  );
  const approach = short
    ? e.approach
    : await pickOne(
        ask,
        q("¿Qué enfoque de prueba usarías como principal?"),
        TEST_APPROACHES,
        APPROACH_LABELS,
        e.approach,
      );
  const approachAlternatives =
    short || approach === undefined
      ? e.approachAlternatives
      : await pickMany(
          ask,
          q("¿Qué otros enfoques aceptarías como razonables?"),
          TEST_APPROACHES,
          APPROACH_LABELS,
          e.approachAlternatives,
        );
  // Risk first, then depth: in ISTQB the second follows from the first
  // (`riskLevelFromScore` then `depthForLevel`), and asking depth cold invites
  // an answer that contradicts the risk the same reviewer is about to give.
  const riskLevel = await pickOne(
    ask,
    q("Si esto sale mal en producción, ¿qué tan grave es?"),
    RISK_LEVELS,
    RISK_LABELS,
    e.riskLevel,
  );
  const depth = await pickOne(
    ask,
    q("Entonces, ¿cuánto esfuerzo de prueba merece?"),
    TEST_DEPTHS,
    DEPTH_LABELS,
    e.depth,
  );
  const levels = short
    ? e.levels
    : await pickMany(ask, q("¿En qué niveles DEBE haber pruebas?"), TEST_LEVELS, LEVEL_LABELS, e.levels);
  const types = short
    ? e.types
    : await pickMany(ask, q("¿Qué tipos de prueba DEBE incluir?"), TEST_TYPES, TYPE_LABELS, e.types);
  const mandatoryTechniques = short
    ? e.mandatoryTechniques
    : await pickMany(
        ask,
        q("¿Qué técnicas son NO negociables? (rechazarías el plan sin ellas)"),
        TEST_TECHNIQUES,
        TECHNIQUE_LABELS,
        e.mandatoryTechniques,
      );
  const ambiguityTopics = await pickTopics(
    ask,
    q("¿Qué le falta a este ticket?"),
    "Marca lo que el ticket NO dice. Eso es lo que el sistema debería preguntar.",
    GAP_CHECKLIST,
    e.ambiguityTopics,
  );
  const riskTopics = await pickTopics(
    ask,
    q("¿Qué te preocupa que se rompa?"),
    "No hace falta conocer el código: son las formas típicas en que esto falla.",
    FAILURE_CHECKLIST,
    e.riskTopics,
  );
  const minCases = short
    ? e.minCases
    : await askNumber(ask, "¿Mínimo de casos que considerarías sensato? (Enter = sin opinión)", e.minCases);
  const maxCases = short
    ? e.maxCases
    : await askNumber(ask, "¿Máximo?", e.maxCases);

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
    // `null` from the prompt is "no opinion", which the schema stores as
    // absent. `false` means a plan is owed, and that is an opinion.
    ...(shouldDesign !== null ? { shouldDecline: !shouldDesign } : {}),
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

  const blank = isExpectationBlank(entry.expect);

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

/**
 * A ticked box reads back as its label; a typed topic reads back as itself.
 *
 * Only the head of the label, up to the dash: the tail is the example that
 * made the option understandable in the list, and three of those joined by
 * commas in one summary line is unreadable.
 */
const describeTopic = (
  topic: string,
  options: readonly TopicOption[],
): string => {
  const found = options.find((option) => option.keyword === topic);
  return found ? (found.label.split(" \u2014 ")[0] ?? found.label) : topic;
};

function summarize(e: GoldenEntry["expect"]): string[] {
  const out: string[] = [];
  const show = (name: string, value: unknown) => {
    const empty =
      value === undefined || (Array.isArray(value) && value.length === 0);
    out.push(
      `${empty ? "◻️" : "✅"} ${name}: ${empty ? "sin evaluar" : Array.isArray(value) ? value.join(", ") : String(value)}`,
    );
  };
  show(
    "diseñar o declinar",
    // `false` is an opinion, so it must not render as "sin evaluar" the way
    // an absent field does — `show` treats undefined as absence, nothing else.
    e.shouldDecline === undefined
      ? undefined
      : e.shouldDecline
        ? "debería declinar"
        : "debería diseñar",
  );
  show("enfoque", e.approach);
  show("profundidad", e.depth);
  show("riesgo", e.riskLevel);
  show("niveles", e.levels);
  show("tipos", e.types);
  show("técnicas obligatorias", e.mandatoryTechniques);
  // Read back as what was ticked, not as the keyword stored. A reviewer who
  // just picked "cómo reproducirlo" should not have to recognise himself in
  // `reproduc` to check that the form understood him.
  show("ambigüedades", e.ambiguityTopics.map((t) => describeTopic(t, GAP_CHECKLIST)));
  show("riesgos", e.riskTopics.map((t) => describeTopic(t, FAILURE_CHECKLIST)));
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
