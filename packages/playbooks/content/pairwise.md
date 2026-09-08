---
id: pb-pw
technique: pairwise
version: 1
title: Pairwise (All-Pairs) Testing
summary: When many independent parameters combine, cover every pair instead of every combination.
---

Use when several parameters combine and exhaustive testing is impossible but
partition-per-input is too weak. Empirically, most combination defects
involve only two parameters interacting.

**Procedure**

1. List the parameters and their values. Keep each parameter's value list
   small — use equivalence partitioning to reduce it first. Pairwise on
   unreduced domains is still an explosion.
2. Generate a set of combinations such that every pair of values from every
   two parameters appears in at least one row.
3. State the coverage you achieved and, explicitly, what you did **not**:
   pairwise does not cover three-way interactions. Say so, so nobody reads
   the suite as exhaustive.
4. Add back, by hand, any combination that a known rule or a past defect
   makes suspicious. Pairwise is a floor, not a ceiling.

**Traps**

- Constrained combinations: some pairs are invalid together (a shipping
  method unavailable in a region). Encode the constraint, or the suite
  contains rows that cannot run.
- Parameters that are not independent do not belong here — a coupled rule is
  a decision table.
- A pairwise suite is unreadable without the generating table. Keep the
  parameter/value list next to the cases or nobody can maintain them.
