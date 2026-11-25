> Fuente: mongodb · https://jira.mongodb.org/browse/COMPASS-8949

# COMPASS-8949 — El "hotkey" del desplegable "add stage" del "aggregation focus mode" está roto

**Tipo:** Bug · **Prioridad:** Minor - P4 · **Componentes:** Aggregation pipeline

## Descripción

h3. *Planteamiento del problema / Justificación*

Según [este comentario|https://github.com/mongodb-js/compass/pull/6661#discussion_r1943163464] de [~rhys.howell@mongodb.com], la UI que muestra el atajo de teclado en el desplegable está rota.

*Por favor adjunta los logs relevantes {_}con los datos sensibles redactados{_}.*

N/A

*Pasos para reproducir*
 * Conectarse a un servidor.
 * Ir a la pestaña "Aggreggations" de una colección.
 * Hacer clic en el botón "Add Stage" de abajo.
 * Hacer clic en el icono [ ] (FullScreenEnter) para entrar en "focus mode".
 * Hacer clic en el botón partido "Add Stage" para desplegar el menú, donde el texto del "hotkey" se muestra con mal contraste debajo de cada etiqueta, en lugar de alineado a la derecha.

h3. *Resultado esperado y resultado actual*

 !410054554-d67e013f-c0ba-4f54-ad2e-d82b8b80cf10.png|thumbnail! 
(cómo está, a la izquierda; cómo debería quedar, a la derecha)

h3. *Notas adicionales*

{color:#505f79}Cualquier información adicional que pueda ser útil incluir.{color}

## Criterios de aceptación

_(el ticket no declara criterios de aceptación)_

## Comentarios

_(sin comentarios)_
