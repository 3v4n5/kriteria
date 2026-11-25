> Fuente: jenkins · https://issues.jenkins.io/browse/JENKINS-74965

# JENKINS-74965 — Agregar soporte para Repository, Project y Workspace Access Token de Bitbucket Cloud

**Tipo:** New Feature · **Prioridad:** Major · **Componentes:** bitbucket-branch-source-plugin

## Descripción

Los Access Token son contraseñas que se usan para tareas de scripting y para integrar herramientas (como las de CI/CD) con Bitbucket Cloud. Los Workspace Access Token están diseñados para usarse con una sola aplicación y permisos limitados, así que no requieren verificación en dos pasos (2SV, también conocida como autenticación de dos factores o 2FA).

Los Workspace Access Token no están atados a la cuenta de un usuario, sino a un workspace de Bitbucket, lo que restringe el acceso del token a un único workspace y a los proyectos/repositorios bajo ese workspace, y provee una solución más segura que los métodos de autenticación basados en usuario, como las App password.

Los Project Access Token están atados a un proyecto de Bitbucket, no a la cuenta de un usuario, lo que restringe el acceso del token a un único proyecto y a los repositorios de ese proyecto. Esto provee una solución más segura que los métodos de autenticación basados en usuario, como las App password.

Los Repository Access Token están atados a un repositorio, no a la cuenta de un usuario. Esto restringe el acceso del token a un único repositorio y provee una solución más segura que los métodos de autenticación basados en usuario, como las App password.

La documentación de Bitbucket describe cómo se pueden usar en lugar del formato heredado username:password aquí:
 * [Using Workspace Access Tokens|https://support.atlassian.com/bitbucket-cloud/docs/using-workspace-access-tokens/]
 * [Using Project Access Tokens|https://support.atlassian.com/bitbucket-cloud/docs/using-project-access-tokens/]
 * [Using Repository Access Tokens|https://support.atlassian.com/bitbucket-cloud/docs/using-access-tokens/]

Así que en teoría deberían funcionar igual que los token de OAuth: poniendo {{jenkins:credentials:username}} en {{x-token-auth}} para las operaciones de git clone/feath/pull, y enviando el token como header {{Authorization: Bearer <access_token>}} para las REST API.

## Criterios de aceptación

_(el ticket no declara criterios de aceptación)_

## Enlaces

- Cause: JENKINS-74972 — CredentialsMatcher.CQL.describe() implementations return invalid CQL

## Comentarios

_(sin comentarios)_
