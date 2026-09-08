---
id: pb-ep
technique: equivalence-partitioning
version: 1
title: Equivalence Partitioning
summary: Split each input into classes that should behave identically, then test one value per class.
---

Partitioning is how a finite suite claims to cover an infinite input space.
The claim only holds if the partitions are genuinely equivalent.

**Procedure**

1. For each input, divide the domain into classes where every member should
   produce the same outcome. Cover both valid and invalid classes — an
   invalid class with no case means an error path never runs.
2. Pick one representative per class. A second value from the same class adds
   cost and no information; if you believe it does add information, the class
   was wrong and must be split.
3. Partition **outputs** too, not just inputs. "Returns a discount" and
   "returns zero discount" are different classes even when the input is one
   continuous range.
4. Combine one class per input for the first pass. Only combine exhaustively
   where a rule genuinely couples two inputs — otherwise use pairwise.

**Where partitions are usually wrong**

- A class that mixes two code paths (e.g. "any registered user" when
  privileged users skip a validation) is two classes.
- Invalid classes get collapsed into one "bad input" case, hiding that each
  invalid reason returns a different message or status.
- Optional fields have three classes, not two: absent, empty, and populated.

**Pairs with**

Every partition boundary is a BVA candidate. Partition first, then take the
edges of each ordered class.
