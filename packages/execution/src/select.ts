/**
 * Case selection and ordering for a guided run.
 *
 * Humans run the modes the router could not automate. Ordering is by risk:
 * if a session gets cut short, the cases that matter most are already done.
 */

import type { DesignedCase } from "@kriteria/core";
import type { ExecutionMode } from "@kriteria/istqb";

export const HUMAN_MODES: readonly ExecutionMode[] = [
  "guided-manual",
  "dev-guide",
  "human-only",
];

export interface RunnableCase {
  designed: DesignedCase;
  mode: ExecutionMode;
}

const PRIORITY_ORDER: Record<DesignedCase["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Cases the system executes on its own, in plan order. */
export function selectAutonomousCases(
  cases: readonly DesignedCase[],
  modeByCaseId: ReadonlyMap<string, ExecutionMode>,
  mode: ExecutionMode = "auto-api",
): RunnableCase[] {
  return cases
    .filter((c) => modeByCaseId.get(c.id) === mode)
    .map((designed) => ({ designed, mode }));
}

export function selectGuidedCases(
  cases: readonly DesignedCase[],
  modeByCaseId: ReadonlyMap<string, ExecutionMode>,
): RunnableCase[] {
  return cases
    .map((designed) => ({
      designed,
      mode: modeByCaseId.get(designed.id) ?? ("guided-manual" as ExecutionMode),
    }))
    .filter((c) => HUMAN_MODES.includes(c.mode))
    .sort((a, b) => {
      const byPriority =
        PRIORITY_ORDER[a.designed.priority] - PRIORITY_ORDER[b.designed.priority];
      if (byPriority !== 0) return byPriority;
      // Stable tiebreak on the numeric part of the case id.
      return caseNumber(a.designed.id) - caseNumber(b.designed.id);
    });
}

function caseNumber(id: string): number {
  return Number.parseInt(id.replace(/\D/g, ""), 10) || 0;
}
