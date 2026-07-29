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

export const DEFAULT_ROUTING: Record<AgentRole, RouteConfig> = {
  analyst: { model: "claude-sonnet-5", effort: "high", maxTokens: 16000 },
  "risk-assessor": { model: "claude-sonnet-5", effort: "high", maxTokens: 16000 },
  designer: { model: "claude-sonnet-5", effort: "high", maxTokens: 16000 },
  critic: { model: "claude-opus-5", effort: "high", maxTokens: 16000 },
};
