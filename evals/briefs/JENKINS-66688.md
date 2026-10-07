> Fuente: jenkins · https://issues.jenkins.io/browse/JENKINS-66688

# JENKINS-66688 — Markup in build history column of legacy UI looks randomly weird

**Tipo:** Bug · **Prioridad:** Minor · **Componentes:** badge-plugin

## Descripción

{color:#171212}I have some recent pipeline code that adds and removes badges (something I did not do before) in the left column of legacy UI as the job progresses, which acts weirdly.{color}

{color:#171212}I tried both implementations using the better featured Badge plugin ({{somemethod()}}) and original Groovy Postbuild Plugin ({{manager.somemethod()}}), and both occasionally leave the column cell for a job taller than needed for the one remaining yellow line - but not consistently. {color}

{color:#171212}Some cells are just as "thin" as needed for the content, and the build date is just after the build number and above the badge; ones with "broken" markup have the date on the bottom and a couple of lines' worth empty space above the badge :\{color}

{color:#171212}Abridged code that gets me here is:{color}
 * {color:#171212}Badge plugin:{color}
{code:java}
// Report initial estimation to left column and to build's overview page
addInfoBadge(text: sbSummary, id: "Discovery-counter")
createSummary(text: sbSummary, icon: '/images/48x48/notepad.png')

...

// Replace initial progress in the left column with work being done:
removeBadges(id: "Discovery-counter")
addShortText(txt){code}

 * Groovy PostBuild plugin:
{code:java}
manager.addInfoBadge(sbSummary)
// Not sure there is a GPBP equivalent for the next method?
createSummary(text: sbSummary, icon: '/images/48x48/notepad.png')

...

manager.removeBadges()
manager.addShortText(txt){code}

Attaching the screenshot.

Marking as minor priority as this does not seem to break anything beside UX, but since same activity ends up in different markups, maybe something more sinister happens that I just did not notice.

## Criterios de aceptación

_(el ticket no declara criterios de aceptación)_

## Comentarios

### Comentario 1

Copying markup from Firefox Inspect page, as-is (no linebreaks added manually etc.):
 * Build 122 that looks okay:
{code:java}
<tr page-entry-id="-9223372036854775686" class="build-row multi-line overflow-checked"><td class="build-row-cell"><div class="pane build-name"><div class="build-icon"><a href="/job/nut/job/nut/job/master/122/console" class="build-status-link"><span style="width: 16px; height: 16px; " class="build-status-icon__wrapper icon-yellow icon-sm"><span class="build-status-icon__outer"><svg viewBox="0 0 24 24" tooltip="Unstable &amp;gt; Console Output" focusable="false" class="svg-icon "><use href="/images/build-status/build-status-sprite.svg#build-status-static"></use></svg></span><svg viewBox="0 0 24 24" tooltip="Unstable &amp;gt; Console Output" focusable="false" class="svg-icon icon-yellow icon-sm"><use href="/static/ad6a03f4/images/build-status/build-status-sprite.svg#last-unstable"></use></svg></span></a></div><a update-parent-class=".build-row" href="/job/nut/job/nut/job/master/122/" class="tip model-link inside build-link display-name">#122</a></div><div time="1632154294696" class="pane build-details"><a update-parent-class=".build-row" tooltip="Took 3 hr 36 min" href="/job/nut/job/nut/job/master/122/" class="tip model-link inside build-link" title="Took 3 hr 36 min">Sep 20, 2021 6:11 PM CEST
        </a></div><div class="pane build-controls indent-multiline block"><div class="middle-align build-badge" style="width: 100%;">&nbsp;<span style="padding:1px;border:1px solid #C0C000;margin:0px;background:#FFFF00;color:#000000">Running 71 'slow build' dynamatrix stages</span></div></div><div class="left-bar"></div></td></tr> {code}

 * Build 121 that looks weird:
{code:java}
<tr page-entry-id="-9223372036854775687" class="build-row multi-line overflow-checked"><td class="build-row-cell"><div class="block wrap build-name-controls"><div class="pane build-name wrapped" style="float: left; height: 48px;"><div class="build-icon"><a href="/job/nut/job/nut/job/master/121/console" class="build-status-link"><span style="width: 16px; height: 16px; " class="build-status-icon__wrapper icon-yellow icon-sm"><span class="build-status-icon__outer"><svg viewBox="0 0 24 24" tooltip="Unstable &amp;gt; Console Output" focusable="false" class="svg-icon "><use href="/images/build-status/build-status-sprite.svg#build-status-static"></use></svg></span><svg viewBox="0 0 24 24" tooltip="Unstable &amp;gt; Console Output" focusable="false" class="svg-icon icon-yellow icon-sm"><use href="/static/ad6a03f4/images/build-status/build-status-sprite.svg#last-unstable"></use></svg></span></a></div><a update-parent-class=".build-row" href="/job/nut/job/nut/job/master/121/" class="tip model-link inside build-link display-name">#121</a></div><div class="pane build-controls wrapped" style="float: right; width: 231px;"><div class="middle-align build-badge" style="width: 100%;">&nbsp;<span style="padding:1px;border:1px solid #C0C000;margin:0px;background:#FFFF00;color:#000000">Running 71 'slow build' dynamatrix stages</span></div></div></div><div time="1632153949441" class="pane build-details block indent-multiline"><a update-parent-class=".build-row" tooltip="Took 2 hr 12 min" href="/job/nut/job/nut/job/master/121/" class="tip model-link inside build-link" title="Took 2 hr 12 min">Sep 20, 2021 6:05 PM CEST
        </a></div><div class="left-bar"></div></td></tr> {code}

They apparently differ in the nesting order of the DIV's and in the style classes applied to ones present.

### Comentario 2

[~jimklimov] Could you please verify if the issue still persists with the latest 1.12 release? I can not see why this would happen other then the build history acting weird - which would actually be a jenkins core issue.
