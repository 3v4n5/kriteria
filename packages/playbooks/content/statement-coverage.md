---
id: pb-stmt
technique: statement-coverage
version: 1
title: Statement Coverage
summary: Every changed line executed at least once — the floor of white-box testing, never the goal.
---

Requires the repository. When there is no code access, this technique is not
applicable and the plan should say so rather than pretend.

**Procedure**

1. Scope to the **changed** units. Whole-codebase coverage is a project
   metric, not a test design technique for one work item.
2. For each changed function, write unit tests until every statement in it
   executes. Start from the paths the feature description implies.
3. Measure. An untested statement is either a missing case or dead code —
   both are findings worth reporting, and they need different fixes.
4. Report coverage as a number **and** name what is uncovered. "87%" tells
   the reader nothing about whether the uncovered 13% matters.

**What this does not give you**

Statement coverage says every line ran. It does not say the line was
*correct*, and it does not exercise the false branch of any condition. A
suite at 100% statement coverage can miss every boundary. Treat this as the
entry gate to branch coverage, and never as evidence of quality on its own.

**Traps**

- Tests that execute code without asserting on it inflate coverage and
  verify nothing. Every test needs an assertion that could fail.
- Generated or boilerplate code inflates the denominator; exclude it
  explicitly rather than quietly.
