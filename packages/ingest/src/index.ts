/**
 * @kriteria/ingest — source adapters that normalize work items into TestBasis.
 *
 * Every adapter enforces the same boundary rules: sanitize first, drop person
 * identities, carry attachments by reference, validate the output through the
 * core schema. See sanitize.ts for the standards mapping.
 */

export * from "./sanitize.js";
export * from "./adf.js";
export * from "./acceptance-criteria.js";
export * from "./development.js";
export * from "./jira.js";
