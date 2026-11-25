> Fuente: apache · https://issues.apache.org/jira/browse/FINERACT-2836

# FINERACT-2836 — Aislar las fallas de cargos de ahorro vencidos

**Tipo:** Bug · **Prioridad:** Minor · **Componentes:** Charges, Job Scheduler, Savings

## Descripción

*Como* operador de una institución financiera,
*quiero* que el job Pay Due Savings Charges procese cada cuota de cargo vencida de forma independiente y trate el saldo insuficiente como un resultado normal de no pago,
*para* que las cuotas cobrables se procesen sin que una falta de fondos rutinaria haga fallar el job.

h2. Contexto

El job *Pay Due Savings Charges* puede encontrarse con cuentas de ahorro que no pueden fondear todas las cuotas de cargo vencidas. Esa es una condición operativa esperada, en particular en organizaciones grandes, y no indica que el job en sí haya fallado.

El job debe preservar las cuotas cobradas con éxito, seguir procesando los demás cargos elegibles, y reportar de forma durable las cuotas no pagadas. Los errores de validación, de persistencia, de configuración y los inesperados deben seguir siendo visibles como fallas del job.

h2. Criterios de aceptación

* Cada cuota de cargo de ahorro vencida se procesa en una transacción independiente.
* Las cuotas vencidas de un cargo recurrente se procesan en orden cronológico.
* Una cuota cobrada con éxito queda confirmada sin importar el resultado de otra cuota.
* Una cuota cobrada con éxito crea la transacción esperada de pago de cargo en la cuenta de ahorro.
* Una cuota cobrada con éxito reduce el saldo de la cuenta de ahorro por el monto cobrado.
* Una cuota recurrente cobrada con éxito avanza el cargo a su siguiente fecha de vencimiento.
* Cuando una cuenta tiene saldo insuficiente para una cuota:
** la cuota queda pendiente;
** la fecha de vencimiento del cargo no avanza;
** las demás cuotas de ese cargo recurrente no se procesan en esa ejecución;
** el procesamiento continúa con los otros cargos elegibles;
** el job no se marca como fallido solo por el saldo insuficiente;
** una advertencia identifica el cargo, la cuenta de ahorro, la fecha de vencimiento de la cuota y la razón;
** la cuota no pagada se incluye en un reporte o métrica durable por ejecución.
* Los resultados de saldo insuficiente que ya existen y las reglas de sobregiro configuradas no cambian.
* Los errores de validación, de persistencia, de configuración y los inesperados hacen que el job se reporte como fallido.
* Los detalles de error del job, para los errores fatales, identifican el cargo o la cuenta de ahorro afectados, la fecha de vencimiento de la cuota y la razón de la falla.
* Volver a correr el job retoma desde la primera cuota no pagada, sin cobrar de nuevo las cuotas ya confirmadas.
* Cuando todas las cuotas elegibles se cobran o se omiten únicamente por saldo insuficiente, el job se reporta como exitoso.
* Las pruebas automatizadas cubren:
** cargos en cuentas de ahorro con fondos y con fondos insuficientes;
** un cargo recurrente del cual se pueden cobrar algunas cuotas vencidas, pero no todas;
** la preservación de los pagos exitosos, los cambios de saldo, las transacciones y el avance de la fecha de vencimiento cuando una cuota posterior queda sin pagar;
** la continuación del procesamiento de los otros cargos elegibles después de un resultado de saldo insuficiente;
** el conteo o reporte durable de las cuotas no pagadas;
** la falla del job ante errores de validación y errores de procesamiento inesperados;
** la ejecución exitosa cuando el saldo insuficiente es el único problema;
** la prevención de cobro duplicado al volver a ejecutar;
** el comportamiento actual cuando todo sale bien.

h2. Notas

* Un cargo no recurrente se trata como una sola cuota.
* La frontera atómica es una cuota de cargo de ahorro vencida.
* El saldo insuficiente es un resultado de no pago esperado, no un error de ejecución del job.
* Permitir que los cargos programados creen o aumenten un sobregiro queda fuera del alcance de esta historia.
* Las reglas actuales de cálculo, monto, frecuencia y fecha de vencimiento de los cargos no cambian.

## Criterios de aceptación

- **AC-1** Cada cuota de cargo de ahorro vencida se procesa en una transacción independiente.
- **AC-2** Las cuotas vencidas de un cargo recurrente se procesan en orden cronológico.
- **AC-3** Una cuota cobrada con éxito queda confirmada sin importar el resultado de otra cuota.
- **AC-4** Una cuota cobrada con éxito crea la transacción esperada de pago de cargo en la cuenta de ahorro.
- **AC-5** Una cuota cobrada con éxito reduce el saldo de la cuenta de ahorro por el monto cobrado.
- **AC-6** Una cuota recurrente cobrada con éxito avanza el cargo a su siguiente fecha de vencimiento.
- **AC-7** Cuando una cuenta tiene saldo insuficiente para una cuota: la cuota queda pendiente; la fecha de vencimiento del cargo no avanza; las demás cuotas de ese cargo recurrente no se procesan en esa ejecución; el procesamiento continúa con los otros cargos elegibles; el job no se marca como fallido solo por el saldo insuficiente; una advertencia identifica el cargo, la cuenta de ahorro, la fecha de vencimiento de la cuota y la razón; la cuota no pagada se incluye en un reporte o métrica durable por ejecución.
- **AC-8** Los resultados de saldo insuficiente que ya existen y las reglas de sobregiro configuradas no cambian.
- **AC-9** Los errores de validación, de persistencia, de configuración y los inesperados hacen que el job se reporte como fallido.
- **AC-10** Los detalles de error del job, para los errores fatales, identifican el cargo o la cuenta de ahorro afectados, la fecha de vencimiento de la cuota y la razón de la falla.
- **AC-11** Volver a correr el job retoma desde la primera cuota no pagada, sin cobrar de nuevo las cuotas ya confirmadas.
- **AC-12** Cuando todas las cuotas elegibles se cobran o se omiten únicamente por saldo insuficiente, el job se reporta como exitoso.
- **AC-13** Las pruebas automatizadas cubren: cargos en cuentas de ahorro con fondos y con fondos insuficientes; un cargo recurrente del cual se pueden cobrar algunas cuotas vencidas, pero no todas; la preservación de los pagos exitosos, los cambios de saldo, las transacciones y el avance de la fecha de vencimiento cuando una cuota posterior queda sin pagar; la continuación del procesamiento de los otros cargos elegibles después de un resultado de saldo insuficiente; el conteo o reporte durable de las cuotas no pagadas; la falla del job ante errores de validación y errores de procesamiento inesperados; la ejecución exitosa cuando el saldo insuficiente es el único problema; la prevención de cobro duplicado al volver a ejecutar; el comportamiento actual cuando todo sale bien.

## Comentarios

_(sin comentarios)_
