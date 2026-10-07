import { describe, expect, it } from "vitest";
import {
  fetchJiraIssue,
  hasCredentials,
  jiraEnvFromProcess,
  requestHeaders,
  type FetchLike,
  type JiraEnv,
} from "../src/jira-fetch.js";

/** Records the requests a fetch would have made, and replies with a script. */
function recorder(
  replies: { status?: number; body?: unknown }[],
): { fetch: FetchLike; calls: { url: string; headers: Record<string, string> }[] } {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const queue = [...replies];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const next = queue.shift() ?? { status: 200, body: {} };
    const status = next.status ?? 200;
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => next.body ?? {},
    } as Response;
  }) as FetchLike;
  return { fetch: fetchImpl, calls };
}

const ISSUE = { id: "1", key: "PUB-1", fields: { summary: "público" } };

describe("jiraEnvFromProcess", () => {
  it("requires only the base URL — a public tracker needs no token", () => {
    const env = jiraEnvFromProcess({ JIRA_BASE_URL: "https://issues.apache.org/jira" });
    expect(env.baseUrl).toBe("https://issues.apache.org/jira");
    expect(hasCredentials(env)).toBe(false);
  });

  it("still fails loudly without a base URL", () => {
    expect(() => jiraEnvFromProcess({})).toThrow(/JIRA_BASE_URL/);
  });

  it("keeps both halves when the full credential pair is set", () => {
    const env = jiraEnvFromProcess({
      JIRA_BASE_URL: "https://acme.atlassian.net/",
      JIRA_EMAIL: "qa@acme.test",
      JIRA_API_TOKEN: "t0ken",
    });
    expect(hasCredentials(env)).toBe(true);
    // Trailing slash is normalised away so URL building stays predictable.
    expect(env.baseUrl).toBe("https://acme.atlassian.net");
  });

  // Half a pair would Base64 as "email:" or ":token" — a malformed header most
  // instances answer with 401, replacing a working anonymous read with a
  // confusing failure. So it reads as anonymous instead.
  it.each([
    ["only the email", { JIRA_EMAIL: "qa@acme.test" }],
    ["only the token", { JIRA_API_TOKEN: "t0ken" }],
  ])("treats %s as no credentials at all", (_label, partial) => {
    const env = jiraEnvFromProcess({
      JIRA_BASE_URL: "https://issues.jenkins.io",
      ...partial,
    });
    expect(hasCredentials(env)).toBe(false);
    expect(env.email).toBeUndefined();
    expect(env.token).toBeUndefined();
  });

  it("rejects an API version outside the two that exist", () => {
    expect(() =>
      jiraEnvFromProcess({
        JIRA_BASE_URL: "https://acme.atlassian.net",
        JIRA_API_VERSION: "4",
      }),
    ).toThrow(/JIRA_API_VERSION/);
  });
});

describe("requestHeaders", () => {
  it("sends Basic auth when both halves are present", () => {
    const headers = requestHeaders({
      baseUrl: "https://acme.atlassian.net",
      email: "qa@acme.test",
      token: "t0ken",
    });
    expect(headers["Accept"]).toBe("application/json");
    expect(headers["Authorization"]).toBe(
      `Basic ${Buffer.from("qa@acme.test:t0ken").toString("base64")}`,
    );
  });

  it("omits Authorization entirely when there are no credentials", () => {
    const headers = requestHeaders({ baseUrl: "https://issues.apache.org/jira" });
    expect(headers).toEqual({ Accept: "application/json" });
  });

  it.each([
    ["email", { email: "qa@acme.test" }],
    ["token", { token: "t0ken" }],
  ])("omits Authorization when only the %s is set", (_label, partial) => {
    const headers = requestHeaders({
      baseUrl: "https://issues.jenkins.io",
      ...partial,
    });
    expect(headers["Authorization"]).toBeUndefined();
  });
});

describe("fetchJiraIssue", () => {
  const publicEnv: JiraEnv = {
    baseUrl: "https://issues.apache.org/jira",
    apiVersion: "2",
  };

  it("reads a public instance with no Authorization header", async () => {
    const { fetch: fetchImpl, calls } = recorder([{ body: ISSUE }]);

    const issue = await fetchJiraIssue("OFBIZ-13561", publicEnv, fetchImpl);

    expect(issue.key).toBe("PUB-1");
    expect(calls[0]!.headers["Authorization"]).toBeUndefined();
    expect(calls[0]!.headers["Accept"]).toBe("application/json");
    expect(calls[0]!.url).toContain("/rest/api/2/issue/OFBIZ-13561");
  });

  it("sends Basic auth on every request when credentials are configured", async () => {
    const { fetch: fetchImpl, calls } = recorder([{ body: ISSUE }]);

    await fetchJiraIssue(
      "ACME-1",
      { baseUrl: "https://acme.atlassian.net", email: "qa@acme.test", token: "t0ken" },
      fetchImpl,
    );

    // Including the best-effort dev-status and remote-link calls: a request
    // that silently dropped auth would read as "no development info".
    expect(calls.length).toBeGreaterThan(1);
    for (const call of calls) {
      expect(call.headers["Authorization"]).toMatch(/^Basic /);
    }
    expect(calls[0]!.url).toContain("/rest/api/3/issue/ACME-1");
  });

  it("does not send a half-built Basic header", async () => {
    const { fetch: fetchImpl, calls } = recorder([{ body: ISSUE }]);

    await fetchJiraIssue(
      "PUB-1",
      { baseUrl: "https://issues.jenkins.io", apiVersion: "2", email: "qa@acme.test" },
      fetchImpl,
    );

    for (const call of calls) {
      expect(call.headers["Authorization"]).toBeUndefined();
    }
  });

  it.each([401, 403])(
    "says the instance needs credentials on %i when reading anonymously",
    async (status) => {
      const { fetch: fetchImpl } = recorder([{ status }]);

      await expect(fetchJiraIssue("PUB-1", publicEnv, fetchImpl)).rejects.toThrow(
        /requires credentials.*JIRA_EMAIL.*JIRA_API_TOKEN/s,
      );
    },
  );

  it.each([401, 403])(
    "blames the configured credentials on %i when some were sent",
    async (status) => {
      const { fetch: fetchImpl } = recorder([{ status }]);

      await expect(
        fetchJiraIssue(
          "ACME-1",
          { baseUrl: "https://acme.atlassian.net", email: "qa@acme.test", token: "bad" },
          fetchImpl,
        ),
      ).rejects.toThrow(/rejected the configured credentials.*JIRA_EMAIL.*JIRA_API_TOKEN/s);
    },
  );

  // Self-hosted Jira answers REST v3 with a 302 to its login page. Following
  // it returns HTML and fails as a JSON parse error, which hides the cause.
  it("reports a redirect as a version mismatch instead of following it", async () => {
    const { fetch: fetchImpl } = recorder([{ status: 302 }]);

    await expect(
      fetchJiraIssue("OFBIZ-13561", { baseUrl: "https://issues.apache.org/jira" }, fetchImpl),
    ).rejects.toThrow(/JIRA_API_VERSION=2/);
  });

  it("defaults to v3 so existing Cloud configuration is unchanged", async () => {
    const { fetch: fetchImpl, calls } = recorder([{ body: ISSUE }]);

    await fetchJiraIssue("ACME-1", { baseUrl: "https://acme.atlassian.net" }, fetchImpl);

    expect(calls[0]!.url).toContain("/rest/api/3/issue/");
  });

  it("still reports a missing issue distinctly from an auth problem", async () => {
    const { fetch: fetchImpl } = recorder([{ status: 404 }]);

    await expect(fetchJiraIssue("PUB-404", publicEnv, fetchImpl)).rejects.toThrow(
      /not found/,
    );
  });
});
