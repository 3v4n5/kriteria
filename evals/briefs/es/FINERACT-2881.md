> Fuente: apache · https://issues.apache.org/jira/browse/FINERACT-2881

# FINERACT-2881 — El split de interés de sobregiro en ahorros ignora las transacciones posteriores al primer mes en periodos de contabilización trimestral, semestral o anual

**Tipo:** Bug · **Prioridad:** Major · **Componentes:** Savings

## Descripción

h3. Entorno / configuración

  * Producto de ahorro con *Allow overdraft* habilitado (límite de sobregiro y tasa de interés de sobregiro configurados)
  * Contabilidad: *Accrual (periodic)*, con una cuenta contable de *interest receivable* mapeada
  * Tasa de interés nominal anual: 10%
  * Periodo de capitalización de interés: diario
  * Periodo de contabilización de interés: *trimestral*
  * Interés calculado usando: saldo diario
  * Días en el año: 365
  * Configuración global \{{enable-business-date}} habilitada
  * Configuración global \{{allow-backdated-transaction-before-interest-posting}}: por defecto (habilitada)

  h3. Pasos para reproducir

  # Crear un cliente y una cuenta de ahorro con el producto de arriba.
  # Aprobar y activar la cuenta el 2025-01-01.
  # Depositar 10,000 el 2025-01-01.
  # Depositar 10,000 el 2025-02-15.
  # Poner la fecha de negocio en 2025-04-02.
  # Correr el job *Post Interest For Savings*.
  # Revisar el interés contabilizado para el periodo Q1 (2025-01-01 a 2025-03-31).

  h3. Resultado esperado

  El interés de Q1 cubre ambos saldos:
  * 10,000 desde 2025-01-01 hasta 2025-02-14 (45 días)
  * 20,000 desde 2025-02-15 hasta 2025-03-31 (45 días)

  Interés de Q1: *373.64*

  h3. Resultado actual

  Interés de Q1: *124.03*

  Es el interés de los primeros 10,000 únicamente para 2025-01-01 a 2025-02-14. El depósito del 2025-02-15 y el
  saldo
  del 2025-02-15 al 2025-03-31 no se incluyen. Faltante: *249.61* (cerca de dos tercios del interés
  esperado).

  h3. Diferencial

  El split de sobregiro / interés por cobrar aplica solo cuando la cuenta permite sobregiro *y* tiene una
  cuenta contable de
  interest receivable. Con los mismos datos de entrada pero sin sobregiro / interest receivable (la rama sin split de
  \{{SavingsAccountInterestPostingServiceImpl#calculateInterestUsing}}), el interés de Q1 es *373.64*, el
  valor esperado.

  Ambas cifras se reprodujeron con un test unitario que llama a
  \{{SavingsAccountInterestPostingServiceImpl#calculateInterestUsing}}
  con la configuración de arriba (fecha hasta 2025-04-02, MathContext precisión 10, HALF_EVEN).

  h3. Causa raíz

  {{fineract-savings/src/main/java/org/apache/fineract/portfolio/savings/service/SavingsAccountInterestPosti
  ngServiceImpl.java}},
  líneas 362-406, introducido en FINERACT-2312 (commit a6fa1adc99).

  \{{listForOverdraft}}, \{{listForInterestPosting}} e \{{isOverdraftAccount}} seleccionan las transacciones de un
  periodo de
  contabilización comparando únicamente el mes del calendario:

  \{code:java}
  periodInterval.startDate().getMonth() == tx.getDate().getMonth()
  \{code}

  Esto ignora el año y las fechas reales de inicio y fin del periodo de contabilización. Para un periodo trimestral que
  empieza en
  enero, solo se seleccionan las transacciones de enero. Las transacciones con fecha en febrero o marzo quedan excluidas, y
  como el saldo de cada transacción termina el día anterior a la siguiente transacción, los días posteriores a la última
  transacción seleccionada
  no cargan saldo en el periodo de contabilización.

  Lo mismo aplica a los periodos de contabilización semestral y anual.

  h3. Segundo síntoma (misma causa raíz, NO reproducido)

  La misma comparación de igualdad de mes también ignora el año. Cuando el historial de la cuenta abarca varios años
  (por ejemplo con \{{allow-backdated-transaction-before-interest-posting}} habilitado, donde se carga el historial
  completo de transacciones),
  las transacciones del mismo mes calendario de un año anterior se incluyen en las listas del periodo actual
  y en la clasificación de sobregiro / no sobregiro que hace \{{isOverdraftAccount}}. Esto puede
  clasificar mal un
  periodo como sobregiro o no sobregiro; una consecuencia posible es que el interés se contabilice con el tipo equivocado
  o
  se cuente dos veces para el mismo intervalo. Esto no se ha reproducido.

## Criterios de aceptación

_(el ticket no declara criterios de aceptación)_

## Comentarios

### Comentario 1

Estoy trabajando en esto, el PR viene en seguida.

### Comentario 2

Gracias por tomarlo, Adam. Ya tengo listo un arreglo y un test de regresión (el test unitario reproduce el diferencial de 373.64 vs 124.03 y pasa después del arreglo — reemplazando el filtro de igualdad de mes en listForOverdraft/listForInterestPosting/isOverdraftAccount por una validación de solapamiento de intervalos). Con gusto abro un PR para que lo revises, o te lo dejo a ti; como prefieras. Avísame.

### Comentario 3

[~namanrathi] Acabo de pasar esto a "In progress", pero eso me lo asigna a mí; ya me desasigné ;) 

Procede con tu PR, por favor.

### Comentario 4

Seguimiento: el defecto también afecta la contabilización mensual cuando la primera transacción de un periodo no cae el día 1 — en develop el camino con split contabiliza +24.56 donde se esperan −86.16. Las pruebas de integración existentes siempre ponen las transacciones el primer día del periodo, y por eso esto no se detectó. El PR cubre todas las frecuencias de contabilización.
