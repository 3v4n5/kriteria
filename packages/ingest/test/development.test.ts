import { describe, expect, it } from "vitest";
import { extractDevelopment } from "../src/development.js";
import { normalizeJiraIssue } from "../src/jira.js";

describe("extractDevelopment", () => {
  it("reads branches, PRs and commits from the dev panel", () => {
    const dev = extractDevelopment({
      devStatus: {
        detail: [
          {
            branches: [
              {
                name: "feature/FR-1551-personal-info",
                repository: { url: "https://github.com/acme/frontend", name: "frontend" },
              },
            ],
            pullRequests: [
              {
                url: "https://github.com/acme/frontend/pull/482",
                status: "MERGED",
                repositoryUrl: "https://github.com/acme/frontend",
              },
            ],
            repositories: [
              {
                url: "https://github.com/acme/frontend",
                commits: [{ url: "https://github.com/acme/frontend/commit/abc123" }],
              },
            ],
          },
        ],
      },
    });

    expect(dev.branches).toEqual([
      { name: "feature/FR-1551-personal-info", repositoryUrl: "https://github.com/acme/frontend" },
    ]);
    expect(dev.pullRequests[0]).toMatchObject({ url: expect.stringContaining("/pull/482"), status: "MERGED" });
    expect(dev.commits).toHaveLength(1);
    expect(dev.repositoryUrls).toEqual(["https://github.com/acme/frontend"]);
    expect(dev.discoveredVia).toEqual(["dev-panel"]);
  });

  it("classifies remote links: PR paths become pull requests", () => {
    const dev = extractDevelopment({
      remoteLinks: [
        { object: { url: "https://gitlab.com/acme/api/merge_requests/17", title: "MR" } },
        { object: { url: "https://acme.atlassian.net/wiki/page" } },
      ],
    });

    expect(dev.pullRequests).toEqual([
      {
        url: "https://gitlab.com/acme/api/merge_requests/17",
        repositoryUrl: "https://gitlab.com/acme/api",
      },
    ]);
    expect(dev.discoveredVia).toEqual(["remote-link"]);
  });

  it("scans free text for repo URLs and dedupes repository roots", () => {
    const dev = extractDevelopment({
      texts: [
        "El fix está en https://github.com/acme/frontend/pull/99 revisen",
        "Repo base: https://github.com/acme/frontend y nada más",
      ],
    });

    expect(dev.pullRequests).toHaveLength(1);
    expect(dev.repositoryUrls).toEqual(["https://github.com/acme/frontend"]);
    expect(dev.discoveredVia).toEqual(["text-scan"]);
  });

  it("returns an empty structure when nothing is discoverable", () => {
    const dev = extractDevelopment({ texts: ["sin enlaces aquí"] });
    expect(dev.repositoryUrls).toEqual([]);
    expect(dev.discoveredVia).toEqual([]);
  });
});

describe("normalizeJiraIssue development integration", () => {
  it("carries dev-panel data into the TestBasis", () => {
    const { basis } = normalizeJiraIssue({
      key: "X-1",
      fields: { summary: "s", description: "see https://github.com/acme/api" },
      devStatus: {
        detail: [{ branches: [{ name: "fix/x-1", repository: { url: "https://github.com/acme/api" } }] }],
      },
    });

    expect(basis.development.branches[0]?.name).toBe("fix/x-1");
    expect(basis.development.repositoryUrls).toEqual(["https://github.com/acme/api"]);
    expect(basis.development.discoveredVia).toContain("dev-panel");
    expect(basis.development.discoveredVia).toContain("text-scan");
  });
});
