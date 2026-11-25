> Fuente: apache · https://issues.apache.org/jira/browse/FINERACT-2735

# FINERACT-2735 — Validar el query parameter order del endpoint de datatables contra las columnas reales de la tabla

**Tipo:** Bug · **Prioridad:** Major

## Descripción

Hoy, el query parameter {{order}} que aceptan los endpoints de lectura de datatables ({{{}GET /datatables/\{datatable}/\{apptableId}{}}} y {{{}GET /datatables/\{datatable}/\{apptableId}/\{datatableId}{}}}) se pasa sin validación suficiente. Este ticket propone validar {{order}} contra la lista real de columnas del datatable antes de usarlo para construir la consulta, igual que el ordenamiento ya está restringido en el endpoint de offices.

*Comportamiento propuesto:*
 * {{order}} debe referenciar una única columna que exista en el datatable destino (verificado contra los metadatos de columnas resueltos de la tabla).
 * Puede seguir un token de dirección {{ASC}} / {{DESC}} opcional después del nombre de la columna (sin distinguir mayúsculas).
 * Los nombres de columna que contengan espacios u otros caracteres deben ir entre comillas, usando comillas dobles ({{{}"Column Name"{}}}) o backticks ({{{}`Column Name`{}}}) — en línea con las convenciones estándar de SQL para citar identificadores en PostgreSQL, MySQL y MariaDB. Citar es opcional para los nombres de columna que no lo necesitan.
 * No se soportan múltiples columnas (separadas por coma), igual que la convención ya existente en el endpoint de offices.
 * Las peticiones con un valor de {{order}} que no resuelva a una columna real, o que usen sintaxis inválida, se rechazarán con un error claro, en lugar de ignorarse silenciosamente o pasarse tal cual.
 * Este comportamiento aplica de forma consistente a los dos endpoints afectados, porque comparten la misma validación de base.

*Motivación:*
 * Alinea el comportamiento de ordenamiento de datatables con la convención existente, más simple, que ya se usa en otra parte (el endpoint de offices).
 * Mejora la validación de entrada y la previsibilidad del comportamiento de la API.
 * Elimina la ambigüedad sobre cómo se interpretan en el parámetro {{order}} los nombres de columna que contienen espacios.

*Criterios de aceptación:*
 * Los valores válidos de {{order}} de una sola columna (citados o sin citar, con dirección o sin ella) devuelven resultados correctamente ordenados en ambos endpoints.
 * Los valores de {{order}} que referencian una columna inexistente se rechazan con una respuesta de error apropiada en ambos endpoints.
 * Los valores de {{order}} con sintaxis no soportada (varias columnas, comillas mal formadas, token de dirección inválido) se rechazan con una respuesta de error apropiada en ambos endpoints.
 * Los consumidores de API existentes que usan {{order}} con una sola columna, sin comillas y sin espacios en el nombre, siguen funcionando sin cambios.

## Criterios de aceptación

_(el ticket no declara criterios de aceptación)_

## Comentarios

_(sin comentarios)_
