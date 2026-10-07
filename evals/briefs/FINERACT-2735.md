> Fuente: apache · https://issues.apache.org/jira/browse/FINERACT-2735

# FINERACT-2735 — Validate order query parameter on datatables endpoint against actual table columns

**Tipo:** Bug · **Prioridad:** Major

## Descripción

Currently, the {{order}} query parameter accepted by the datatables read endpoints ({{{}GET /datatables/\{datatable}/\{apptableId}{}}} and {{{}GET /datatables/\{datatable}/\{apptableId}/\{datatableId}{}}}) is passed through without sufficient validation. This ticket proposes validating {{order}} against the datatable's actual column list before it's used to build the query, consistent with how sorting is already restricted on the offices endpoint.

*Proposed behavior:*
 * {{order}} must reference a single column that exists on the target datatable (verified against the table's resolved column metadata).
 * An optional {{ASC}} / {{DESC}} direction token may follow the column name (case-insensitive).
 * Column names containing spaces or other characters must be quoted, using either double quotes ({{{}"Column Name"{}}}) or backticks ({{{}`Column Name`{}}}) — consistent with standard SQL identifier-quoting conventions across PostgreSQL, MySQL, and MariaDB. Quoting is optional for column names that don't require it.
 * Multiple columns (comma-separated) are not supported, matching the existing convention on the offices endpoint.
 * Requests with an {{order}} value that doesn't resolve to a real column, or that use invalid syntax, will be rejected with a clear error rather than silently ignored or passed through.
 * This behavior applies consistently to both affected endpoints, since they share the same underlying validation.

*Motivation:*
 * Brings datatables sorting behavior in line with the existing, simpler convention already used elsewhere (offices endpoint).
 * Improves input validation and predictability of API behavior.
 * Removes ambiguity around how column names containing spaces are interpreted in the {{order}} parameter.

*Acceptance criteria:*
 * Valid single-column {{order}} values (quoted or unquoted, with or without direction) return correctly sorted results on both endpoints.
 * {{order}} values referencing a non-existent column are rejected with an appropriate error response on both endpoints.
 * {{order}} values using unsupported syntax (multiple columns, malformed quoting, invalid direction token) are rejected with an appropriate error response on both endpoints.
 * Existing API consumers using single-column, unquoted, no-space column names for {{order}} continue to work unchanged.

## Criterios de aceptación

_(el ticket no declara criterios de aceptación)_

## Comentarios

_(sin comentarios)_
