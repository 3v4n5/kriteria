> Fuente: jenkins · https://issues.jenkins.io/browse/JENKINS-69278

# JENKINS-69278 — Missing permission check allows listing workspace contents

**Tipo:** Bug · **Prioridad:** Critical · **Componentes:** android-signing-plugin

## Descripción

There is currently a security alert for this plugin, but the SECURITY-2404 issue is still private.

Is work being done on it? Can a fix be expected any time soon?

## Criterios de aceptación

_(el ticket no declara criterios de aceptación)_

## Comentarios

### Comentario 1

The security issue is described in the [July 27, 2022 security advisory|https://www.jenkins.io/security/advisory/2022-07-27/#SECURITY-2404].  I'm reasonably confident that no work is currently being done to resolve the issue.

The security team contacts plugin maintainers and gives them a reasonable time to fix the issue before they publish a security advisory.  If the maintainer does not respond or does not provide the fix, then the advisory is published to note that there is a known issue in the plugin.

We'd love to have you or someone at your employer [adopt the plugin|https://www.jenkins.io/doc/developer/plugin-governance/adopt-a-plugin/], resolve the security issue, and release a new version of the plugin.  There is a [five part video series|https://www.youtube.com/watch?v=Fev8KfFsPZE] on adopting a plugin and a [three part video series|https://www.youtube.com/watch?v=D-b9WWx1Xes] on resolving a vulnerability in a plugin.  If you prefer written instructions, there is the ["Contributing to Open Source" document|https://docs.google.com/document/d/1PKYIpPlRVGsBqrz0Ob1Cv3cefOZ5j2xtGZdWs27kLuw/edit?usp=sharing] that guides many of the same steps.

### Comentario 2

I have created a pull-request: [https://github.com/jenkinsci/android-signing-plugin/pull/3]

[~restjohn] Kindly review.

### Comentario 3

[~markewaite] Willing to help but I really have poor knowlege about it. I know that we have jelly form and I read some documentation but for instance the sign plugin project ANDROID_HOME or other variable that ask to sign some package and so on what exact we need to avoid because ANDROID_HOME can be out of the workspace because it's an external tool

### Comentario 4

[~panicking] I don't know the plugin to be able to help with the question
