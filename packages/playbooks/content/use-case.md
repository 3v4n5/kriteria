---
id: pb-uc
technique: use-case
version: 1
title: Use Case Testing
summary: Walk the end-to-end flow a real actor performs, including the alternate and exception paths.
---

Use-case testing is the only black-box technique that tests the *sequence*.
Field-level techniques can all pass while the workflow is broken.

**Procedure**

1. Name the actor and the goal. A use case without an actor is a feature
   list, and it will not find integration defects.
2. Write the **main success scenario** as numbered steps with concrete data.
   Each step is an actor action and a system response.
3. Enumerate **alternate flows**: legitimate variations that still reach the
   goal (paying differently, skipping an optional step, editing a prior step).
4. Enumerate **exception flows**: what happens when a step fails — invalid
   input, a rejected authorisation, an unavailable dependency, an abandoned
   session. Each needs a stated expected recovery.
5. Check preconditions and postconditions explicitly. The postcondition is
   the assertion: what must be true in the system after the flow, not just
   what the last screen said.

**Traps**

- Testing only the happy path and calling the feature covered. Exception
  flows are where the defects are.
- Asserting on the confirmation message rather than on the state change
  behind it. A message can be right while the record is wrong.
- Losing the actor's permissions: the same flow run by a less-privileged
  actor is a different test, and often an untested one.
