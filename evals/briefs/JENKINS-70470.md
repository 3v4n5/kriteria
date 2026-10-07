> Fuente: jenkins · https://issues.jenkins.io/browse/JENKINS-70470

# JENKINS-70470 — ScriptlerBuilder checks against Overall.RunScripts-Permission instead of Scriptler.RunScripts-Permission

**Tipo:** Bug · **Prioridad:** Critical · **Componentes:** scriptler-plugin

## Descripción

Non-Admin-Users can't configure jobs with scriptler-scripts although they have the permissions Scriptler.RunScripts and Scriptler.ConfigureScripts (verified using [https://raw.githubusercontent.com/samrocketman/jenkins-script-console-scripts/main/audit-user-permissions.groovy] in the console). The error message is: builderId: As the given builder does not have ID, it must be equals to one of the existing builder that does not have ID. Which should not even be checked when the user has the correct permissions.

But the method checkPermission in ScriptlerBuilder checks with "if(Jenkins.get().hasPermission(Jenkins.RUN_SCRIPTS)){" against the permission Overall.RunScripts and therefore denies our users to configure the job with a scriptler script.

Could you please verify if this diagnosis is correct and correct the plugin as neccessary?

## Criterios de aceptación

_(el ticket no declara criterios de aceptación)_

## Comentarios

### Comentario 1

Same as JENKINS-70066

### Comentario 2

[~schaarda], this should now be fixed with release 384.v5d0d63f4a_51e.

### Comentario 3

Thank you, works now.
