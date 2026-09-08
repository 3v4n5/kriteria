---
id: pb-branch
technique: branch-coverage
version: 1
title: Branch / Decision Coverage
summary: Every decision taken both ways, so the untested path is not the one that ships broken.
---

Requires the repository. Stronger than statement coverage and the usual
white-box target for changed code.

**Procedure**

1. Identify every decision point in the changed units: `if`, `else`, ternary,
   loop conditions, `switch` cases, short-circuit operators, optional
   chaining, and every early return or guard clause.
2. Write cases so each decision evaluates **both** true and false. A guard
   clause with no test for the guarded case is the classic gap.
3. Cover the implicit branches: a missing `else`, a `switch` default, a
   `catch` block. Error handlers are branches, and they are usually the least
   tested code in a change.
4. Loops: zero iterations, one, and many. Zero is the one that finds the
   uninitialised accumulator.
5. Report the decisions you could not reach and why. An unreachable branch is
   either dead code or a defect in the condition.

**Traps**

- 100% branch coverage on a function whose *inputs* were never partitioned
  still misses boundary defects. White-box coverage complements black-box
  design; it does not replace it.
- Mocking the dependency that contains the real branching moves the untested
  logic somewhere the metric cannot see it.
- Async paths: a rejected promise or a timeout is a branch.
