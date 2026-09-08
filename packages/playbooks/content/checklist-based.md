---
id: pb-cl
technique: checklist-based
version: 1
title: Checklist-Based Testing
summary: Apply a standing list of conditions the organisation has decided must always be verified.
---

The right technique for cross-cutting concerns that no single specification
owns: accessibility, security basics, responsiveness, localisation,
compatibility, and organisational conventions.

**Procedure**

1. Pick checklists by relevance to the change, not by habit. A backend-only
   change does not need the visual checklist; saying so is part of the work.
2. Each item must be a **verifiable condition**, not a topic. "Keyboard
   focus is visible on every interactive element" is checkable; "check
   accessibility" is not.
3. Record a verdict per item — pass, fail, or not-applicable **with a
   reason**. A silently skipped item reads as a pass.
4. Attach evidence for anything a reader would otherwise have to trust.
5. Feed the checklist from defect history: an item earns its place because
   something went wrong once, and items that never fire for a long time
   should be reviewed rather than carried forever.

**Traps**

- Checklists drift into ritual. If every item passes every time without
  thought, the list has stopped testing and started decorating.
- A long list encourages skimming. Prefer a short list that is genuinely run
  over a long one that is initialled.
- Checklist coverage is not requirement coverage; it complements
  specification-based design and never substitutes for it.
