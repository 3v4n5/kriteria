> Fuente: apache · https://issues.apache.org/jira/browse/FINERACT-2881

# FINERACT-2881 — Savings overdraft interest split ignores transactions after the first month of a quarterly,   bi-annual or annual posting period

**Tipo:** Bug · **Prioridad:** Major · **Componentes:** Savings

## Descripción

h3. Environment / configuration

  * Savings product with *Allow overdraft* enabled (overdraft limit and overdraft interest      rate set)
  * Accounting: *Accrual (periodic)*, with an *interest receivable* GL account mapped
  * Nominal annual interest rate: 10%
  * Interest compounding period: Daily
  * Interest posting period: *Quarterly*
  * Interest calculated using: Daily balance
  * Days in year: 365
  * Global configuration \{{enable-business-date}} enabled
  * Global configuration \{{allow-backdated-transaction-before-interest-posting}}: default (enabled)

  h3. Steps to reproduce

  # Create a client and a savings account on the product above.
  # Approve and activate the account on 2025-01-01.
  # Deposit 10,000 on 2025-01-01.
  # Deposit 10,000 on 2025-02-15.
  # Set the business date to 2025-04-02.
  # Run the *Post Interest For Savings* job.
  # Check the interest posted for the Q1 period (2025-01-01 to 2025-03-31).

  h3. Expected result

  Q1 interest covers both balances:
  * 10,000 from 2025-01-01 to 2025-02-14 (45 days)
  * 20,000 from 2025-02-15 to 2025-03-31 (45 days)

  Q1 interest: *373.64*

  h3. Actual result

  Q1 interest: *124.03*

  This is the interest on the first 10,000 for 2025-01-01 to 2025-02-14 only. The 2025-02-15 deposit and the
  balance
  from 2025-02-15 to 2025-03-31 are not included. Shortfall: *249.61* (about two-thirds of the expected
  interest).

  h3. Differential

  The overdraft/interest-receivable split applies only when the account allows overdraft *and* has an
  interest
  receivable GL account. With the same inputs but without overdraft/interest receivable (non-split branch of
  \{{SavingsAccountInterestPostingServiceImpl#calculateInterestUsing}}), Q1 interest is *373.64*, the
  expected value.

  Both figures were reproduced with a unit test calling
  \{{SavingsAccountInterestPostingServiceImpl#calculateInterestUsing}}
  with the configuration above (up-to date 2025-04-02, MathContext precision 10, HALF_EVEN).

  h3. Root cause

  {{fineract-savings/src/main/java/org/apache/fineract/portfolio/savings/service/SavingsAccountInterestPosti
  ngServiceImpl.java}},
  lines 362-406, introduced in FINERACT-2312 (commit a6fa1adc99).

  \{{listForOverdraft}}, \{{listForInterestPosting}} and \{{isOverdraftAccount}} select transactions for a
  posting
  period by comparing only the calendar month:

  \{code:java}
  periodInterval.startDate().getMonth() == tx.getDate().getMonth()
  \{code}

  This ignores the year and the posting period's actual start and end dates. For a quarterly period starting
  in
  January, only January transactions are selected. Transactions dated in February or March are excluded, and
  because each transaction's balance ends the day before the next transaction, the days after the last
  selected
  transaction carry no balance in the posting period.

  The same applies to bi-annual and annual posting periods.

  h3. Second symptom (same root cause, NOT reproduced)

  The same month-equality comparison also ignores the year. When account history spans multiple years
  (e.g. with \{{allow-backdated-transaction-before-interest-posting}} enabled, where the full transaction
  history is
  loaded), transactions from the same calendar month of an earlier year are included in the current period's
  lists and in the overdraft/non-overdraft classification made by \{{isOverdraftAccount}}. This can
  misclassify a
  period as overdraft or non-overdraft; a possible consequence is interest being posted with the wrong type
  or
  counted twice for the same interval. This has not been reproduced.

## Criterios de aceptación

_(el ticket no declara criterios de aceptación)_

## Comentarios

### Comentario 1

I'm working on this, PR to follow

### Comentario 2

Thanks for picking this up, Adam. I already have a fix and a regression test ready (the unit test reproduces the 373.64 vs 124.03 differential and passes after the fix -replacing the month-equality filter in listForOverdraft/listForInterestPosting/isOverdraftAccount with an interval-overlap check). Happy to open a PR for your review if that's useful, or to leave it with you -whichever you prefer. Let me know.

### Comentario 3

[~namanrathi] I have just moved this into "In progress" but that's assigning it to me, but i have unassigned already ;) 

Please proceed with your PR.

### Comentario 4

Follow-up: the defect also affects monthly posting when a period's first transaction isn't on the 1st  on develop the split path posts +24.56 where −86.16 is expected. The existing integration tests always place transactions on the first day of a period, which is why this wasn't caught. The PR covers all posting frequencies.
