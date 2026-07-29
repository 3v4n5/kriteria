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

import type { RawJiraIssue } from "@kriteria/ingest";

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
  return (await response.json()) as RawJiraIssue;
}
