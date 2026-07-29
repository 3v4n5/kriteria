/**
 * Agent runner — one contract for every model call.
 *
 * The transport is injected (CallModel), so the pipeline is unit-testable
 * with a fake and the real Anthropic caller lives in one file. The runner
 * owns what must never differ between transports: schema validation of the
 * output and bounded retry-with-errors when validation fails.
 */

import type { z } from "zod/v4";
import type { AgentRole, Effort } from "./routing.js";

export interface ModelCallRequest {
  role: AgentRole;
  model: string;
  effort: Effort;
  maxTokens: number;
  system: string;
  user: string;
  /** Zod schema of the expected output; real caller turns it into output_config.format. */
  schema: z.ZodType;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ModelCallResponse {
  /** Raw model text — expected to be a single JSON document. */
  text: string;
  usage: ModelUsage;
}

export type CallModel = (req: ModelCallRequest) => Promise<ModelCallResponse>;

export interface AgentRunRecord {
  role: AgentRole;
  model: string;
  attempts: number;
  usage: ModelUsage;
}

export class AgentOutputError extends Error {
  constructor(
    public readonly role: AgentRole,
    public readonly attempts: number,
    public readonly lastError: string,
  ) {
    super(
      `agent "${role}" failed to produce schema-valid output after ${attempts} attempt(s): ${lastError}`,
    );
    this.name = "AgentOutputError";
  }
}

const MAX_ATTEMPTS = 3;

export async function runAgent<S extends z.ZodType>(
  req: Omit<ModelCallRequest, "schema"> & { schema: S },
  call: CallModel,
): Promise<{ output: z.infer<S>; record: AgentRunRecord }> {
  const usage: ModelUsage = { inputTokens: 0, outputTokens: 0 };
  let user = req.user;
  let lastError = "unknown";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await call({ ...req, user });
    usage.inputTokens += response.usage.inputTokens;
    usage.outputTokens += response.usage.outputTokens;

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.text);
    } catch (error) {
      lastError = `output was not valid JSON: ${(error as Error).message}`;
      user = retryPrompt(req.user, response.text, lastError);
      continue;
    }

    const result = req.schema.safeParse(parsed);
    if (result.success) {
      return {
        output: result.data,
        record: { role: req.role, model: req.model, attempts: attempt, usage },
      };
    }

    lastError = result.error.issues
      .slice(0, 10)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    user = retryPrompt(req.user, response.text, lastError);
  }

  throw new AgentOutputError(req.role, MAX_ATTEMPTS, lastError);
}

function retryPrompt(original: string, badOutput: string, errors: string): string {
  return `${original}

---
Your previous output failed schema validation. Errors:
${errors}

Previous output (fix it, do not start over unless required):
${badOutput.slice(0, 4000)}

Return ONLY the corrected JSON document.`;
}
