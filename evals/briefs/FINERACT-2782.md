> Fuente: apache · https://issues.apache.org/jira/browse/FINERACT-2782

# FINERACT-2782 — UPDATE /v1/email endpoint throws UnsupportedCommandException despite being documented

**Tipo:** Bug · **Prioridad:** Minor

## Descripción

What is broken

EmailApiResource exposes CREATE, RETRIEVE, UPDATE, DELETE endpoints for
/v1/email. CREATE and DELETE have working @CommandType handlers; UPDATE
does not, so calling the UPDATE endpoint throws UnsupportedCommandException
despite the endpoint existing and being documented.

Why it's broken

Everything downstream of the handler already exists and is correct:
- EmailWritePlatformService.update(Long, JsonCommand) — interface method
  already declared
- EmailWritePlatformServiceJpaRepositoryImpl.update(...) — already
  implemented (validates, assembles, applies changes, saves only if
  changed, returns CommandProcessingResult)
- EmailApiResource.java — already calls
  CommandWrapperBuilder().updateEmail(resourceId)
- UPDATE_EMAIL permission — already exists in
  fineract-provider/src/main/resources/db/changelog/tenant/parts/0002_initial_data.xml,
  same pattern as CREATE_EMAIL/DELETE_EMAIL

The only missing piece is the command handler itself, routing
@CommandType(entity="EMAIL", action="UPDATE") to the existing service
method.

Changes made

- Added UpdateEmailCommandHandler.java, matching the structural pattern
  of CreateEmailCommandHandler.java and the sibling
  UpdateEmailCampaignCommandHandler.java (@Service,
  @RequiredArgsConstructor, single injected write service,
  @Transactional processCommand calling .update(command.entityId(), command))

 

Note: no test coverage exists for the /emails resource at any layer
(CREATE/RETRIEVE/UPDATE/DELETE), and a separate, pre-existing validator
bug was found while investigating this (EmailDataValidator validates
against the wrong resource's constants). Both are being tracked and
will be fixed in a different ticket, since they are
independent of this handler-wiring fix.

## Criterios de aceptación

_(el ticket no declara criterios de aceptación)_

## Comentarios

_(sin comentarios)_
