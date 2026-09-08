---
id: pb-mcdc
technique: modified-condition-decision-coverage
version: 1
title: Modified Condition / Decision Coverage (MC/DC)
summary: Show each sub-condition independently changes the outcome — for compound conditions in critical code.
---

Requires the repository. Reserve for safety-, money-, security- or
compliance-critical logic with compound conditions; it is expensive and
disproportionate elsewhere. Some regulated standards mandate it.

**Procedure**

1. Find decisions with compound conditions: `A && B`, `A || (B && C)`.
2. For each sub-condition, construct a **pair** of test cases that differ in
   that sub-condition only, and in which the overall decision outcome
   differs. That pair is the proof the sub-condition matters independently.
3. n conditions need roughly n+1 cases — far fewer than the 2^n of exhaustive
   testing, and far stronger than branch coverage.
4. Where you cannot construct such a pair, the sub-condition cannot affect
   the outcome: it is redundant, masked, or the condition is wrong. Report it
   as a finding.

**Traps**

- Short-circuit evaluation means a later sub-condition is not even evaluated
  in some rows; the pair must be built on rows where it actually is.
- Refactoring a compound condition into nested `if`s changes what the metric
  measures. Measure the code as it ships.
- MC/DC on logic that is not critical is budget spent where a decision table
  would have found more.
