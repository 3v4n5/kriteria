---
id: pb-dt
technique: decision-table
version: 1
title: Decision Table Testing
summary: Enumerate condition combinations for coupled business rules so no rule interaction goes untested.
---

Use this whenever an outcome depends on a **combination** of conditions.
Prose hides interactions; a table cannot.

**Procedure**

1. Extract the conditions (the inputs the rule reads) and the actions (what
   the system does). Keep them boolean or small-enumerated.
2. Build the full table: `2^n` columns for n boolean conditions. Build it
   fully first — you cannot see a gap in a table you never completed.
3. Collapse it. Mark impossible combinations as such (with the reason) and
   merge columns where a condition is genuinely irrelevant to the outcome.
   A collapsed table is the deliverable; the full one is the working step.
4. One test case per surviving column.
5. Every column whose expected action the spec does not state is an
   ambiguity. This is the technique's most valuable output: it finds the
   cases the author never considered, not just the ones they wrote down.

**Traps**

- Conditions that are not independent (B only meaningful when A is true)
  produce impossible columns. Say why they are impossible rather than
  deleting them silently.
- Priority/override rules ("A wins over B") need an explicit column where
  both are true, or the precedence is untested.
- When the table exceeds ~16 columns, the rule is probably two rules; split
  it, or switch to pairwise and say what that gives up.
