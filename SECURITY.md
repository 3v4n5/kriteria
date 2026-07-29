# Security & Data Protection

Kriteria ingests customer work items (tickets, documents, URLs) that routinely
contain personal data and — by accident — secrets. This document states the
rules the codebase enforces and the standards they map to. It is a living
document: each phase adds controls, none removes them.

## Principles

1. **Data protection by design** (GDPR art. 25). Controls live in code at the
   ingest boundary, not in policy documents. If a control can be a schema rule
   or a deterministic function, it must be.
2. **Data minimization** (GDPR art. 5(1)(c), ISO/IEC 27001 A.8). The pipeline
   analyzes *work items*, not *people*. Fields that identify people are dropped
   at ingest; free text is redacted before anything else touches it.
3. **Untrusted input is data, never instructions.** All source content
   (descriptions, comments, linked pages) is treated as analysis material.
   Prompt-injection resistance is a boundary property, not model behavior.
4. **No raw sensitive values downstream.** Nothing past the ingest boundary —
   storage, hashes, logs, model calls, UI — ever sees a redacted value.

## Controls implemented today (Fase 0)

| Control | Where | Standard |
|---|---|---|
| PII redaction: emails, phones, government ids | `@kriteria/ingest` `sanitize.ts` | GDPR art. 5, 25 |
| Payment card redaction with Luhn validation, last-4 retained | `sanitize.ts` | PCI-DSS req. 3 |
| Secret redaction: private keys, JWTs, AWS keys, `key=value` credentials | `sanitize.ts` | ISO 27001 A.8, OWASP secrets mgmt |
| Person identity stripping (reporters, assignees, comment authors, @mentions) | `jira.ts`, `adf.ts` | GDPR data minimization |
| Attachments carried by reference, never fetched or inlined at ingest | `jira.ts` | minimization |
| Content hashes computed over sanitized text only | `jira.ts` | avoids PII in derived artifacts |
| Redaction *reports* expose counts only, never values | `sanitize.ts` | safe observability |
| Discussion text schema-documented as untrusted | `@kriteria/core` `test-basis.ts` | injection defense |
| Domain isolation: engine/playbooks carry no customer knowledge | `@kriteria/istqb` contract | tenant isolation by construction |

## Known limits of the current pass

- Redaction is regex-based: strong on structured secrets and card data,
  weaker on unstructured PII (names in prose are NOT detected). NER-based
  detection is a Fase 1+ candidate — deliberately additive, never replacing
  the deterministic layer.
- Government-id coverage is US SSN only; other national id packs arrive with
  tenant configuration in Fase 1.
- IP addresses are not redacted (they are usually internal test environments
  in QA tickets; revisit for tenants that treat them as personal data).

## Committed for Fase 1+ (SaaS)

- Tenant isolation: `organization_id` + Postgres RLS on every table, verified
  by cross-tenant access tests (ISO 27001 A.5, SOC 2 CC6).
- Tenant credentials in a secrets manager, never in application tables.
- Encryption in transit (TLS) and at rest; evidence storage with scoped,
  expiring access (SOC 2 CC6.1/CC6.7).
- Audit log of every mutating integration call (SOC 2 CC7).
- Data retention limits and tenant data export/deletion (GDPR art. 17, 20).
- Sub-processor list and DPA template before onboarding external tenants.

## Reporting

Personal project in active development — report issues via GitHub issues on
this repository.
