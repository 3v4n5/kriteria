/**
 * Jira transport for the CLI: fetch one issue as raw JSON.
 *
 * Normalization/sanitization lives in @kriteria/ingest — this file only moves
 * bytes. Credentials come from the environment and are never logged.
 *
 *   JIRA_BASE_URL     e.g. https://yourorg.atlassian.net   (required)
 *   JIRA_EMAIL        account email                        (optional)
 *   JIRA_API_TOKEN    API token                            (optional)
 *   JIRA_API_VERSION  "3" (Atlassian Cloud, default) or "2" (Server/DC)
 *
 * **Credentials are optional** so public trackers can be read anonymously —
 * Apache, Jenkins and MongoDB all serve issues without a token, which is what
 * makes a golden set buildable from public data instead of customer data.
 *
 * Two rules keep anonymous access honest:
 *
 *  - Credentials are all-or-nothing. Half a pair (email without token, or the
 *    reverse) is treated as NO credentials, because sending `email:` or
 *    `:token` as Basic auth is a malformed header that most instances answer
 *    with 401 — a confusing failure in place of a working anonymous read.
 *  - Self-hosted Jira (Server/Data Center) has no REST v3: it answers v3 with
 *    a 302 to the login page. The version is therefore configuration, and a
 *    redirect is reported as a version mismatch rather than followed into an
 *    HTML page that fails to parse as JSON.
 */

import type {
  RawDevStatus,
  RawJiraIssue,
  RawRemoteLink,
} from "@kriteria/ingest";

export type JiraApiVersion = "2" | "3";

export interface JiraEnv {
  baseUrl: string;
  email?: string | undefined;
  token?: string | undefined;
  /** REST version: "3" for Atlassian Cloud, "2" for Server/Data Center. */
  apiVersion?: JiraApiVersion | undefined;
}

/** Injected in tests; defaults to the platform fetch. */
export type FetchLike = typeof fetch;

const ISSUE_FIELDS =
  "summary,description,issuetype,priority,labels,components,updated,issuelinks,attachment,parent,subtasks,comment";

export function jiraEnvFromProcess(env = process.env): JiraEnv {
  const baseUrl = env["JIRA_BASE_URL"];
  if (!baseUrl) {
    throw new Error(
      "missing environment variable for Jira access: JIRA_BASE_URL",
    );
  }

  const email = env["JIRA_EMAIL"];
  const token = env["JIRA_API_TOKEN"];
  const version = env["JIRA_API_VERSION"];
  if (version !== undefined && version !== "2" && version !== "3") {
    throw new Error(
      `JIRA_API_VERSION must be "2" (Server/Data Center) or "3" (Cloud), got "${version}"`,
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    // All-or-nothing: a half pair reads as anonymous, never as a broken header.
    ...(email && token ? { email, token } : {}),
    ...(version ? { apiVersion: version } : {}),
  };
}

/** True only when both halves of the credential pair are present. */
export function hasCredentials(env: JiraEnv): boolean {
  return Boolean(env.email && env.token);
}

export function requestHeaders(env: JiraEnv): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (hasCredentials(env)) {
    const auth = Buffer.from(`${env.email}:${env.token}`).toString("base64");
    headers["Authorization"] = `Basic ${auth}`;
  }
  return headers;
}

function apiBase(env: JiraEnv): string {
  return `${env.baseUrl}/rest/api/${env.apiVersion ?? "3"}`;
}

export async function fetchJiraIssue(
  key: string,
  env: JiraEnv,
  fetchImpl: FetchLike = fetch,
): Promise<RawJiraIssue> {
  const url = `${apiBase(env)}/issue/${encodeURIComponent(key)}?expand=names&fields=${ISSUE_FIELDS}`;

  const response = await fetchImpl(url, {
    headers: requestHeaders(env),
    // Not followed on purpose: a self-hosted instance redirects an
    // unsupported version to its login page, and following that yields HTML
    // that fails to parse with no hint about the real cause.
    redirect: "manual",
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      hasCredentials(env)
        ? `Jira rejected the configured credentials (${response.status}) fetching ${key} — check JIRA_EMAIL and JIRA_API_TOKEN`
        : `Jira instance requires credentials (${response.status}) fetching ${key} — set JIRA_EMAIL and JIRA_API_TOKEN, since this instance does not allow anonymous reads`,
    );
  }
  if (response.status >= 300 && response.status < 400) {
    throw new Error(
      `Jira redirected (${response.status}) fetching ${key} — REST v${env.apiVersion ?? "3"} is probably not served here; self-hosted Jira (Server/Data Center) needs JIRA_API_VERSION=2`,
    );
  }
  if (response.status === 404) {
    throw new Error(`Jira issue ${key} not found (or no permission to view it)`);
  }
  if (!response.ok) {
    throw new Error(`Jira API error ${response.status} fetching ${key}`);
  }
  const issue = (await response.json()) as RawJiraIssue;

  // Development panel + remote links: fetched best-effort — their absence
  // must never block planning, it only downgrades white-box capability.
  const [devStatus, remoteLinks] = await Promise.all([
    fetchDevStatus(issue.id, env, fetchImpl),
    fetchRemoteLinks(key, env, fetchImpl),
  ]);
  if (devStatus) issue.devStatus = devStatus;
  if (remoteLinks) issue.remoteLinks = remoteLinks;
  return issue;
}

/**
 * Jira's Development panel lives behind the dev-status API, keyed by numeric
 * issue id. One call per data type; failures return undefined silently.
 */
async function fetchDevStatus(
  issueId: string | undefined,
  env: JiraEnv,
  fetchImpl: FetchLike,
): Promise<RawDevStatus | undefined> {
  if (!issueId) return undefined;
  const detail: NonNullable<RawDevStatus["detail"]> = [];
  for (const dataType of ["branch", "pullrequest", "repository"]) {
    try {
      const response = await fetchImpl(
        `${env.baseUrl}/rest/dev-status/latest/issue/detail?issueId=${issueId}&applicationType=GitHub&dataType=${dataType}`,
        { headers: requestHeaders(env) },
      );
      if (!response.ok) continue;
      const body = (await response.json()) as RawDevStatus;
      detail.push(...(body.detail ?? []));
    } catch {
      // Integration not configured for this tracker — cascade continues.
    }
  }
  return detail.length > 0 ? { detail } : undefined;
}

async function fetchRemoteLinks(
  key: string,
  env: JiraEnv,
  fetchImpl: FetchLike,
): Promise<RawRemoteLink[] | undefined> {
  try {
    const response = await fetchImpl(
      `${apiBase(env)}/issue/${encodeURIComponent(key)}/remotelink`,
      { headers: requestHeaders(env) },
    );
    if (!response.ok) return undefined;
    const links = (await response.json()) as RawRemoteLink[];
    return links.length > 0 ? links : undefined;
  } catch {
    return undefined;
  }
}
