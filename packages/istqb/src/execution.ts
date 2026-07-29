/**
 * Execution routing — who runs each designed case.
 *
 * Executability is a per-case decision, not a product-level one. The designer
 * PROPOSES a mode; this router VALIDATES it against the tenant's actual
 * capabilities and degrades honestly — a case the system cannot run becomes a
 * guided checklist for a human, never a silent "could not execute".
 *
 * Deterministic on purpose: capabilities are facts, not judgement calls, and
 * the routing table must be auditable and identical across reruns.
 */

export const EXECUTION_MODES = [
  /** HTTP/API checks the system runs directly — no browser needed. */
  "auto-api",
  /** UI flows the system drives through a browser agent. */
  "auto-web",
  /** Test code the system writes into the tenant's repo (unit/component). */
  "auto-code",
  /** Step-by-step interactive checklist a human executes with evidence capture. */
  "guided-manual",
  /** White-box guidance for developers when the system cannot touch the repo. */
  "dev-guide",
  /** Human judgement required: visual quality, hardware, third parties, exploratory. */
  "human-only",
] as const;

export type ExecutionMode = (typeof EXECUTION_MODES)[number];

/**
 * What the tenant/project has actually configured and granted. Everything
 * defaults to absent: a fresh tenant routes everything to humans, and each
 * capability unlocked promotes cases toward autonomy.
 */
export interface ExecutionCapabilities {
  /** A reachable test-environment base URL for API calls. */
  apiEnvironment?: boolean;
  /** A reachable test-environment URL for browser flows. */
  webEnvironment?: boolean;
  /** Browser automation infrastructure is available (Playwright runner). */
  browserAutomation?: boolean;
  /** Read (or write) access to the repository under test. */
  repoAccess?: boolean;
  /** A test framework was detected in the repo (vitest, jest, junit...). */
  testFramework?: boolean;
}

export interface ExecutionRouteInput {
  /** Mode proposed by the designer; absent means "router decides". */
  proposed?: ExecutionMode | undefined;
  level: string;
  needsHuman: boolean;
  /** The case creates/updates/deletes data when executed. */
  mutatesState?: boolean | undefined;
}

export interface RoutedExecution {
  mode: ExecutionMode;
  /** True when the proposal had to be downgraded for missing capabilities. */
  degraded: boolean;
  /** Autonomous execution of a state-mutating case requires a human gate. */
  requiresGate: boolean;
  reason: string;
}

const COMPONENT_LEVELS = new Set(["component", "component-integration"]);

export function routeExecution(
  input: ExecutionRouteInput,
  caps: ExecutionCapabilities,
): RoutedExecution {
  const decide = (): Omit<RoutedExecution, "requiresGate"> => {
    // Human judgement is never automatable, whatever the proposal says.
    if (input.needsHuman || input.proposed === "human-only") {
      return {
        mode: "human-only",
        degraded: false,
        reason: "requires human judgement",
      };
    }

    const proposed = input.proposed ?? defaultProposal(input.level);

    switch (proposed) {
      case "auto-api":
        return caps.apiEnvironment
          ? { mode: "auto-api", degraded: false, reason: "API test environment available" }
          : degrade("guided-manual", "no API test environment configured");

      case "auto-web":
        return caps.browserAutomation && caps.webEnvironment
          ? { mode: "auto-web", degraded: false, reason: "browser automation and web environment available" }
          : degrade(
              "guided-manual",
              caps.webEnvironment
                ? "no browser automation infrastructure"
                : "no web test environment configured",
            );

      case "auto-code":
        return caps.repoAccess && caps.testFramework
          ? { mode: "auto-code", degraded: false, reason: "repo access and test framework detected" }
          : degrade(
              "dev-guide",
              caps.repoAccess ? "no test framework detected in repo" : "no repository access",
            );

      case "dev-guide":
        return { mode: "dev-guide", degraded: false, reason: "white-box guidance for developers" };

      case "guided-manual":
        return { mode: "guided-manual", degraded: false, reason: "interactive human checklist" };

      /* v8 ignore next 2 -- exhaustiveness guard */
      default:
        return { mode: "guided-manual", degraded: false, reason: "fallback" };
    }
  };

  const routed = decide();
  return {
    ...routed,
    // Autonomy + mutation = gate. Humans executing are their own gate.
    requiresGate:
      routed.mode.startsWith("auto") && (input.mutatesState ?? false),
  };
}

function degrade(
  mode: ExecutionMode,
  why: string,
): Omit<RoutedExecution, "requiresGate"> {
  return { mode, degraded: true, reason: `degraded: ${why}` };
}

/** When the designer did not propose: white-box levels go to code, rest to humans. */
function defaultProposal(level: string): ExecutionMode {
  return COMPONENT_LEVELS.has(level) ? "auto-code" : "guided-manual";
}
