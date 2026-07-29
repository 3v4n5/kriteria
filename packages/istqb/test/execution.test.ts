import { describe, expect, it } from "vitest";
import {
  routeExecution,
  type ExecutionCapabilities,
} from "../src/execution.js";

const NO_CAPS: ExecutionCapabilities = {};
const FULL_CAPS: ExecutionCapabilities = {
  apiEnvironment: true,
  webEnvironment: true,
  browserAutomation: true,
  repoAccess: true,
  testFramework: true,
};

describe("routeExecution", () => {
  it("routes everything to humans on a fresh tenant with no capabilities", () => {
    for (const proposed of ["auto-api", "auto-web"] as const) {
      const routed = routeExecution(
        { proposed, level: "system", needsHuman: false },
        NO_CAPS,
      );
      expect(routed.mode).toBe("guided-manual");
      expect(routed.degraded).toBe(true);
    }
  });

  it("honors autonomous proposals when capabilities exist", () => {
    expect(
      routeExecution({ proposed: "auto-api", level: "system-integration", needsHuman: false }, FULL_CAPS).mode,
    ).toBe("auto-api");
    expect(
      routeExecution({ proposed: "auto-web", level: "system", needsHuman: false }, FULL_CAPS).mode,
    ).toBe("auto-web");
    expect(
      routeExecution({ proposed: "auto-code", level: "component", needsHuman: false }, FULL_CAPS).mode,
    ).toBe("auto-code");
  });

  it("never automates a case that needs human judgement, whatever the proposal", () => {
    const routed = routeExecution(
      { proposed: "auto-web", level: "system", needsHuman: true },
      FULL_CAPS,
    );
    expect(routed.mode).toBe("human-only");
    expect(routed.degraded).toBe(false);
  });

  it("degrades auto-code to dev-guide, not to guided-manual", () => {
    // White-box work without repo access becomes developer guidance —
    // a QA checklist would be the wrong audience.
    const routed = routeExecution(
      { proposed: "auto-code", level: "component", needsHuman: false },
      { repoAccess: false },
    );
    expect(routed.mode).toBe("dev-guide");
    expect(routed.degraded).toBe(true);
    expect(routed.reason).toContain("no repository access");
  });

  it("distinguishes missing framework from missing repo access", () => {
    const routed = routeExecution(
      { proposed: "auto-code", level: "component", needsHuman: false },
      { repoAccess: true, testFramework: false },
    );
    expect(routed.mode).toBe("dev-guide");
    expect(routed.reason).toContain("no test framework");
  });

  it("requires web environment AND browser automation for auto-web", () => {
    const noBrowser = routeExecution(
      { proposed: "auto-web", level: "system", needsHuman: false },
      { webEnvironment: true },
    );
    expect(noBrowser.mode).toBe("guided-manual");
    expect(noBrowser.reason).toContain("browser automation");
  });

  it("defaults component levels to the code path and the rest to humans", () => {
    expect(
      routeExecution({ level: "component", needsHuman: false }, FULL_CAPS).mode,
    ).toBe("auto-code");
    expect(
      routeExecution({ level: "system", needsHuman: false }, NO_CAPS).mode,
    ).toBe("guided-manual");
  });

  describe("gates", () => {
    it("gates autonomous execution of state-mutating cases", () => {
      const routed = routeExecution(
        { proposed: "auto-api", level: "system-integration", needsHuman: false, mutatesState: true },
        FULL_CAPS,
      );
      expect(routed.mode).toBe("auto-api");
      expect(routed.requiresGate).toBe(true);
    });

    it("does not gate humans — they are their own gate", () => {
      const routed = routeExecution(
        { proposed: "guided-manual", level: "system", needsHuman: false, mutatesState: true },
        FULL_CAPS,
      );
      expect(routed.requiresGate).toBe(false);
    });

    it("does not gate read-only autonomous cases", () => {
      const routed = routeExecution(
        { proposed: "auto-api", level: "system", needsHuman: false, mutatesState: false },
        FULL_CAPS,
      );
      expect(routed.requiresGate).toBe(false);
    });
  });
});
