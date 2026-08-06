/**
 * Executable API step — the machine-readable counterpart of a prose step.
 *
 * A designed step always carries `action`/`expected` for humans. When the
 * designer proposes `auto-api`, it ALSO emits this spec, so the same step has
 * two faithful representations and the critic can check they agree. Nothing
 * is parsed out of prose at execution time.
 *
 * Deliberately small vocabulary: every assertion here is deterministic and
 * checkable without judgement. Anything needing interpretation belongs in a
 * guided case, not an autonomous one.
 */

import { z } from "zod/v4";

export const HTTP_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** Methods that change server state — these require a human gate. */
export const MUTATING_METHODS: readonly HttpMethod[] = [
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
];

export const ApiAssertionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), equals: z.number().int().min(100).max(599) }),
  z.object({
    type: z.literal("json-path"),
    /** Dot/bracket path into the response body, e.g. `data.items[0].id`. */
    path: z.string().min(1),
    operator: z.enum(["equals", "contains", "exists", "absent", "matches", "gt", "lt"]),
    /** Expected value. Omitted for `exists` / `absent`. */
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  }),
  z.object({
    type: z.literal("header"),
    name: z.string().min(1),
    operator: z.enum(["equals", "contains", "exists"]),
    value: z.string().optional(),
  }),
  z.object({ type: z.literal("response-time"), maxMs: z.number().int().positive() }),
]);
export type ApiAssertion = z.infer<typeof ApiAssertionSchema>;

export const ApiStepSchema = z.object({
  method: z.enum(HTTP_METHODS),
  /**
   * Path relative to the environment's base URL. NEVER an absolute URL: the
   * target host is configuration, so a plan cannot redirect traffic anywhere.
   * May interpolate `${var}` captured by an earlier step.
   */
  path: z
    .string()
    .min(1)
    .refine((p) => !/^[a-z][a-z0-9+.-]*:\/\//i.test(p) && !p.startsWith("//"), {
      message:
        "la ruta debe ser relativa — una URL absoluta dejaría que el plan elija el host destino",
    }),
  query: z.record(z.string(), z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  assertions: z.array(ApiAssertionSchema).min(1),
  /** Capture values for later steps: variable name → json path. */
  extract: z.record(z.string(), z.string()).optional(),
});
export type ApiStep = z.infer<typeof ApiStepSchema>;

export function isMutating(step: ApiStep): boolean {
  return MUTATING_METHODS.includes(step.method);
}
