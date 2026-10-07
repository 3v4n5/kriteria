> Fuente: apache · https://issues.apache.org/jira/browse/FINERACT-2847

# FINERACT-2847 — Expose transaction allocation history for savings account charges

**Tipo:** Improvement · **Prioridad:** Minor · **Componentes:** Charges

## Descripción

*As a* financial institution staff member,
*I want* to retrieve the transactions associated with an individual savings account charge, including allocated amounts and available payment references,
*so that* I can explain partial settlements, reconcile payments, and distinguish valid transactions from reversed ones.

h2. Background

A savings account charge’s balances do not provide a complete explanation of how the charge is settled. Staff need to identify the associated transactions and distinguish each transaction’s total amount from the portion allocated to the selected charge.

This distinction is particularly important for partial payments and recurring charges, where historical allocations may not correspond to the current amount due. Available payment details and receipt references help staff reconcile charge settlements with external payment records.

h2. Acceptance Criteria

* An authorized API consumer can optionally request transaction allocation history when retrieving an individual savings account charge.
* Each history entry identifies the transaction and allocation, transaction date and type, total transaction amount, amount allocated to the selected charge, and reversal status.
* Multiple partial settlements remain individually identifiable, with their respective allocated amounts.
* Reversed transactions remain visible and are explicitly marked as reversed.
* Available payment details include the payment type and receipt reference, together with any recorded account, check, routing, and bank information.
* Transactions without payment details remain visible; missing payment information does not prevent history retrieval.
* History contains only allocations for the requested charge and savings account. Transactions belonging to another account are not disclosed.
* Retrieving transaction history requires savings-account read permission in addition to the existing charge-read authorization.
* History is returned newest first, with deterministic ordering for entries on the same date.
* A charge without associated transaction allocations returns an empty history collection.
* Requests that do not ask for transaction history retain the existing response behavior.
* Retrieving history does not modify charge balances, transactions, allocations, or payment details.

h2. Notes

* The scope is the individual savings account charge read API, with history requested through {{associations=transactions}} or {{associations=all}}.
* History reflects recorded charge allocations. It does not infer payments, waivers, or write-offs from balance differences.
* Historical allocation totals must not be presented as the current outstanding balance of a recurring charge.
* Creating, collecting, waiving, reversing, or editing charges is outside this story’s scope.

## Criterios de aceptación

- **AC-1** An authorized API consumer can optionally request transaction allocation history when retrieving an individual savings account charge.
- **AC-2** Each history entry identifies the transaction and allocation, transaction date and type, total transaction amount, amount allocated to the selected charge, and reversal status.
- **AC-3** Multiple partial settlements remain individually identifiable, with their respective allocated amounts.
- **AC-4** Reversed transactions remain visible and are explicitly marked as reversed.
- **AC-5** Available payment details include the payment type and receipt reference, together with any recorded account, check, routing, and bank information.
- **AC-6** Transactions without payment details remain visible; missing payment information does not prevent history retrieval.
- **AC-7** History contains only allocations for the requested charge and savings account. Transactions belonging to another account are not disclosed.
- **AC-8** Retrieving transaction history requires savings-account read permission in addition to the existing charge-read authorization.
- **AC-9** History is returned newest first, with deterministic ordering for entries on the same date.
- **AC-10** A charge without associated transaction allocations returns an empty history collection.
- **AC-11** Requests that do not ask for transaction history retain the existing response behavior.
- **AC-12** Retrieving history does not modify charge balances, transactions, allocations, or payment details.

## Comentarios

_(sin comentarios)_
