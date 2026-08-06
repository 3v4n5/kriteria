/**
 * Autonomous API execution.
 *
 * This is the first code in Kriteria that touches a customer's system, so the
 * safety properties are structural rather than advisory:
 *
 *  - **The target host is configuration, never content.** Steps carry paths;
 *    the base URL comes from the environment config. A plan cannot redirect
 *    traffic, even if the model were manipulated into trying.
 *  - **Credentials come from the caller**, injected as headers here and never
 *    present in a case, a plan or an artifact.
 *  - **Mutating requests are gated upstream** by the execution router; this
 *    module refuses to run one unless the caller states it was approved.
 *  - **Recorded transcripts are sanitized** — API responses routinely carry
 *    PII, and evidence files are written to disk and shared.
 *
 * The HTTP client is injected, so every behaviour here is unit-testable
 * without a network.
 */

import {
  isMutating,
  type ApiAssertion,
  type ApiStep,
  type DesignedCase,
  type StepResult,
} from "@kriteria/core";
import { sanitizeText } from "@kriteria/ingest";
import { MISSING, resolveJsonPath } from "./json-path.js";

export interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string | undefined;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export type HttpClient = (req: HttpRequest, timeoutMs: number) => Promise<HttpResponse>;

export interface ApiRunContext {
  /** Base URL of the TEST environment. Required — there is no default. */
  baseUrl: string;
  /** Headers applied to every request (auth lives here, not in cases). */
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** True when the operator approved this case's state-mutating requests. */
  mutationApproved?: boolean;
}

export interface ApiStepOutcome {
  result: StepResult;
  /** Sanitized request/response transcript for the evidence file. */
  transcript: string;
  durationMs: number;
}

export class UnsafePathError extends Error {
  constructor(path: string) {
    super(
      `ruta absoluta rechazada: "${path}" — el host destino es configuración del tenant, no contenido del plan`,
    );
    this.name = "UnsafePathError";
  }
}

export class MutationNotApprovedError extends Error {
  constructor(method: string, path: string) {
    super(`${method} ${path} altera estado y no fue aprobado por un humano`);
    this.name = "MutationNotApprovedError";
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TRANSCRIPT_BODY = 4_000;

export async function runApiStep(
  step: ApiStep,
  index: number,
  ctx: ApiRunContext,
  variables: Record<string, string>,
  http: HttpClient,
): Promise<ApiStepOutcome> {
  if (isMutating(step) && !ctx.mutationApproved) {
    throw new MutationNotApprovedError(step.method, step.path);
  }

  let url: string;
  try {
    url = buildUrl(ctx.baseUrl, step, variables);
  } catch (error) {
    if (!(error instanceof UnsafePathError)) throw error;
    // Refused before any traffic leaves: recorded as a failed step.
    return {
      result: { index, status: "fail", actual: error.message },
      transcript: redact(`RECHAZADO: ${error.message}`),
      durationMs: 0,
    };
  }

  const headers: Record<string, string> = {
    ...(ctx.headers ?? {}),
    ...interpolateRecord(step.headers ?? {}, variables),
  };
  const body =
    step.body === undefined
      ? undefined
      : interpolate(JSON.stringify(step.body), variables);
  if (body !== undefined && !hasHeader(headers, "content-type")) {
    headers["content-type"] = "application/json";
  }

  const started = Date.now();
  let response: HttpResponse;
  try {
    response = await http(
      { method: step.method, url, headers, ...(body !== undefined ? { body } : {}) },
      ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
  } catch (error) {
    const durationMs = Date.now() - started;
    const reason = (error as Error).message;
    return {
      result: { index, status: "fail", actual: `la petición falló: ${reason}` },
      transcript: redact(`${step.method} ${url}\n\nERROR: ${reason}`),
      durationMs,
    };
  }
  const durationMs = Date.now() - started;

  const parsed = tryParseJson(response.body);
  const failures = step.assertions
    .map((assertion) => checkAssertion(assertion, response, parsed, durationMs))
    .filter((f): f is string => f !== null);

  const extracted = extractVariables(step, parsed);
  Object.assign(variables, extracted);

  return {
    result: {
      index,
      status: failures.length === 0 ? "pass" : "fail",
      actual:
        failures.length === 0
          ? `${response.status} en ${durationMs}ms — ${step.assertions.length} aserción(es) en verde`
          : failures.join("; "),
    },
    transcript: redact(
      [
        `${step.method} ${url}`,
        ...Object.entries(headers).map(([k, v]) => `> ${k}: ${maskSecret(k, v)}`),
        ...(body ? ["", `> ${truncate(body)}`] : []),
        "",
        `< ${response.status} (${durationMs}ms)`,
        ...Object.entries(response.headers).map(([k, v]) => `< ${k}: ${v}`),
        "",
        truncate(response.body),
      ].join("\n"),
    ),
    durationMs,
  };
}

export async function runApiCase(
  designed: DesignedCase,
  ctx: ApiRunContext,
  http: HttpClient,
): Promise<{ steps: StepResult[]; transcript: string; durationMs: number }> {
  const variables: Record<string, string> = {};
  const steps: StepResult[] = [];
  const transcripts: string[] = [];
  const started = Date.now();

  for (const [index, step] of designed.steps.entries()) {
    if (!step.api) {
      steps.push({
        index,
        status: "skipped",
        notes: "el paso no tiene especificación ejecutable",
      });
      continue;
    }

    const outcome = await runApiStep(step.api, index, ctx, variables, http);
    steps.push(outcome.result);
    transcripts.push(`### paso ${index + 1}\n${outcome.transcript}`);

    // A failed step invalidates the ones after it: they assume it worked.
    if (outcome.result.status === "fail") {
      for (let rest = index + 1; rest < designed.steps.length; rest++) {
        steps.push({
          index: rest,
          status: "skipped",
          notes: "no ejecutado: un paso anterior falló",
        });
      }
      break;
    }
  }

  return {
    steps,
    transcript: transcripts.join("\n\n"),
    durationMs: Date.now() - started,
  };
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

/** Returns a failure description, or null when the assertion holds. */
function checkAssertion(
  assertion: ApiAssertion,
  response: HttpResponse,
  parsed: unknown,
  durationMs: number,
): string | null {
  switch (assertion.type) {
    case "status":
      return response.status === assertion.equals
        ? null
        : `status esperado ${assertion.equals}, recibido ${response.status}`;

    case "response-time":
      return durationMs <= assertion.maxMs
        ? null
        : `tiempo de respuesta ${durationMs}ms excede el máximo ${assertion.maxMs}ms`;

    case "header": {
      const actual = findHeader(response.headers, assertion.name);
      if (assertion.operator === "exists") {
        return actual !== undefined ? null : `falta el header ${assertion.name}`;
      }
      if (actual === undefined) return `falta el header ${assertion.name}`;
      if (assertion.operator === "equals") {
        return actual === assertion.value
          ? null
          : `header ${assertion.name}: esperado "${assertion.value}", recibido "${actual}"`;
      }
      return actual.includes(assertion.value ?? "")
        ? null
        : `header ${assertion.name} no contiene "${assertion.value}"`;
    }

    case "json-path": {
      const actual = resolveJsonPath(parsed, assertion.path);
      const label = `json ${assertion.path}`;

      if (assertion.operator === "exists") {
        return actual !== MISSING ? null : `${label} no existe en la respuesta`;
      }
      if (assertion.operator === "absent") {
        return actual === MISSING ? null : `${label} existe y debía estar ausente`;
      }
      if (actual === MISSING) return `${label} no existe en la respuesta`;

      switch (assertion.operator) {
        case "equals":
          return actual === assertion.value
            ? null
            : `${label}: esperado ${JSON.stringify(assertion.value)}, recibido ${JSON.stringify(actual)}`;
        case "contains":
          return String(actual).includes(String(assertion.value))
            ? null
            : `${label} no contiene ${JSON.stringify(assertion.value)}`;
        case "matches":
          return safeMatch(String(actual), String(assertion.value))
            ? null
            : `${label} no coincide con /${assertion.value}/`;
        case "gt":
          return Number(actual) > Number(assertion.value)
            ? null
            : `${label}: ${JSON.stringify(actual)} no es mayor que ${JSON.stringify(assertion.value)}`;
        case "lt":
          return Number(actual) < Number(assertion.value)
            ? null
            : `${label}: ${JSON.stringify(actual)} no es menor que ${JSON.stringify(assertion.value)}`;
        /* v8 ignore next 2 -- exhaustiveness guard */
        default:
          return null;
      }
    }
  }
}

/** A malformed pattern fails the assertion; it never throws mid-run. */
function safeMatch(value: string, pattern: string): boolean {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the request URL against the configured base.
 *
 * `new URL(path, base)` silently IGNORES the base when `path` is absolute, so
 * a path of `https://elsewhere/…` would redirect traffic off the configured
 * host. The schema rejects that shape, and this is the second line of
 * defence: interpolated variables are checked too, since a captured value
 * could reintroduce an absolute URL after validation.
 */
function buildUrl(
  baseUrl: string,
  step: ApiStep,
  variables: Record<string, string>,
): string {
  const path = interpolate(step.path, variables);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path) || path.startsWith("//")) {
    throw new UnsafePathError(path);
  }
  const url = new URL(
    path.replace(/^\//, ""),
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
  );
  for (const [key, value] of Object.entries(step.query ?? {})) {
    url.searchParams.set(key, interpolate(value, variables));
  }
  return url.toString();
}

function interpolate(text: string, variables: Record<string, string>): string {
  return text.replace(/\$\{(\w+)\}/g, (match, name: string) =>
    name in variables ? variables[name]! : match,
  );
}

function interpolateRecord(
  record: Record<string, string>,
  variables: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).map(([k, v]) => [k, interpolate(v, variables)]),
  );
}

function extractVariables(step: ApiStep, parsed: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, path] of Object.entries(step.extract ?? {})) {
    const value = resolveJsonPath(parsed, path);
    if (value !== MISSING && value !== null && typeof value !== "object") {
      out[name] = String(value);
    }
  }
  return out;
}

function tryParseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some((k) => k.toLowerCase() === name.toLowerCase());
}

function findHeader(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

/** Auth headers never reach an artifact, even before content redaction. */
function maskSecret(name: string, value: string): string {
  return /authorization|api[-_]?key|token|cookie|secret/i.test(name)
    ? "[REDACTED:header]"
    : value;
}

function truncate(text: string): string {
  return text.length <= MAX_TRANSCRIPT_BODY
    ? text
    : `${text.slice(0, MAX_TRANSCRIPT_BODY)}\n… (${text.length - MAX_TRANSCRIPT_BODY} caracteres omitidos)`;
}

/** Same deterministic redaction as the ingest boundary. */
function redact(text: string): string {
  return sanitizeText(text).text;
}
