---
id: pb-bva
technique: boundary-value-analysis
version: 1
title: Boundary Value Analysis
summary: Test the edges of every ordered domain, including the ones the spec did not name.
---

Defects cluster at the edges of ordered domains. A partition tested only in
its middle is a partition not tested.

**Procedure**

1. List every ordered input: numbers, dates, times, lengths, counts, money,
   percentages. Include lengths of free-text fields — a string has an ordered
   domain even when its content does not.
2. For each, state the boundary the spec gives. If the spec is silent on a
   limit that must exist (a field has *some* maximum length), that silence is
   an ambiguity to raise, not a value to invent.
3. Use 3-value BVA at each boundary `b`: `b-1`, `b`, `b+1`. Drop to 2-value
   (`b`, `b+1`) only when the budget forces it, and say so.
4. Test both ends. An upper limit tested without its lower limit is half a
   test.
5. Cross the boundary from the invalid side too: the case that must be
   *rejected* is the one that catches a wrong comparison operator.

**What this catches that nothing else does**

`>` written where `>=` belonged. Off-by-one in pagination. A limit enforced
in the UI but not in the service behind it — so a boundary case must be run
at the level where the rule actually lives, not only where it is displayed.

**Traps**

- The spec's unit and the implementation's unit differ (characters vs bytes,
  inclusive vs exclusive end dates, timezone-dependent day boundaries).
- Zero, empty and negative are boundaries even when the spec never says so.
- A changed limit needs the OLD boundary tested too: data created under the
  previous rule still exists.
