/**
 * Real transport: Anthropic SDK with structured outputs.
 *
 * output_config.format (built from the Zod schema) makes the API enforce the
 * JSON shape server-side; the runner still validates with the full Zod schema
 * client-side because zodOutputFormat strips constraints the API does not
 * support (regex patterns, min lengths) — those are re-checked on our side,
 * and a violation triggers the runner's retry-with-errors loop.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { CallModel } from "./runner.js";

export interface AnthropicCallerOptions {
  /** Injected for tests; defaults to env-resolved credentials. */
  client?: Anthropic;
}

export function createAnthropicCaller(
  options: AnthropicCallerOptions = {},
): CallModel {
  // Zero-arg constructor resolves ANTHROPIC_API_KEY / auth-token / profile.
  const client = options.client ?? new Anthropic();

  return async (req) => {
    const response = await client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      output_config: {
        effort: req.effort,
        format: zodOutputFormat(req.schema),
      },
      messages: [{ role: "user", content: req.user }],
    });

    if (response.stop_reason === "refusal") {
      const category = response.stop_details?.category ?? "unspecified";
      throw new Error(
        `model declined the "${req.role}" request (refusal category: ${category})`,
      );
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error(
        `"${req.role}" output truncated at ${req.maxTokens} tokens — raise maxTokens for this role`,
      );
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    return {
      text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  };
}
