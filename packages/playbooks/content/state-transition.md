---
id: pb-st
technique: state-transition
version: 1
title: State Transition Testing
summary: Cover legal transitions and, above all, the illegal ones that must be refused.
---

Use when an entity has a lifecycle: statuses, approval flows, sessions,
carts, subscriptions, anything with "you cannot go from X to Y".

**Procedure**

1. Write the state list and the event list. Build the transition table:
   state × event → next state (or "rejected").
2. Cover **0-switch** first: every legal transition exercised once. This is
   the minimum bar; call it out when the budget stops you here.
3. Cover the **invalid** cells. A transition table's empty cells are its most
   valuable content — each one is a rule the code must enforce. Test that the
   attempt is refused, and that it is refused *without side effects*.
4. Test entry and exit: creation lands in the correct initial state, and
   terminal states genuinely accept nothing further.
5. At `thorough` depth or above, add **1-switch** coverage: every legal pair
   of consecutive transitions, which catches state that is not fully reset.

**Traps**

- Concurrency: the same event arriving twice, or two events racing. A retry
  or double-click is the cheapest way to find a missing idempotency guard.
- Backward transitions (re-opening a closed item) usually have unstated
  rules about what data is preserved or recalculated.
- A status field changed by a background job is a transition too, even
  though no user triggers it.
