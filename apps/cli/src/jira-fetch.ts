/**
 * Jira transport for the CLI: fetch one issue as raw JSON via REST v3.
 *
 * Normalization/sanitization lives in @kriteria/ingest — this file only moves
 * bytes. Credentials come from the environment and are never logged.
 *
 *   JIRA_BASE_URL   e.g. https://yourorg.atlassian.net
 *   JIRA_EMAIL      account email
 *   JIRA_API_TOKEN  API token (id.atlassian.com → Security → API tokens)
 */

import type {
  RawDevStatus,
  RawJiraIssue,
  RawRemoteLink,
} from "@kriteria/ingest";

export interface JiraEnv {
  baseUrl: string;
  email: string;
  token: string;
}

export function jiraEnvFromProcess(env = process.env): JiraEnv {
  const baseUrl = env["JIRA_BASE_URL"];
  const email = env["JIRA_EMAIL"];
  const token = env["JIRA_API_TOKEN"];
  const missing = [
    !baseUrl && "JIRA_BASE_URL",
    !email && "JIRA_EMAIL",
    !token && "JIRA_API_TOKEN",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(
      `missing environment variables for Jira access: ${missing.join(", ")}`,
    );
  }
  return { baseUrl: baseUrl!.replace(/\/$/, ""), email: email!, token: token! };
}

export async function fetchJiraIssue(
  key: string,
  env: JiraEnv,
): Promise<RawJiraIssue> {
  const url = `${env.baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}?expand=names&fields=summary,description,issuetype,priority,labels,components,updated,issuelinks,attachment,parent,subtasks,comment`;
  const auth = Buffer.from(`${env.email}:${env.token}`).toString("base64");

  const response = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });

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
    fetchDevStatus(issue.id, env),
    fetchRemoteLinks(key, env),
  ]);
  if (devStatus) issue.devStatus = devStatus;
  if (remoteLinks) issue.remoteLinks = remoteLinks;
  return issue;
}

function authHeaders(env: JiraEnv): Record<string, string> {
  const auth = Buffer.from(`${env.email}:${env.token}`).toString("base64");
  return { Authorization: `Basic ${auth}`, Accept: "application/json" };
}

/**
 * Jira's Development panel lives behind the dev-status API, keyed by numeric
 * issue id. One call per data type; failures return undefined silently.
 */
async function fetchDevStatus(
  issueId: string | undefined,
  env: JiraEnv,
): Promise<RawDevStatus | undefined> {
  if (!issueId) return undefined;
  const detail: NonNullable<RawDevStatus["detail"]> = [];
  for (const dataType of ["branch", "pullrequest", "repository"]) {
    try {
      const response = await fetch(
        `${env.baseUrl}/rest/dev-status/latest/issue/detail?issueId=${issueId}&applicationType=GitHub&dataType=${dataType}`,
        { headers: authHeaders(env) },
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
): Promise<RawRemoteLink[] | undefined> {
  try {
    const response = await fetch(
      `${env.baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}/remotelink`,
      { headers: authHeaders(env) },
    );
    if (!response.ok) return undefined;
    const links = (await response.json()) as RawRemoteLink[];
    return links.length > 0 ? links : undefined;
  } catch {
    return undefined;
  }
}
