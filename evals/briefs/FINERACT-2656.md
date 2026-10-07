> Fuente: apache · https://issues.apache.org/jira/browse/FINERACT-2656

# FINERACT-2656 — Disbursing a loan with an account-transfer disbursement charge and no linked savings account throws NullPointerException (HTTP 500)

**Tipo:** Bug · **Prioridad:** Critical · **Componentes:** Loan

## Descripción

h3. Observed behavior

Disbursing a loan that has a charge configured as *due at disbursement* with {*}payment mode = "account transfer"{*}, when the loan has {*}no linked savings account{*}, returns HTTP 500 with a raw NPE:

java.lang.NullPointerException: Cannot invoke
"org.apache.fineract.portfolio.account.data.PortfolioAccountData.getId()"
because "savingAccountData" is null
    at org.apache.fineract.portfolio.loanaccount.service.LoanWritePlatformServiceJpaRepositoryImpl.disburseLoan(LoanWritePlatformServiceJpaRepositoryImpl.java:490)


h3. Expected behavior

The disbursement should fail with a clean domain validation error stating that a charge payable by account transfer requires a linked savings account — the same way the disburse-to-savings path already does ({{{}LinkedAccountRequiredException{}}}, HTTP 403/400 with {{{}error.msg.loan.<context>.requires.linked.account{}}}) — *not* an unhandled NullPointerException / HTTP 500.
h3. Steps to reproduce
 # Create a charge with *Charge time type = Disbursement* and {*}Charge payment mode = Account transfer{*}.
 # Attach that charge to a loan product / loan application, and *do not* configure a linked savings account on the loan.
 # Approve the loan, then {{POST /fineract-provider/api/v1/loans/\{loanId}?command=disburse}} with a normal disbursement body.
 # Observe HTTP 500 and the NPE above. The charge collection ({{{}isDueAtDisbursement && getChargePaymentMode().isPaymentModeAccountTransfer() && isChargePending(){}}}) is non-empty, so the code enters the transfer loop and dereferences the null linked-account.

h3. Root cause

{{LoanWritePlatformServiceJpaRepositoryImpl}} retrieves the loan's linked savings account inside the disbursement-charge transfer loop and dereferences it with {*}no null check{*}:
 
 
for (final Map.Entry<Long, BigDecimal> entrySet : disBuLoanCharges.entrySet()) {
    final PortfolioAccountData savingAccountData =
            this.accountAssociationsReadPlatformService.retriveLoanLinkedAssociation(loanId);
    ...
    final AccountTransferDTO accountTransferDTO = new AccountTransferDTO(actualDisbursementDate, entrySet.getValue(),
            PortfolioAccountType.SAVINGS, PortfolioAccountType.LOAN, savingAccountData.getId(), loanId, "Loan Charge Payment",
            ...);
    this.accountTransfersWritePlatformService.transferFunds(accountTransferDTO);
}
 
 
{{AccountAssociationsReadPlatformServiceImpl.retriveLoanLinkedAssociation(loanId)}} returns *null* when the loan has no {{LINKED_ACCOUNT_ASSOCIATION}} row (it catches {{EmptyResultDataAccessException}} and returns the null-initialised local). The code assumes a linked account always exists and calls {{savingAccountData.getId()}} → NPE.

The correct guard *already exists* elsewhere in the same class (disburse-to-savings, ~line 1718):

final PortfolioAccountData portfolioAccountData = this.accountAssociationsReadPlatformService
        .retriveLoanLinkedAssociation(loan.getId());
if (portfolioAccountData == null) {
    final String errorMessage = "Disburse Loan with id:" + loan.getId() + " requires linked savings account for payment";
    throw new LinkedAccountRequiredException("loan.disburse.to.savings", errorMessage, loan.getId());
}
h3. Affected code (same unguarded {{retriveLoanLinkedAssociation(...).getId()}} pattern)

All in {{{}org.apache.fineract.portfolio.loanaccount.service.LoanWritePlatformServiceJpaRepositoryImpl{}}}:
 * *{{disburseLoan(...)}}* — disbursement-charge transfer loop (the reported NPE).
 * *{{disburseLoan(...)}}* — down-payment auto-transfer standing-instruction block ({{{}if (isAccountTransfer && loan.shouldCreateStandingInstructionAtDisbursement()){}}}).
 * *{{undoLoanDisbursal(...)}}* — undo-disbursal charge transfer loop (mirror of the disburse loop).

And in {{org.apache.fineract.portfolio.loanaccount.jobs.transferfeechargeforloans.TransferFeeChargeForLoansTasklet}} — two {{retriveLoanLinkedAssociation(...)}} call sites in the charge-transfer loop, same missing null check.

{{}}

## Criterios de aceptación

_(el ticket no declara criterios de aceptación)_

## Comentarios

_(sin comentarios)_
