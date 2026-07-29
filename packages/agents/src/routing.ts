/**
 * Model routing — cost control as configuration, not improvisation.
 *
 * Each pipeline role gets the cheapest model that meets its quality bar.
 * The Strategist is deliberately absent: strategy selection is deterministic
 * code in @kriteria/istqb, so it costs zero tokens. The Critic gets Opus —
 * adversarial review is where model quality pays for itself.
 */

export const AGENT_ROLES = [
  "analyst",
  "risk-assessor",
  "designer",
  "critic",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface RouteConfig {
  model: string;
  effort: Effort;
  maxTokens: number;
}

/**
 * Cost-conscious defaults: Sonnet at medium effort (comparable to prior-gen
 * high, far fewer thinking tokens); Opus high only for the critic. The
 * designer gets extra output headroom — its output is the largest artifact —
 * and the transport streams above 16k to avoid HTTP timeouts.
 */
export const DEFAULT_ROUTING: Record<AgentRole, RouteConfig> = {
  analyst: { model: "claude-sonnet-5", effort: "medium", maxTokens: 12000 },
  "risk-assessor": { model: "claude-sonnet-5", effort: "medium", maxTokens: 8000 },
  // Largest budget: thinking + a 24-case JSON document share this cap, and
  // revision rounds carry extra input context.
  designer: { model: "claude-sonnet-5", effort: "medium", maxTokens: 32000 },
  // Opus thinking counts against max_tokens — the critic reviews the whole
  // chain, so it gets the largest budget; medium effort keeps thinking spend
  // bounded (Opus 5 medium is still a strong reviewer).
  critic: { model: "claude-opus-5", effort: "medium", maxTokens: 24000 },
};

/** USD per million tokens, for run-cost reporting. */
export const PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export function estimateCostUsd(
  model: string,
  usage: { inputTokens: number; outputTokens: number },
): number {
  const price = PRICING_PER_MTOK[model];
  if (!price) return 0;
  return (
    (usage.inputTokens / 1_000_000) * price.input +
    (usage.outputTokens / 1_000_000) * price.output
  );
}
