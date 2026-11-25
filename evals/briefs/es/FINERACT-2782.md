> Fuente: apache · https://issues.apache.org/jira/browse/FINERACT-2782

# FINERACT-2782 — El endpoint UPDATE /v1/email lanza UnsupportedCommandException aunque está documentado

**Tipo:** Bug · **Prioridad:** Minor

## Descripción

Qué está roto

EmailApiResource expone endpoints CREATE, RETRIEVE, UPDATE, DELETE para
/v1/email. CREATE y DELETE tienen handlers @CommandType que funcionan; UPDATE
no, así que llamar al endpoint UPDATE lanza UnsupportedCommandException
aunque el endpoint existe y está documentado.

Por qué está roto

Todo lo que viene después del handler ya existe y es correcto:
- EmailWritePlatformService.update(Long, JsonCommand) — método de la interfaz
  ya declarado
- EmailWritePlatformServiceJpaRepositoryImpl.update(...) — ya
  implementado (valida, arma, aplica los cambios, guarda solo si
  hubo cambios, devuelve CommandProcessingResult)
- EmailApiResource.java — ya llama a
  CommandWrapperBuilder().updateEmail(resourceId)
- el permiso UPDATE_EMAIL — ya existe en
  fineract-provider/src/main/resources/db/changelog/tenant/parts/0002_initial_data.xml,
  con el mismo patrón que CREATE_EMAIL/DELETE_EMAIL

La única pieza que falta es el command handler en sí, que enrute
@CommandType(entity="EMAIL", action="UPDATE") al método de servicio que ya existe.

Cambios hechos

- Se agregó UpdateEmailCommandHandler.java, siguiendo el patrón estructural
  de CreateEmailCommandHandler.java y del hermano
  UpdateEmailCampaignCommandHandler.java (@Service,
  @RequiredArgsConstructor, un único write service inyectado,
  processCommand @Transactional llamando a .update(command.entityId(), command))

 

Nota: no existe cobertura de pruebas para el recurso /emails en ninguna capa
(CREATE/RETRIEVE/UPDATE/DELETE), y se encontró un bug de validador aparte y
preexistente mientras se investigaba esto (EmailDataValidator valida
contra las constantes del recurso equivocado). Ambos están registrados y
se arreglarán en otro ticket, porque son
independientes de este arreglo de cableado del handler.

## Criterios de aceptación

_(el ticket no declara criterios de aceptación)_

## Comentarios

_(sin comentarios)_
