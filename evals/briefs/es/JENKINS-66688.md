> Fuente: jenkins · https://issues.jenkins.io/browse/JENKINS-66688

# JENKINS-66688 — El markup de la columna de historial de builds de la UI legacy se ve raro de forma aleatoria

**Tipo:** Bug · **Prioridad:** Minor · **Componentes:** badge-plugin

## Descripción

{color:#171212}Tengo código de pipeline reciente que agrega y quita badges (algo que no hacía antes) en la columna izquierda de la UI legacy a medida que avanza el job, y se comporta raro.{color}

{color:#171212}Probé las dos implementaciones: la del plugin Badge, que tiene más funcionalidades ({{somemethod()}}), y la del plugin original Groovy Postbuild ({{manager.somemethod()}}), y las dos dejan de vez en cuando la celda de la columna de un job más alta de lo necesario para la única línea amarilla que queda — pero no de forma consistente. {color}

{color:#171212}Algunas celdas quedan tan "delgadas" como el contenido necesita, y la fecha del build queda justo después del número de build y encima del badge; las que tienen el markup "roto" tienen la fecha abajo y un par de líneas de espacio vacío encima del badge :\{color}

{color:#171212}El código abreviado que me lleva a esto es:{color}
 * {color:#171212}Plugin Badge:{color}
{code:java}
// Report initial estimation to left column and to build's overview page
addInfoBadge(text: sbSummary, id: "Discovery-counter")
createSummary(text: sbSummary, icon: '/images/48x48/notepad.png')

...

// Replace initial progress in the left column with work being done:
removeBadges(id: "Discovery-counter")
addShortText(txt){code}

 * Plugin Groovy PostBuild:
{code:java}
manager.addInfoBadge(sbSummary)
// Not sure there is a GPBP equivalent for the next method?
createSummary(text: sbSummary, icon: '/images/48x48/notepad.png')

...

manager.removeBadges()
manager.addShortText(txt){code}

Adjunto el screenshot.

Lo marco con prioridad menor porque no parece romper nada más allá de la UX, pero como la misma actividad termina en markups distintos, quizá pasa algo más siniestro que simplemente no noté.

## Criterios de aceptación

_(el ticket no declara criterios de aceptación)_

## Comentarios

### Comentario 1

Copiando el markup desde el Inspector de Firefox, tal cual (sin saltos de línea agregados a mano ni nada):
 * Build 122, el que se ve bien:
{code:java}
<tr page-entry-id="-9223372036854775686" class="build-row multi-line overflow-checked"><td class="build-row-cell"><div class="pane build-name"><div class="build-icon"><a href="/job/nut/job/nut/job/master/122/console" class="build-status-link"><span style="width: 16px; height: 16px; " class="build-status-icon__wrapper icon-yellow icon-sm"><span class="build-status-icon__outer"><svg viewBox="0 0 24 24" tooltip="Unstable &amp;gt; Console Output" focusable="false" class="svg-icon "><use href="/images/build-status/build-status-sprite.svg#build-status-static"></use></svg></span><svg viewBox="0 0 24 24" tooltip="Unstable &amp;gt; Console Output" focusable="false" class="svg-icon icon-yellow icon-sm"><use href="/static/ad6a03f4/images/build-status/build-status-sprite.svg#last-unstable"></use></svg></span></a></div><a update-parent-class=".build-row" href="/job/nut/job/nut/job/master/122/" class="tip model-link inside build-link display-name">#122</a></div><div time="1632154294696" class="pane build-details"><a update-parent-class=".build-row" tooltip="Took 3 hr 36 min" href="/job/nut/job/nut/job/master/122/" class="tip model-link inside build-link" title="Took 3 hr 36 min">Sep 20, 2021 6:11 PM CEST
        </a></div><div class="pane build-controls indent-multiline block"><div class="middle-align build-badge" style="width: 100%;">&nbsp;<span style="padding:1px;border:1px solid #C0C000;margin:0px;background:#FFFF00;color:#000000">Running 71 'slow build' dynamatrix stages</span></div></div><div class="left-bar"></div></td></tr> {code}

 * Build 121, el que se ve raro:
{code:java}
<tr page-entry-id="-9223372036854775687" class="build-row multi-line overflow-checked"><td class="build-row-cell"><div class="block wrap build-name-controls"><div class="pane build-name wrapped" style="float: left; height: 48px;"><div class="build-icon"><a href="/job/nut/job/nut/job/master/121/console" class="build-status-link"><span style="width: 16px; height: 16px; " class="build-status-icon__wrapper icon-yellow icon-sm"><span class="build-status-icon__outer"><svg viewBox="0 0 24 24" tooltip="Unstable &amp;gt; Console Output" focusable="false" class="svg-icon "><use href="/images/build-status/build-status-sprite.svg#build-status-static"></use></svg></span><svg viewBox="0 0 24 24" tooltip="Unstable &amp;gt; Console Output" focusable="false" class="svg-icon icon-yellow icon-sm"><use href="/static/ad6a03f4/images/build-status/build-status-sprite.svg#last-unstable"></use></svg></span></a></div><a update-parent-class=".build-row" href="/job/nut/job/nut/job/master/121/" class="tip model-link inside build-link display-name">#121</a></div><div class="pane build-controls wrapped" style="float: right; width: 231px;"><div class="middle-align build-badge" style="width: 100%;">&nbsp;<span style="padding:1px;border:1px solid #C0C000;margin:0px;background:#FFFF00;color:#000000">Running 71 'slow build' dynamatrix stages</span></div></div></div><div time="1632153949441" class="pane build-details block indent-multiline"><a update-parent-class=".build-row" tooltip="Took 2 hr 12 min" href="/job/nut/job/nut/job/master/121/" class="tip model-link inside build-link" title="Took 2 hr 12 min">Sep 20, 2021 6:05 PM CEST
        </a></div><div class="left-bar"></div></td></tr> {code}

Aparentemente difieren en el orden de anidamiento de los DIV y en las clases de estilo aplicadas a los que están presentes.

### Comentario 2

[~jimklimov] ¿Podrías verificar si el problema sigue ocurriendo con la última release 1.12? No veo por qué pasaría esto, más allá de que el historial de builds se comporte raro — lo cual en realidad sería un problema del core de Jenkins.
