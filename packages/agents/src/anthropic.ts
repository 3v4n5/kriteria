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
  /**
   * Workspace to bill and scope the request to.
   *
   * A user-scoped API key (`sk-ant-usr-…`) belongs to no workspace, so the
   * API rejects it with a 400 telling you to send this header. Supporting it
   * means such a key works without being regenerated — and for a future
   * multi-tenant deployment, it is how a run gets attributed to the right
   * workspace rather than to whatever the key happens to default to.
   */
  workspaceId?: string | undefined;
}

/**
 * Client options for a workspace id. Separated so the decision is testable
 * without constructing a real client or reading ambient credentials.
 *
 * An empty or whitespace-only value sends NO header: a blank
 * `ANTHROPIC_WORKSPACE_ID=` in a .env would otherwise produce an empty header
 * and a confusing 400 instead of the clear "not scoped to a workspace" one.
 */
export function clientOptions(
  workspaceId: string | undefined,
): { defaultHeaders?: Record<string, string> } {
  const trimmed = workspaceId?.trim();
  return trimmed
    ? { defaultHeaders: { "anthropic-workspace-id": trimmed } }
    : {};
}

export function createAnthropicCaller(
  options: AnthropicCallerOptions = {},
): CallModel {
  // Zero-arg options resolve ANTHROPIC_API_KEY / auth-token / profile.
  const client =
    options.client ??
    new Anthropic(
      clientOptions(options.workspaceId ?? process.env["ANTHROPIC_WORKSPACE_ID"]),
    );

  return async (req) => {
    // Plain format object (type + schema only): the SDK's AutoParseable
    // wrapper would auto-parse inside the stream helper and throw an opaque
    // error on truncated output before our stop_reason check can run.
    const autoFormat = zodOutputFormat(req.schema);
    const params = {
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      output_config: {
        effort: req.effort,
        format: { type: autoFormat.type, schema: autoFormat.schema },
      },
      messages: [{ role: "user" as const, content: req.user }],
    };

    // Stream above ~16k output tokens to stay clear of SDK HTTP timeouts.
    const response =
      req.maxTokens > 16000
        ? await client.messages.stream(params).finalMessage()
        : await client.messages.create(params);

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
