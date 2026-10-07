> Fuente: apache · https://issues.apache.org/jira/browse/FINERACT-2836

# FINERACT-2836 — Isolate Due Savings Charge Failures

**Tipo:** Bug · **Prioridad:** Minor · **Componentes:** Charges, Job Scheduler, Savings

## Descripción

*As a* financial institution operator,
*I want* the Pay Due Savings Charges job to process each due charge installment independently and treat insufficient balance as a normal unpaid outcome,
*so that* collectable installments are processed without routine funding shortfalls causing the job to fail.

h2. Background

The *Pay Due Savings Charges* job may encounter savings accounts that cannot fund all due charge installments. This is an expected operational condition, particularly in large organizations, and does not indicate that the job itself has malfunctioned.

The job must preserve successfully collected installments, continue processing other eligible charges, and report unpaid installments durably. Validation, persistence, configuration, and unexpected errors must remain visible as job failures.

h2. Acceptance Criteria

* Each due savings-charge installment is processed in an independent transaction.
* Due installments of a recurring charge are processed in chronological order.
* A successfully collected installment remains committed regardless of the outcome of another installment.
* A successfully collected installment creates the expected savings-account charge-payment transaction.
* A successfully collected installment reduces the savings-account balance by the collected amount.
* A successfully collected recurring installment advances the charge to its next due date.
* When an account has insufficient balance for an installment:
** the installment remains outstanding;
** the charge's due date does not advance;
** further installments for that recurring charge are not processed during that execution;
** processing continues with other eligible charges;
** the job is not marked as failed solely because of the insufficient balance;
** a warning identifies the charge, savings account, installment due date, and reason;
** the unpaid installment is included in a durable per-execution report or metric.
* Existing insufficient-balance results and configured overdraft rules remain unchanged.
* Validation, persistence, configuration, and unexpected errors cause the job to be reported as failed.
* Job error details for fatal errors identify the affected charge or savings account, installment due date, and failure reason.
* Re-running the job resumes from the first unpaid installment without collecting previously committed installments again.
* When all eligible installments are collected or skipped only because of insufficient balance, the job is reported as successful.
* Automated tests cover:
** charges on funded and insufficiently funded savings accounts;
** a recurring charge for which some, but not all, overdue installments can be collected;
** preservation of successful payments, balance changes, transactions, and due-date advancement when a later installment is unpaid;
** continued processing of other eligible charges after an insufficient-balance result;
** durable counting or reporting of unpaid installments;
** failure of the job for validation and unexpected processing errors;
** successful execution when insufficient balance is the only issue;
** prevention of duplicate collection on re-execution;
** existing all-success behavior.

h2. Notes

* A non-recurring charge is treated as a single installment.
* The atomic boundary is one due savings-charge installment.
* Insufficient balance is an expected unpaid outcome, not a job execution error.
* Allowing scheduled charges to create or increase an overdraft is outside the scope of this story.
* Existing charge calculation, amount, frequency, and due-date rules remain unchanged.

## Criterios de aceptación

- **AC-1** Each due savings-charge installment is processed in an independent transaction.
- **AC-2** Due installments of a recurring charge are processed in chronological order.
- **AC-3** A successfully collected installment remains committed regardless of the outcome of another installment.
- **AC-4** A successfully collected installment creates the expected savings-account charge-payment transaction.
- **AC-5** A successfully collected installment reduces the savings-account balance by the collected amount.
- **AC-6** A successfully collected recurring installment advances the charge to its next due date.
- **AC-7** When an account has insufficient balance for an installment: the installment remains outstanding; the charge's due date does not advance; further installments for that recurring charge are not processed during that execution; processing continues with other eligible charges; the job is not marked as failed solely because of the insufficient balance; a warning identifies the charge, savings account, installment due date, and reason; the unpaid installment is included in a durable per-execution report or metric.
- **AC-8** Existing insufficient-balance results and configured overdraft rules remain unchanged.
- **AC-9** Validation, persistence, configuration, and unexpected errors cause the job to be reported as failed.
- **AC-10** Job error details for fatal errors identify the affected charge or savings account, installment due date, and failure reason.
- **AC-11** Re-running the job resumes from the first unpaid installment without collecting previously committed installments again.
- **AC-12** When all eligible installments are collected or skipped only because of insufficient balance, the job is reported as successful.
- **AC-13** Automated tests cover: charges on funded and insufficiently funded savings accounts; a recurring charge for which some, but not all, overdue installments can be collected; preservation of successful payments, balance changes, transactions, and due-date advancement when a later installment is unpaid; continued processing of other eligible charges after an insufficient-balance result; durable counting or reporting of unpaid installments; failure of the job for validation and unexpected processing errors; successful execution when insufficient balance is the only issue; prevention of duplicate collection on re-execution; existing all-success behavior.

## Comentarios

_(sin comentarios)_
