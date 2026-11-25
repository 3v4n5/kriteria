> Fuente: apache · https://issues.apache.org/jira/browse/FINERACT-2656

# FINERACT-2656 — Desembolsar un préstamo con un cargo de desembolso por transferencia entre cuentas y sin cuenta de ahorro vinculada lanza NullPointerException (HTTP 500)

**Tipo:** Bug · **Prioridad:** Critical · **Componentes:** Loan

## Descripción

h3. Comportamiento observado

Desembolsar un préstamo que tiene un cargo configurado como *debido al desembolso* con {*}modo de pago = "account transfer"{*}, cuando el préstamo {*}no tiene cuenta de ahorro vinculada{*}, devuelve HTTP 500 con un NPE crudo:

java.lang.NullPointerException: Cannot invoke
"org.apache.fineract.portfolio.account.data.PortfolioAccountData.getId()"
because "savingAccountData" is null
    at org.apache.fineract.portfolio.loanaccount.service.LoanWritePlatformServiceJpaRepositoryImpl.disburseLoan(LoanWritePlatformServiceJpaRepositoryImpl.java:490)


h3. Comportamiento esperado

El desembolso debería fallar con un error de validación de dominio limpio, que indique que un cargo pagadero por transferencia entre cuentas requiere una cuenta de ahorro vinculada — igual que ya lo hace el camino de desembolso-a-ahorros ({{{}LinkedAccountRequiredException{}}}, HTTP 403/400 con {{{}error.msg.loan.<context>.requires.linked.account{}}}) — y *no* con un NullPointerException sin manejar / HTTP 500.
h3. Pasos para reproducir
 # Crear un cargo con *Charge time type = Disbursement* y {*}Charge payment mode = Account transfer{*}.
 # Asociar ese cargo a un producto de préstamo / solicitud de préstamo, y *no* configurar una cuenta de ahorro vinculada en el préstamo.
 # Aprobar el préstamo y luego hacer {{POST /fineract-provider/api/v1/loans/\{loanId}?command=disburse}} con un cuerpo de desembolso normal.
 # Observar el HTTP 500 y el NPE de arriba. La colección de cargos ({{{}isDueAtDisbursement && getChargePaymentMode().isPaymentModeAccountTransfer() && isChargePending(){}}}) no está vacía, así que el código entra al loop de transferencia y desreferencia la cuenta vinculada nula.

h3. Causa raíz

{{LoanWritePlatformServiceJpaRepositoryImpl}} obtiene la cuenta de ahorro vinculada del préstamo dentro del loop de transferencia de cargos de desembolso y la desreferencia {*}sin validar null{*}:
 
 
for (final Map.Entry<Long, BigDecimal> entrySet : disBuLoanCharges.entrySet()) {
    final PortfolioAccountData savingAccountData =
            this.accountAssociationsReadPlatformService.retriveLoanLinkedAssociation(loanId);
    ...
    final AccountTransferDTO accountTransferDTO = new AccountTransferDTO(actualDisbursementDate, entrySet.getValue(),
            PortfolioAccountType.SAVINGS, PortfolioAccountType.LOAN, savingAccountData.getId(), loanId, "Loan Charge Payment",
            ...);
    this.accountTransfersWritePlatformService.transferFunds(accountTransferDTO);
}
 
 
{{AccountAssociationsReadPlatformServiceImpl.retriveLoanLinkedAssociation(loanId)}} devuelve *null* cuando el préstamo no tiene una fila {{LINKED_ACCOUNT_ASSOCIATION}} (captura {{EmptyResultDataAccessException}} y devuelve la variable local inicializada en null). El código asume que siempre existe una cuenta vinculada y llama a {{savingAccountData.getId()}} → NPE.

La guarda correcta *ya existe* en otra parte de la misma clase (desembolso-a-ahorros, ~línea 1718):

final PortfolioAccountData portfolioAccountData = this.accountAssociationsReadPlatformService
        .retriveLoanLinkedAssociation(loan.getId());
if (portfolioAccountData == null) {
    final String errorMessage = "Disburse Loan with id:" + loan.getId() + " requires linked savings account for payment";
    throw new LinkedAccountRequiredException("loan.disburse.to.savings", errorMessage, loan.getId());
}
h3. Código afectado (mismo patrón {{retriveLoanLinkedAssociation(...).getId()}} sin guarda)

Todo en {{{}org.apache.fineract.portfolio.loanaccount.service.LoanWritePlatformServiceJpaRepositoryImpl{}}}:
 * *{{disburseLoan(...)}}* — loop de transferencia de cargos de desembolso (el NPE reportado).
 * *{{disburseLoan(...)}}* — bloque de standing instruction de auto-transferencia del down-payment ({{{}if (isAccountTransfer && loan.shouldCreateStandingInstructionAtDisbursement()){}}}).
 * *{{undoLoanDisbursal(...)}}* — loop de transferencia de cargos al deshacer el desembolso (espejo del loop de desembolso).

Y en {{org.apache.fineract.portfolio.loanaccount.jobs.transferfeechargeforloans.TransferFeeChargeForLoansTasklet}} — dos puntos de llamada a {{retriveLoanLinkedAssociation(...)}} en el loop de transferencia de cargos, con la misma validación de null ausente.

{{}}

## Criterios de aceptación

_(el ticket no declara criterios de aceptación)_

## Comentarios

_(sin comentarios)_
