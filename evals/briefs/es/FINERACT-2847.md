> Fuente: apache · https://issues.apache.org/jira/browse/FINERACT-2847

# FINERACT-2847 — Exponer el historial de asignación de transacciones para los cargos de cuentas de ahorro

**Tipo:** Improvement · **Prioridad:** Minor · **Componentes:** Charges

## Descripción

*Como* miembro del personal de una institución financiera,
*quiero* poder consultar las transacciones asociadas a un cargo individual de una cuenta de ahorro, incluyendo los montos asignados y las referencias de pago disponibles,
*para* poder explicar liquidaciones parciales, conciliar pagos y distinguir transacciones válidas de transacciones reversadas.

h2. Contexto

Los saldos de un cargo de cuenta de ahorro no explican por completo cómo se liquidó el cargo. El personal necesita identificar las transacciones asociadas y distinguir el monto total de cada transacción de la porción asignada al cargo seleccionado.

Esta distinción importa especialmente en pagos parciales y cargos recurrentes, donde las asignaciones históricas pueden no corresponder al monto actualmente debido. Los detalles de pago disponibles y las referencias de recibo ayudan al personal a conciliar la liquidación de cargos con registros de pago externos.

h2. Criterios de aceptación

* Un consumidor de API autorizado puede pedir, de forma opcional, el historial de asignación de transacciones al consultar un cargo individual de cuenta de ahorro.
* Cada entrada del historial identifica la transacción y la asignación, la fecha y el tipo de transacción, el monto total de la transacción, el monto asignado al cargo seleccionado y el estado de reversión.
* Varias liquidaciones parciales siguen siendo identificables de forma individual, con sus montos asignados respectivos.
* Las transacciones reversadas siguen visibles y están marcadas explícitamente como reversadas.
* Los detalles de pago disponibles incluyen el tipo de pago y la referencia de recibo, junto con cualquier información registrada de cuenta, cheque, routing y banco.
* Las transacciones sin detalles de pago siguen visibles; que falte información de pago no impide obtener el historial.
* El historial contiene solo las asignaciones del cargo y de la cuenta de ahorro solicitados. No se divulgan transacciones que pertenecen a otra cuenta.
* Obtener el historial de transacciones requiere permiso de lectura de cuenta de ahorro, además de la autorización de lectura de cargo que ya existe.
* El historial se devuelve del más nuevo al más antiguo, con un orden determinista para las entradas de una misma fecha.
* Un cargo sin asignaciones de transacciones asociadas devuelve una colección de historial vacía.
* Las peticiones que no piden el historial de transacciones conservan el comportamiento de respuesta actual.
* Obtener el historial no modifica los saldos del cargo, las transacciones, las asignaciones ni los detalles de pago.

h2. Notas

* El alcance es la API de lectura del cargo individual de cuenta de ahorro, con el historial solicitado mediante {{associations=transactions}} o {{associations=all}}.
* El historial refleja asignaciones de cargo registradas. No infiere pagos, condonaciones ni castigos a partir de diferencias de saldo.
* Los totales históricos de asignación no deben presentarse como el saldo pendiente actual de un cargo recurrente.
* Crear, cobrar, condonar, reversar o editar cargos queda fuera del alcance de esta historia.

## Criterios de aceptación

- **AC-1** Un consumidor de API autorizado puede pedir, de forma opcional, el historial de asignación de transacciones al consultar un cargo individual de cuenta de ahorro.
- **AC-2** Cada entrada del historial identifica la transacción y la asignación, la fecha y el tipo de transacción, el monto total de la transacción, el monto asignado al cargo seleccionado y el estado de reversión.
- **AC-3** Varias liquidaciones parciales siguen siendo identificables de forma individual, con sus montos asignados respectivos.
- **AC-4** Las transacciones reversadas siguen visibles y están marcadas explícitamente como reversadas.
- **AC-5** Los detalles de pago disponibles incluyen el tipo de pago y la referencia de recibo, junto con cualquier información registrada de cuenta, cheque, routing y banco.
- **AC-6** Las transacciones sin detalles de pago siguen visibles; que falte información de pago no impide obtener el historial.
- **AC-7** El historial contiene solo las asignaciones del cargo y de la cuenta de ahorro solicitados. No se divulgan transacciones que pertenecen a otra cuenta.
- **AC-8** Obtener el historial de transacciones requiere permiso de lectura de cuenta de ahorro, además de la autorización de lectura de cargo que ya existe.
- **AC-9** El historial se devuelve del más nuevo al más antiguo, con un orden determinista para las entradas de una misma fecha.
- **AC-10** Un cargo sin asignaciones de transacciones asociadas devuelve una colección de historial vacía.
- **AC-11** Las peticiones que no piden el historial de transacciones conservan el comportamiento de respuesta actual.
- **AC-12** Obtener el historial no modifica los saldos del cargo, las transacciones, las asignaciones ni los detalles de pago.

## Comentarios

_(sin comentarios)_
