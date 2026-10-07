> Fuente: jenkins · https://issues.jenkins.io/browse/JENKINS-74965

# JENKINS-74965 — Add support for Repository, Project and Workspace Access Token for Bitbucket Cloud

**Tipo:** New Feature · **Prioridad:** Major · **Componentes:** bitbucket-branch-source-plugin

## Descripción

Access Tokens are passwords used for scripting tasks and integrating tools (such as CI/CD tools) with Bitbucket Cloud. Workspace Access Tokens are designed for use with a single application with limited permissions, so they don't require two-step verification (2SV, also known as two-factor authentication or 2FA).

Workspace Access Tokens are not tied to a user's account but are connected to a Bitbucket workspace, restricting the token's access to a single workspace and any projects/repositories under that workspace, providing a more secure solution than user-based authentication methods such as App passwords.

Project Access Tokens are tied to a Bitbucket project, not a user's account, restricting the token's access to a single project and any repositories in that project. This provides a more secure solution than user-based authentication methods such as App passwords.

Repository Access Tokens are tied to a repository, not a user’s account. This restricts the token’s access to a single repository, providing a more secure solution than user-based authentication methods such as App passwords.

Bitbucket documentation describe how these can be used in-place of legacy username:password format here:
 * [Using Workspace Access Tokens|https://support.atlassian.com/bitbucket-cloud/docs/using-workspace-access-tokens/]
 * [Using Project Access Tokens|https://support.atlassian.com/bitbucket-cloud/docs/using-project-access-tokens/]
 * [Using Repository Access Tokens|https://support.atlassian.com/bitbucket-cloud/docs/using-access-tokens/]

So in theory they should work in the same way that OAuth tokens do by setting {{jenkins:credentials:username}} to {{x-token-auth}} to perform git clone/feath/pull operation and send the token as Header {{Authorization: Bearer <access_token>}} for the REST APIs

## Criterios de aceptación

_(el ticket no declara criterios de aceptación)_

## Enlaces

- Cause: JENKINS-74972 — CredentialsMatcher.CQL.describe() implementations return invalid CQL

## Comentarios

_(sin comentarios)_
