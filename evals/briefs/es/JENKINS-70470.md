> Fuente: jenkins · https://issues.jenkins.io/browse/JENKINS-70470

# JENKINS-70470 — ScriptlerBuilder valida contra el permiso Overall.RunScripts en lugar de Scriptler.RunScripts

**Tipo:** Bug · **Prioridad:** Critical · **Componentes:** scriptler-plugin

## Descripción

Los usuarios que no son administradores no pueden configurar jobs con scripts de scriptler aunque tienen los permisos Scriptler.RunScripts y Scriptler.ConfigureScripts (verificado con [https://raw.githubusercontent.com/samrocketman/jenkins-script-console-scripts/main/audit-user-permissions.groovy] en la consola). El mensaje de error es: builderId: As the given builder does not have ID, it must be equals to one of the existing builder that does not have ID. Lo cual no debería ni siquiera validarse cuando el usuario tiene los permisos correctos.

Pero el método checkPermission en ScriptlerBuilder valida con "if(Jenkins.get().hasPermission(Jenkins.RUN_SCRIPTS)){" contra el permiso Overall.RunScripts, y por eso les niega a nuestros usuarios configurar el job con un script de scriptler.

¿Podrían verificar si este diagnóstico es correcto y corregir el plugin según corresponda?

## Criterios de aceptación

_(el ticket no declara criterios de aceptación)_

## Comentarios

### Comentario 1

Igual que JENKINS-70066

### Comentario 2

[~schaarda], esto debería estar arreglado ya en la release 384.v5d0d63f4a_51e.

### Comentario 3

Gracias, ya funciona.
