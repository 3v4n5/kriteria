> Fuente: mongodb · https://jira.mongodb.org/browse/COMPASS-8949

# COMPASS-8949 — "hotkey" on "add stage" dropdown of the "aggregation focus mode" is broken

**Tipo:** Bug · **Prioridad:** Minor - P4 · **Componentes:** Aggregation pipeline

## Descripción

h3. *Problem Statement/Rationale*

As per [this comment|https://github.com/mongodb-js/compass/pull/6661#discussion_r1943163464] from [~rhys.howell@mongodb.com] the UI displaying the hotkey on the dropdown is broken.

*Please be sure to attach relevant logs {_}with any sensitive data redacted{_}.*

N/A

*Steps to Reproduce*
 * Connect to a server
 * Navigate to a collection's "Aggreggations" tab.
 * Click the "Add Stage" button in the bottom.
 * Click the [ ] (FullScreenEnter) icon to enter into "focus mode".
 * Click the "Add Stage" split button to reveal the dropdown menu with where the "hotkey" text is show in poor contrast under each label instead of being right-aligned.

h3. *Expected Results and Actual Results*

 !410054554-d67e013f-c0ba-4f54-ad2e-d82b8b80cf10.png|thumbnail! 
(as-is on the left, to-be on the right)

h3. *Additional Notes*

{color:#505f79}Any additional information that may be useful to include.{color}

## Criterios de aceptación

_(el ticket no declara criterios de aceptación)_

## Comentarios

_(sin comentarios)_
