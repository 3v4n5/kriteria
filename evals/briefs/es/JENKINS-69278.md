> Fuente: jenkins · https://issues.jenkins.io/browse/JENKINS-69278

# JENKINS-69278 — Falta una validación de permisos que permite listar el contenido del workspace

**Tipo:** Bug · **Prioridad:** Critical · **Componentes:** android-signing-plugin

## Descripción

Actualmente hay una alerta de seguridad para este plugin, pero el issue SECURITY-2404 sigue siendo privado.

¿Se está trabajando en eso? ¿Puede esperarse un arreglo pronto?

## Criterios de aceptación

_(el ticket no declara criterios de aceptación)_

## Comentarios

### Comentario 1

El problema de seguridad está descrito en el [aviso de seguridad del 27 de julio de 2022|https://www.jenkins.io/security/advisory/2022-07-27/#SECURITY-2404]. Estoy razonablemente seguro de que ahora mismo no se está trabajando en resolverlo.

El equipo de seguridad contacta a los mantenedores del plugin y les da un tiempo razonable para arreglar el problema antes de publicar un aviso de seguridad. Si el mantenedor no responde o no provee el arreglo, el aviso se publica para hacer constar que hay un problema conocido en el plugin.

Nos encantaría que tú o alguien de tu empresa [adoptara el plugin|https://www.jenkins.io/doc/developer/plugin-governance/adopt-a-plugin/], resolviera el problema de seguridad y publicara una nueva versión del plugin. Hay una [serie de video en cinco partes|https://www.youtube.com/watch?v=Fev8KfFsPZE] sobre adoptar un plugin y una [serie en tres partes|https://www.youtube.com/watch?v=D-b9WWx1Xes] sobre resolver una vulnerabilidad en un plugin. Si prefieres instrucciones escritas, está el [documento "Contributing to Open Source"|https://docs.google.com/document/d/1PKYIpPlRVGsBqrz0Ob1Cv3cefOZ5j2xtGZdWs27kLuw/edit?usp=sharing], que guía muchos de los mismos pasos.

### Comentario 2

Creé un pull request: [https://github.com/jenkinsci/android-signing-plugin/pull/3]

[~restjohn] por favor revísalo.

### Comentario 3

[~markewaite] Dispuesto a ayudar, pero sé muy poco del tema. Sé que tenemos el formulario jelly y leí algo de documentación, pero por ejemplo el plugin de firma usa ANDROID_HOME u otra variable del proyecto para firmar algún paquete, y qué es exactamente lo que hay que evitar, porque ANDROID_HOME puede estar fuera del workspace al ser una herramienta externa.

### Comentario 4

[~panicking] No conozco el plugin, no puedo ayudar con esa pregunta.
