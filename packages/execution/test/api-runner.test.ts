import { ApiStepSchema, type ApiStep, type DesignedCase } from "@kriteria/core";
import { describe, expect, it, vi } from "vitest";
import {
  MutationNotApprovedError,
  resolveJsonPath,
  runApiCase,
  runApiStep,
  MISSING,
  type HttpClient,
  type HttpRequest,
} from "../src/index.js";

/** Records requests and replies from a queue. */
function fakeHttp(
  responses: Partial<{ status: number; headers: Record<string, string>; body: string }>[],
): { http: HttpClient; requests: HttpRequest[] } {
  const requests: HttpRequest[] = [];
  const queue = [...responses];
  const http: HttpClient = async (req) => {
    requests.push(req);
    const next = queue.shift() ?? {};
    return { status: next.status ?? 200, headers: next.headers ?? {}, body: next.body ?? "{}" };
  };
  return { http, requests };
}

const step = (overrides: Partial<ApiStep> = {}): ApiStep => ({
  method: "GET",
  path: "/discount",
  assertions: [{ type: "status", equals: 200 }],
  ...overrides,
});

const ctx = { baseUrl: "https://staging.example.com/api" };

describe("resolveJsonPath", () => {
  const doc = { data: { items: [{ id: 7, name: "uno" }], total: 1 }, ok: true };

  it("walks dot and bracket notation", () => {
    expect(resolveJsonPath(doc, "data.items[0].id")).toBe(7);
    expect(resolveJsonPath(doc, "data.total")).toBe(1);
    expect(resolveJsonPath(doc, "ok")).toBe(true);
  });

  it("returns MISSING rather than throwing on absent paths", () => {
    expect(resolveJsonPath(doc, "data.items[5].id")).toBe(MISSING);
    expect(resolveJsonPath(doc, "nope.deep.path")).toBe(MISSING);
    expect(resolveJsonPath(doc, "")).toBe(MISSING);
  });

  it("distinguishes a null value from an absent one", () => {
    expect(resolveJsonPath({ a: null }, "a")).toBeNull();
    expect(resolveJsonPath({ a: null }, "b")).toBe(MISSING);
  });
});

describe("runApiStep", () => {
  it("resolves paths against the configured base URL", async () => {
    const { http, requests } = fakeHttp([{ status: 200 }]);
    await runApiStep(step({ query: { total: "100" } }), 0, ctx, {}, http);

    expect(requests[0]!.url).toBe("https://staging.example.com/api/discount?total=100");
  });

  it("applies caller-injected credentials to the request", async () => {
    const { http, requests } = fakeHttp([{ status: 200 }]);
    await runApiStep(
      step(),
      0,
      { ...ctx, headers: { authorization: "Bearer secreto" } },
      {},
      http,
    );

    expect(requests[0]!.headers["authorization"]).toBe("Bearer secreto");
  });

  describe("target-host safety", () => {
    it("refuses an absolute path before any traffic leaves", async () => {
      const { http, requests } = fakeHttp([{ status: 200 }]);
      const outcome = await runApiStep(
        step({ path: "https://evil.example.com/steal" }),
        0,
        ctx,
        {},
        http,
      );

      expect(outcome.result.status).toBe("fail");
      expect(outcome.result.actual).toContain("ruta absoluta rechazada");
      expect(requests).toHaveLength(0);
    });

    it("refuses a protocol-relative path too", async () => {
      const { http, requests } = fakeHttp([{ status: 200 }]);
      const outcome = await runApiStep(step({ path: "//evil.example.com/x" }), 0, ctx, {}, http);

      expect(outcome.result.status).toBe("fail");
      expect(requests).toHaveLength(0);
    });

    it("catches an absolute URL reintroduced through an extracted variable", async () => {
      const { http, requests } = fakeHttp([{ status: 200 }]);
      const outcome = await runApiStep(
        step({ path: "${next}" }),
        0,
        ctx,
        { next: "https://evil.example.com/steal" },
        http,
      );

      expect(outcome.result.status).toBe("fail");
      expect(requests).toHaveLength(0);
    });

    it("rejects an absolute path at schema level as well", () => {
      expect(
        ApiStepSchema.safeParse({
          method: "GET",
          path: "https://evil.example.com/x",
          assertions: [{ type: "status", equals: 200 }],
        }).success,
      ).toBe(false);
    });
  });

  describe("assertions", () => {
    it("passes when every assertion holds", async () => {
      const { http } = fakeHttp([{ status: 200, body: '{"rate":0.1}' }]);
      const outcome = await runApiStep(
        step({
          assertions: [
            { type: "status", equals: 200 },
            { type: "json-path", path: "rate", operator: "equals", value: 0.1 },
          ],
        }),
        0,
        ctx,
        {},
        http,
      );
      expect(outcome.result.status).toBe("pass");
    });

    it("reports every failing assertion, not just the first", async () => {
      const { http } = fakeHttp([{ status: 500, body: '{"rate":0}' }]);
      const outcome = await runApiStep(
        step({
          assertions: [
            { type: "status", equals: 200 },
            { type: "json-path", path: "rate", operator: "equals", value: 0.1 },
          ],
        }),
        0,
        ctx,
        {},
        http,
      );
      expect(outcome.result.status).toBe("fail");
      expect(outcome.result.actual).toContain("status esperado 200");
      expect(outcome.result.actual).toContain("json rate");
    });

    it("fails an absent json path instead of treating it as undefined equality", async () => {
      const { http } = fakeHttp([{ status: 200, body: "{}" }]);
      const outcome = await runApiStep(
        step({ assertions: [{ type: "json-path", path: "rate", operator: "exists" }] }),
        0,
        ctx,
        {},
        http,
      );
      expect(outcome.result.status).toBe("fail");
      expect(outcome.result.actual).toContain("no existe");
    });

    it("checks headers case-insensitively", async () => {
      const { http } = fakeHttp([{ status: 200, headers: { "Content-Type": "application/json" } }]);
      const outcome = await runApiStep(
        step({
          assertions: [
            { type: "header", name: "content-type", operator: "contains", value: "json" },
          ],
        }),
        0,
        ctx,
        {},
        http,
      );
      expect(outcome.result.status).toBe("pass");
    });

    it("treats a malformed regex as a failed assertion, never a crash", async () => {
      const { http } = fakeHttp([{ status: 200, body: '{"v":"abc"}' }]);
      const outcome = await runApiStep(
        step({
          assertions: [{ type: "json-path", path: "v", operator: "matches", value: "([" }],
        }),
        0,
        ctx,
        {},
        http,
      );
      expect(outcome.result.status).toBe("fail");
    });
  });

  it("records a transport failure as a failed step, not an exception", async () => {
    const http: HttpClient = async () => {
      throw new Error("timeout tras 15000ms");
    };
    const outcome = await runApiStep(step(), 0, ctx, {}, http);

    expect(outcome.result.status).toBe("fail");
    expect(outcome.result.actual).toContain("timeout");
  });

  describe("state mutation", () => {
    it("refuses a mutating request without human approval", async () => {
      const { http, requests } = fakeHttp([{ status: 201 }]);
      await expect(
        runApiStep(step({ method: "POST", path: "/orders" }), 0, ctx, {}, http),
      ).rejects.toThrow(MutationNotApprovedError);
      // Nothing was sent — the guard runs before the request.
      expect(requests).toHaveLength(0);
    });

    it("allows it once approved", async () => {
      const { http, requests } = fakeHttp([{ status: 201 }]);
      const outcome = await runApiStep(
        step({ method: "POST", path: "/orders", assertions: [{ type: "status", equals: 201 }] }),
        0,
        { ...ctx, mutationApproved: true },
        {},
        http,
      );
      expect(outcome.result.status).toBe("pass");
      expect(requests).toHaveLength(1);
    });

    it("does not gate read-only methods", async () => {
      const { http } = fakeHttp([{ status: 200 }]);
      await expect(runApiStep(step({ method: "GET" }), 0, ctx, {}, http)).resolves.toBeDefined();
    });
  });

  describe("evidence transcript", () => {
    it("masks credential headers", async () => {
      const { http } = fakeHttp([{ status: 200 }]);
      const outcome = await runApiStep(
        step(),
        0,
        { ...ctx, headers: { authorization: "Bearer token-secretisimo" } },
        {},
        http,
      );
      expect(outcome.transcript).not.toContain("token-secretisimo");
      expect(outcome.transcript).toContain("[REDACTED:header]");
    });

    it("redacts PII in response bodies with the ingest sanitizer", async () => {
      const { http } = fakeHttp([
        { status: 200, body: '{"email":"cliente@example.com","card":"4111111111111111"}' },
      ]);
      const outcome = await runApiStep(step(), 0, ctx, {}, http);

      expect(outcome.transcript).not.toContain("cliente@example.com");
      expect(outcome.transcript).toContain("[REDACTED:email]");
      expect(outcome.transcript).not.toContain("4111111111111111");
    });
  });
});

describe("runApiCase", () => {
  const designedCase = (steps: DesignedCase["steps"]): DesignedCase => ({
    id: "TC-1",
    title: "caso api",
    level: "system-integration",
    type: "functional",
    technique: "equivalence-partitioning",
    priority: "high",
    covers: ["FEA-1"],
    mitigates: [],
    verifies: [],
    preconditions: [],
    dataRequirements: [],
    steps,
    needsHuman: false,
  });

  it("chains steps through extracted variables", async () => {
    const { http, requests } = fakeHttp([
      { status: 200, body: '{"id":"ord-42"}' },
      { status: 200, body: '{"status":"paid"}' },
    ]);

    const outcome = await runApiCase(
      designedCase([
        {
          action: "crear",
          expected: "ok",
          api: step({ path: "/orders", extract: { orderId: "id" } }),
        },
        {
          action: "consultar",
          expected: "pagada",
          api: step({
            path: "/orders/${orderId}",
            assertions: [{ type: "json-path", path: "status", operator: "equals", value: "paid" }],
          }),
        },
      ]),
      ctx,
      http,
    );

    expect(requests[1]!.url).toContain("/orders/ord-42");
    expect(outcome.steps.every((s) => s.status === "pass")).toBe(true);
  });

  it("skips the steps after a failure — they assume it worked", async () => {
    const { http, requests } = fakeHttp([{ status: 500 }, { status: 200 }]);

    const outcome = await runApiCase(
      designedCase([
        { action: "uno", expected: "ok", api: step() },
        { action: "dos", expected: "ok", api: step() },
      ]),
      ctx,
      http,
    );

    expect(outcome.steps[0]!.status).toBe("fail");
    expect(outcome.steps[1]!.status).toBe("skipped");
    expect(outcome.steps[1]!.notes).toContain("un paso anterior falló");
    expect(requests).toHaveLength(1);
  });

  it("skips steps that carry no executable spec", async () => {
    const { http } = fakeHttp([]);
    const outcome = await runApiCase(
      designedCase([{ action: "revisar a ojo", expected: "se ve bien" }]),
      ctx,
      http,
    );

    expect(outcome.steps[0]).toMatchObject({ status: "skipped" });
    expect(outcome.steps[0]!.notes).toContain("no tiene especificación ejecutable");
  });
});
