/**
 * Test levels and test types in scope for a change.
 *
 * Answers "where do I test this, and what qualities do I test for" before any
 * case is designed. Keeping it separate from technique selection means a wrong
 * level is caught before it multiplies into dozens of misplaced cases.
 */

import type { StrategyContext } from "./strategy-matrix.js";
import { justified, type Justified, type TestLevel, type TestType } from "./types.js";

/**
 * Quality attributes of the change that the analyst can observe directly.
 * Kept separate from StrategyContext because these describe the SYSTEM, while
 * StrategyContext describes the SITUATION.
 */
export interface SystemTraits {
  hasUserFacingUi: boolean;
  handlesSensitiveData: boolean;
  performanceSensitive: boolean;
  /** Runs on several browsers, devices, OS versions or locales. */
  multiPlatform: boolean;
  /** Crosses a process/service boundary (API, queue, third-party). */
  crossesServiceBoundary: boolean;
  codeAccess: boolean;
}

export function recommendLevels(
  ctx: StrategyContext,
  system: SystemTraits,
): Justified<TestLevel>[] {
  const levels: Justified<TestLevel>[] = [];

  if (system.codeAccess && ctx.changeType !== "configuration") {
    levels.push(
      justified("component", "source code is available for the changed unit"),
    );
  }

  if (system.crossesServiceBoundary) {
    levels.push(
      justified(
        "system-integration",
        "the change crosses a service or third-party boundary",
      ),
    );
  } else if (system.codeAccess && ctx.touchesSharedComponent) {
    levels.push(
      justified(
        "component-integration",
        "a shared component is touched — verify its collaborators",
      ),
    );
  }

  levels.push(
    justified("system", "end-to-end behaviour must be verified as a whole"),
  );

  if (
    ctx.changeType === "new-feature" ||
    ctx.changeType === "enhancement" ||
    ctx.changeType === "data-migration"
  ) {
    levels.push(
      justified(
        "acceptance",
        `${ctx.changeType} requires business sign-off against acceptance criteria`,
      ),
    );
  }

  return levels;
}

export function recommendTypes(
  ctx: StrategyContext,
  system: SystemTraits,
): Justified<TestType>[] {
  const types: Justified<TestType>[] = [
    justified("functional", "always in scope"),
  ];

  if (ctx.changeType === "bug-fix") {
    types.push(
      justified(
        "confirmation",
        "a fix must be confirmed against the original reproduction steps",
      ),
    );
  }

  if (
    ctx.touchesSharedComponent ||
    ctx.hasRegressionSuite ||
    ctx.changeType === "refactor" ||
    ctx.changeType === "dependency-upgrade" ||
    ctx.changeType === "bug-fix"
  ) {
    types.push(
      justified(
        "regression",
        "existing behaviour is at risk and must be re-verified",
      ),
    );
  }

  if (
    system.handlesSensitiveData ||
    ctx.regulatory.length > 0 ||
    ctx.standards.some((s) => s.toUpperCase().includes("OWASP"))
  ) {
    types.push(
      justified(
        "security",
        system.handlesSensitiveData
          ? "the change handles sensitive data"
          : "a security standard or regulation applies",
      ),
    );
  }

  if (system.performanceSensitive) {
    types.push(
      justified("performance", "the change is on a performance-sensitive path"),
    );
  }

  if (system.hasUserFacingUi) {
    types.push(justified("usability", "the change is user facing"));
    if (ctx.standards.some((s) => s.toUpperCase().includes("WCAG"))) {
      types.push(
        justified("accessibility", "an accessibility standard is in force"),
      );
    }
  }

  if (system.multiPlatform) {
    types.push(
      justified(
        "compatibility",
        "the change ships to multiple platforms, browsers or locales",
      ),
    );
  }

  if (ctx.changeType === "data-migration") {
    types.push(
      justified(
        "reliability",
        "migrations must be verified for completeness and re-runnability",
      ),
    );
  }

  return types;
}
