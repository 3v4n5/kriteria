---
id: pb-exp
technique: exploratory
version: 1
title: Exploratory Testing (Session-Based)
summary: Time-boxed chartered investigation where designing and running tests happen together.
---

Not "clicking around". Session-based exploratory testing is structured,
chartered and reportable — and it is the right technique when the spec is too
weak to design against in advance.

**Procedure**

1. Write a **charter**: what area, what risk, what you are trying to learn.
   One or two sentences. "Explore the import flow with malformed files to
   discover error-handling gaps" — not "test the import".
2. Time-box the session (typically 45–90 minutes). One charter per session.
3. Take notes as you go: what you tried, what you observed, what surprised
   you, what you did not get to. The notes are the deliverable.
4. Split your attention deliberately between coverage (breadth) and
   investigation (following a smell). Say afterwards how the time divided.
5. Debrief: defects found, new risks identified, areas that now warrant
   scripted cases, and what remains unexplored.
6. Promote anything worth repeating into a scripted case. An exploratory
   finding that is never promoted will be found again by a customer.

**When to prefer it**

Weak or ambiguous specs, unfamiliar areas, post-fix confidence checks, and
any time the cost of designing cases upfront exceeds the cost of finding out.

**Traps**

Unreproducible reports. Capture the exact data, the sequence and the
environment as you go — reconstructing them afterwards rarely works.
