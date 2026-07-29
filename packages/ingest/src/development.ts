/**
 * Development discovery — where does this work item's code live?
 *
 * Cascading sources, most reliable first:
 *  1. dev-panel: the tracker's development integration (branches/commits/PRs
 *     the team linked through its own workflow — Jira dev-status).
 *  2. remote-link: web links attached to the issue pointing at a repo host.
 *  3. text-scan: repo/PR URLs mentioned in the description or discussion.
 *
 * Every URL is recorded with how it was found, so downstream consumers (and
 * humans) can weigh trust accordingly.
 */

import type { DevelopmentInfo } from "@kriteria/core";

/** Raw Jira dev-status response (detail endpoint), defensively typed. */
export interface RawDevStatus {
  detail?: {
    branches?: {
      name?: string;
      url?: string;
      repository?: { url?: string; name?: string };
    }[];
    pullRequests?: {
      url?: string;
      status?: string;
      repositoryUrl?: string;
      repositoryName?: string;
    }[];
    repositories?: {
      url?: string;
      commits?: { url?: string }[];
    }[];
  }[];
}

export interface RawRemoteLink {
  object?: { url?: string; title?: string };
}

const REPO_HOST =
  /https?:\/\/(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)\/[\w.-]+\/[\w.-]+(?:\/[^\s)"'\]>]*)?/g;

const PR_PATH = /\/(?:pull|merge_requests|pull-requests)\/\d+/;

/** Trims a repo-host URL down to its repository root (host/org/repo). */
function repoRoot(url: string): string {
  const match = url.match(
    /https?:\/\/(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)\/[\w.-]+\/[\w.-]+/,
  );
  return (match?.[0] ?? url).replace(/\.git$/, "");
}

export function extractDevelopment(input: {
  devStatus?: RawDevStatus | undefined;
  remoteLinks?: RawRemoteLink[] | undefined;
  texts?: string[] | undefined;
}): DevelopmentInfo {
  const branches: DevelopmentInfo["branches"] = [];
  const pullRequests: DevelopmentInfo["pullRequests"] = [];
  const commits: DevelopmentInfo["commits"] = [];
  const repoUrls = new Set<string>();
  const via = new Set<"dev-panel" | "remote-link" | "text-scan">();

  // 1. Dev panel — the team's own linkage; highest trust.
  for (const detail of input.devStatus?.detail ?? []) {
    for (const b of detail.branches ?? []) {
      if (!b.name) continue;
      via.add("dev-panel");
      const repositoryUrl = b.repository?.url;
      branches.push({ name: b.name, ...(repositoryUrl ? { repositoryUrl } : {}) });
      if (repositoryUrl) repoUrls.add(repoRoot(repositoryUrl));
    }
    for (const pr of detail.pullRequests ?? []) {
      if (!pr.url) continue;
      via.add("dev-panel");
      pullRequests.push({
        url: pr.url,
        ...(pr.status ? { status: pr.status } : {}),
        ...(pr.repositoryUrl ? { repositoryUrl: pr.repositoryUrl } : {}),
      });
      repoUrls.add(repoRoot(pr.repositoryUrl ?? pr.url));
    }
    for (const repo of detail.repositories ?? []) {
      if (repo.url) {
        via.add("dev-panel");
        repoUrls.add(repoRoot(repo.url));
      }
      for (const c of repo.commits ?? []) {
        if (c.url) {
          via.add("dev-panel");
          commits.push({ url: c.url });
        }
      }
    }
  }

  // 2. Remote links attached to the issue.
  for (const link of input.remoteLinks ?? []) {
    const url = link.object?.url;
    if (!url) continue;
    const matches = url.match(REPO_HOST);
    if (!matches) continue;
    via.add("remote-link");
    if (PR_PATH.test(url)) pullRequests.push({ url, repositoryUrl: repoRoot(url) });
    repoUrls.add(repoRoot(url));
  }

  // 3. URL scan over the item's own text.
  for (const text of input.texts ?? []) {
    for (const url of text.match(REPO_HOST) ?? []) {
      via.add("text-scan");
      if (PR_PATH.test(url) && !pullRequests.some((p) => p.url === url)) {
        pullRequests.push({ url, repositoryUrl: repoRoot(url) });
      }
      repoUrls.add(repoRoot(url));
    }
  }

  return {
    branches,
    pullRequests,
    commits,
    repositoryUrls: [...repoUrls],
    discoveredVia: [...via],
  };
}
