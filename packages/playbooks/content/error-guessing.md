---
id: pb-eg
technique: error-guessing
version: 1
title: Error Guessing
summary: Attack the failure modes experience predicts, especially the ones the spec never mentions.
---

Experience-based and deliberately adversarial. Its value depends on being
systematic about what is usually a hunch.

**Procedure**

1. Build the attack list from known sources rather than inspiration: past
   defects in this area, the developer's own stated uncertainty, anything the
   spec left implicit, and the failure modes of the change type at hand.
2. Standard attacks worth trying on almost anything:
   - Empty, null, whitespace-only, and very long inputs.
   - Zero, negative, and maximum-magnitude numbers; numbers where text is
     expected and text where numbers are.
   - Duplicate submission: double-click, retry, replay.
   - Interruption: navigate away mid-flow, lose the connection, let the
     session expire, use the browser back button.
   - Concurrency: the same record edited from two places.
   - Special characters, mixed scripts, emoji, and right-to-left text in any
     field that will be displayed or exported later.
3. Record each guess with the reasoning behind it. An attack whose rationale
   you can state is reusable; a hunch is not.
4. Every defect found here is a candidate for a permanent case — promote it,
   or the same class of defect returns.

**Traps**

Error guessing that finds nothing is not proof of quality; it is a signal the
attack list was generic. Feed it real defect history to make it sharp.
