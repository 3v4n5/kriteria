# QA Agent — Sistema Agéntico de Estrategia y Ejecución de QA

> Documento de visión + arquitectura + plan de construcción.
> Estado: borrador 1 (para discutir y recortar alcance).

---

## 1. Tesis del producto

**Lo que NO es:** otro wrapper de LLM que "genera casos de prueba".

**Lo que es:** un sistema que recibe cualquier insumo de un proyecto de software
(URL, PDF, épica de Jira, work item de Azure DevOps, PR, repo, Figma, video de
sesión) y responde tres preguntas que hoy responde un QA Lead senior:

1. **¿Qué riesgo tengo aquí?** (análisis de la base de prueba)
2. **¿Qué estrategia de prueba aplica?** (ISTQB: enfoque, niveles, tipos, técnicas, profundidad)
3. **¿Cuál es el flujo concreto para ejecutarla?** (plan → diseño → implementación → ejecución → cierre)

Y lo hace **acumulando memoria por empresa**: a los 6 meses el sistema sabe que
en el cliente X el módulo de pagos rompe cada vez que tocan el trigger de
Opportunity, que su definición de "Sev 2" es distinta, que su regresión crítica
son 14 escenarios y que su equipo escribe Gherkin en español.

**El foso defensivo son dos cosas, no el modelo:**
- La **memoria organizacional** (nadie más la tiene de tu cliente).
- El **loop de auto-mejora con evaluación** (los playbooks mejoran con evidencia, no con vibras).

---

## 2. El núcleo ISTQB: de teoría a decisiones ejecutables

Esto es el cerebro del sistema. Todo lo demás es plomería.

### 2.1 El proceso (ISTQB Foundation, ISO/IEC/IEEE 29119)

| Fase | Qué produce el sistema |
|---|---|
| Planificación | Test Plan: alcance, riesgos, criterios de entrada/salida, estimación |
| Monitoreo y control | Métricas en vivo, semáforo de cobertura, replanificación |
| Análisis | Condiciones de prueba derivadas de la base de prueba + riesgos |
| Diseño | Casos abstractos por técnica |
| Implementación | Casos concretos, datos, precondiciones, código automatizado |
| Ejecución | Corridas manuales guiadas o automatizadas + evidencia |
| Cierre | Reporte, lecciones aprendidas → **memoria** |

### 2.2 Los 7 enfoques de prueba (la decisión más importante del sistema)

El **Strategy Agent** clasifica el contexto y elige (o mezcla) uno:

| Enfoque | Se activa cuando... |
|---|---|
| Analítico (risk-based) | Hay release con presión, alcance amplio → **default del sistema** |
| Basado en modelos | Hay máquina de estados, flujo de negocio, API con contrato (OpenAPI) |
| Metódico | Existe checklist/estándar (OWASP, WCAG, regresión fija) |
| Conforme a proceso | El cliente tiene estándar regulatorio (SOX, HIPAA, FDA) |
| Dirigido / consultivo | El insumo es pobre y hay un experto de negocio disponible |
| Averso a regresión | Cambio en componente compartido → blast radius |
| Reactivo | Producto exploratorio, poca documentación → exploratorio con charters |

### 2.3 La matriz de decisión

El agente no "improvisa": llena una matriz determinista.

```
Insumo → [Nivel]      componente | integración | sistema | aceptación
       → [Tipo]       funcional | rendimiento | seguridad | usabilidad | compatibilidad | confirmación | regresión
       → [Técnica]    caja negra: particiones, valores límite, tablas de decisión,
                                  transición de estados, casos de uso, pairwise
                      caja blanca: cobertura de sentencia / decisión
                      experiencia: error guessing, exploratorio, checklist
       → [Profundidad] = f(riesgo) donde riesgo = probabilidad × impacto
```

**Regla de oro del diseño:** esa matriz vive en **código y datos**, no en un prompt.
El LLM aporta juicio (¿cuál es el riesgo? ¿qué particiones existen?); el código
aporta el control de flujo (si nivel=integración y tipo=regresión, entonces
ejecuta el playbook `blast-radius`). Ese es el principio central de harness engineering.

---

## 3. Harness Engineering: los 7 principios que rigen la arquitectura

1. **El modelo decide, el código orquesta.** Los bucles, ramas y reintentos son
   TypeScript determinista. El modelo solo emite juicios estructurados (JSON con schema).
2. **El contexto es el recurso escaso, no los tokens.** Cada subagente recibe el
   contexto mínimo y devuelve un objeto validado, no prosa.
3. **Progressive disclosure.** No se cargan 40 playbooks; se carga un índice de
   una línea por playbook y el agente pide el archivo que necesita.
4. **Los artefactos viven en disco, no en el contexto.** `.testplan.yml`,
   `.testcase.yml`, `.testrun.yml`, evidencia. El contexto se recicla; los archivos no.
5. **Verificación adversarial obligatoria.** Todo output pasa por un crítico con
   contexto fresco cuyo trabajo es *refutar* (ya lo tienes: `qa-coverage-critic`, `qa-harness-judge`).
6. **Gates humanos en toda mutación externa.** Crear un ticket, comentar un PR,
   escribir en Slack, correr contra un org de cliente → siempre confirmación explícita.
7. **Todo run es reproducible y auditable.** Trace completo, versión de playbook,
   versión de modelo, hash del insumo.

---

## 4. Arquitectura

### 4.1 Vista de capas

```
┌──────────────────────────────────────────────────────────────┐
│  UI  Next.js — login Google/email, chat, board de runs,      │
│      grafo de conocimiento, config de tools/MCP              │
└───────────────────────────┬──────────────────────────────────┘
                            │ tRPC / SSE
┌───────────────────────────▼──────────────────────────────────┐
│  API Gateway (Hono)  — authz, tenancy, cuotas, streaming     │
└───────────────────────────┬──────────────────────────────────┘
                            │ eventos
┌───────────────────────────▼──────────────────────────────────┐
│  ORQUESTADOR DURABLE (Inngest / Temporal)                    │
│  DAG determinista de fases, reanudable, con gates humanos    │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│  RUNTIME DE AGENTES  (Claude Agent SDK, TypeScript)          │
│                                                              │
│  L0 Ingest ──► L1 Comprensión ──► L2 Estrategia ──►          │
│  L3 Diseño ──► L4 Implementación ──► L5 Ejecución ──►        │
│  L6 Cierre ──► escritura a memoria                           │
│                                                              │
│  Transversales: Critic · Judge · Security Reviewer           │
└──────┬────────────────────────┬──────────────────────────────┘
       │                        │
┌──────▼─────────┐    ┌─────────▼────────────────────────────┐
│ TOOL LAYER     │    │ MEMORIA (por tenant)                 │
│ • nativas      │    │ • Vault Markdown + wikilinks (Git)   │
│ • MCP clients  │    │ • Postgres: nodos + aristas + pgvector│
│   (Jira, ADO,  │    │ • Traces (Langfuse) → evals          │
│    GitHub,     │    │ • Playbooks versionados              │
│    Slack,      │    └──────────────────────────────────────┘
│    Notion,     │
│    Playwright) │
└────────────────┘
```

### 4.2 Los agentes (roles, no "personajes")

| Agente | Entrada | Salida (con schema) | Modelo sugerido |
|---|---|---|---|
| **Ingestor** | URL/PDF/Jira/ADO/repo | `TestBasis` normalizado | Haiku + parsers deterministas |
| **Analista** | `TestBasis` + memoria | features, actores, reglas, ambigüedades | Sonnet |
| **Risk Assessor** | features + historial de bugs del tenant | matriz riesgo (prob × impacto) | Sonnet |
| **Strategist** ⭐ | riesgo + contexto org | `TestStrategy` (enfoque, niveles, tipos, técnicas, profundidad, estimación) | Opus |
| **Designer** | estrategia + condiciones | casos por técnica, optimizados (pairwise) | Sonnet |
| **Implementer** | casos + repo destino | Gherkin + código Playwright/POM | Sonnet |
| **Executor** | casos concretos | corrida + evidencia + `.testrun.yml` | Haiku/Sonnet |
| **Critic** | cualquier artefacto | gaps concretos + veredicto | Opus (fresco, adversarial) |
| **Reporter** | corridas | reporte de cierre + métricas | Haiku |
| **Reflector** | traces + señales | propuestas de delta a playbooks/memoria | Opus (offline) |

> ⭐ `Strategist` es el diferenciador. Es el único agente que merece Opus siempre.

### 4.3 Fan-out determinista

El orquestador no le pregunta al modelo "¿en cuántas partes divido esto?".
El código particiona por feature/módulo y lanza N pipelines paralelos con
`pipeline()`-style (sin barreras innecesarias): cada feature avanza a diseño
mientras otra sigue en análisis. Los únicos puntos de barrera reales son
deduplicación global y el reporte de cierre.

---

## 5. Stack tecnológico (JS/TS, todo gratis o free-tier en fase inicial)

### 5.1 Elecciones y por qué

| Capa | Elección | Por qué / alternativa descartada |
|---|---|---|
| Lenguaje | **TypeScript, Node 22 LTS** | Bun aún friccioso con SDKs y Playwright en CI |
| Monorepo | **pnpm workspaces + Turborepo** | Nx es más pesado de lo necesario |
| Frontend | **Next.js 15 (App Router) + React 19** | RSC + Server Actions reducen backend a la mitad |
| UI | **Tailwind v4 + shadcn/ui** | Ownership del código, cero lock-in |
| Chat/streaming | **Vercel AI SDK v5** (`useChat`, streaming de tool calls) | Ya resuelve el 80% del UI agéntico |
| Grafo visual | **React Flow** (plan/DAG) + **Cytoscape.js** (grafo de memoria) | |
| Estado servidor | **TanStack Query** | |
| API | **Hono + tRPC** | Tipado E2E; Express queda legacy |
| Auth | **Better Auth** (self-host, Google OAuth + magic link + org/multi-tenant nativo) | Auth.js flojo en multi-tenant; Clerk no es gratis |
| Orquestación agentes | **Claude Agent SDK (TS)** | Es literalmente tu harness actual; subagentes, MCP y tools ya resueltos |
| Durabilidad workflows | **Inngest** (free tier, DX excelente) → **Temporal** self-host al escalar | BullMQ obliga a escribir la durabilidad a mano |
| DB | **Postgres (Neon free)** + **Drizzle ORM** + **pgvector** | Prisma más lento en edge; pgvector evita Pinecone |
| Memoria/grafo | **Vault Markdown + Git** indexado en Postgres (ver §6) | |
| Object storage | **Cloudflare R2** (egress gratis) o MinIO local | S3 cobra egress de la evidencia (screenshots/videos) |
| Ejecución web | **Playwright** (+ MCP de Playwright) | |
| Observabilidad LLM | **Langfuse self-host** (OSS, gratis) | Requisito duro para la auto-mejora |
| Evals | **Promptfoo** (OSS) + evals de Langfuse | |
| Secretos | **Infisical self-host** u **OpenBao** | Nunca tokens de cliente en Postgres plano |
| Deploy fase 1 | Vercel (free) + Neon (free) + Railway/Fly para el worker | |

### 5.2 Estructura del monorepo

```
qa-agent/
├─ apps/
│  ├─ web/                  Next.js — UI, auth, config de tools
│  ├─ api/                  Hono + tRPC
│  └─ worker/               Runtime de agentes + Inngest functions
├─ packages/
│  ├─ core/                 Tipos del dominio: TestBasis, TestStrategy, TestCase…
│  ├─ istqb/                ⭐ Matriz de decisión, técnicas, modelo de riesgo (código puro)
│  ├─ agents/               Definición de agentes + schemas de salida
│  ├─ playbooks/            Skills en Markdown (portadas desde ~/.claude/skills)
│  ├─ memory/               Vault + indexado + recall
│  ├─ connectors/           Clientes MCP + adaptadores (Jira, ADO, GitHub, Slack)
│  ├─ ingest/               Parsers: PDF, HTML, OpenAPI, repo, Figma
│  └─ db/                   Drizzle schema + migraciones + RLS
└─ evals/                   Golden sets + suites de evaluación
```

---

## 6. Memoria: la respuesta a "¿Obsidian o base de datos?"

**Respuesta honesta: los dos, y no son alternativas.**

Obsidian no es una base de datos multi-tenant — no tiene concurrencia, permisos
ni transacciones. Pero su **modelo** (Markdown + frontmatter + `[[wikilinks]]`)
es el mejor formato de memoria para agentes que existe hoy: legible por humanos,
diff-eable en Git, editable por el modelo sin API, y auditable.

### Diseño híbrido

```
Fuente de verdad          →  Vault Markdown por tenant, versionado en Git
Índice de consulta        →  Postgres: tabla nodes + tabla edges + embeddings (pgvector)
Visualización             →  Cytoscape.js en la UI (y el vault abre literal en Obsidian)
```

Cada memoria es un archivo:

```markdown
---
id: mem_01J...
tenant: acme-museum
type: domain | defect-pattern | selector | convention | risk | glossary
confidence: 0.82
sources: [JIRA-1423, run_9f2a]
created: 2026-03-14
last_validated: 2026-07-02
---

El módulo de Membresías recalcula el precio prorrateado al cambiar de tier.
Históricamente rompe cuando se toca [[trigger-opportunity]] — 4 incidentes
en 8 meses. Siempre incluir [[regresion-membresias]] en el blast radius.
```

### Las 4 capas de memoria

1. **De trabajo** — contexto de la corrida actual. Efímera.
2. **Episódica** — cada run: insumo, decisiones, resultado, correcciones humanas. (Postgres + Langfuse)
3. **Semántica / organizacional** — el vault. Dominio, módulos, jerga, selectores estables, patrones de defecto, definición de severidad del cliente.
4. **Procedimental** — los playbooks versionados. **Aquí ocurre la auto-mejora real.**

### Reglas duras

- **Aislamiento total entre tenants.** RLS en Postgres, vault separado, embeddings con `tenant_id` en el filtro. Un vault "global" solo con conocimiento curado y anonimizado (p.ej. checklists OWASP), nunca datos de cliente.
- **Toda memoria tiene procedencia y fecha de validación.** Memoria sin fuente no se escribe.
- **Decay.** Memoria no reconfirmada en N meses baja su `confidence` y deja de inyectarse por defecto.
- **Escritura con gate.** El agente *propone* memorias; se aprueban en lote desde la UI (o auto-aprueban las de tipo `selector`/`convention` con alta señal).

---

## 7. Auto-mejora: cómo hacerla real y no marketing

Un sistema no "aprende" porque le pongas la palabra memoria. Necesita **señal medible + evaluación + versionado**.

### 7.1 Señales que se capturan en cada run

| Señal | Cómo se mide |
|---|---|
| Edición humana del output | diff entre lo generado y lo aprobado |
| Escapes a producción | bug reportado que la suite no detectó → falla de cobertura |
| Falsos positivos | casos que fallan sin bug real |
| Flakiness | tasa de inestabilidad por escenario |
| Tiempo humano de corrección | minutos entre entrega y aprobación |
| Veredicto del Critic | gaps encontrados por corrida |

### 7.2 El loop (semanal, offline, con gate humano)

```
traces + señales
     ↓
[Reflector] agrupa fallas recurrentes por playbook
     ↓
propone delta: "el playbook de diseño omite valores límite en campos de moneda"
     ↓
genera versión candidata del playbook (v7)
     ↓
[Evals] corre golden set (50 insumos con salida esperada) contra v6 y v7
     ↓
¿mejora sin regresión?  ── no ──► descarta y registra
     │ sí
     ▼
gate humano → promueve v7 → changelog visible en la UI
```

**Regla innegociable:** ningún playbook se auto-promueve sin pasar evals. Sin esa
puerta, el sistema deriva y nadie se da cuenta hasta que un cliente se queja.

### 7.3 Optimización de recursos

- **Ruteo de modelo por tarea**: Haiku (clasificar/extraer/reportar) · Sonnet (diseñar/implementar) · Opus (estrategia/crítica/reflexión). ~70% de ahorro vs. todo-Opus.
- **Prompt caching** del contexto estable del tenant (playbooks + memoria core).
- **Determinismo primero**: parsear OpenAPI, DOM, PDF con código; el LLM solo para lo que requiere juicio.
- **Cache por hash de insumo**: misma URL/PDF sin cambios → no se reanaliza.
- **Contexto aislado en subagentes**: el orquestador nunca ve los 40k tokens de un análisis, solo su resumen estructurado.
- **Presupuesto por run** configurable por tenant, con corte duro.

---

## 8. Tools y MCP

### 8.1 Dos categorías

**Prediseñadas (nativas, siempre disponibles):**
`fetch_url` · `crawl_site` · `parse_pdf` · `parse_openapi` · `read_repo` ·
`run_playwright` · `capture_evidence` · `pairwise_reduce` · `risk_matrix` ·
`generate_test_data` · `a11y_scan` (axe-core) · `security_scan` (OWASP checklist)

**Vía MCP (configurables por tenant desde la UI):**
Jira · Azure DevOps · GitHub/GitLab · Slack · Teams · Notion · Confluence ·
Figma · TestRail/Xray · Sentry · Datadog/CloudWatch · Playwright MCP

### 8.2 El registro de tools

- Catálogo de conectores en la UI, estilo "app store", con OAuth por tenant.
- Cada tool declara: schema, **scopes**, si es **read-only o mutante**, y coste.
- **Toda tool mutante nace deshabilitada** y requiere activación explícita + gate por invocación.
- **Tool discovery diferido**: el agente no carga 200 schemas; busca el que necesita (mismo patrón que `ToolSearch`).
- Sandbox: los MCP corren en procesos aislados con timeout y sin acceso al FS del host.

### 8.3 Riesgo de seguridad que hay que nombrar

Un agente que lee tickets de Jira y tiene permiso de escribir en GitHub es un
vector de **prompt injection** de primer orden. Contramedidas desde el día 1:

- Todo contenido traído por tools se marca como **datos, nunca instrucciones**.
- Las tools mutantes exigen confirmación humana con diff visible.
- Separación estricta: el agente que *lee* fuentes externas no es el mismo que *escribe*.
- Log inmutable de toda invocación mutante.

---

## 9. Modelo de datos (esqueleto)

```
Organization ─┬─ User (Google OAuth / magic link)
              ├─ Project ─┬─ TestBasis (insumo normalizado + hash)
              │           ├─ TestStrategy (versionada)
              │           ├─ TestSuite ── TestCase ── TestStep
              │           └─ TestRun ── Result ── Evidence(R2)
              ├─ MemoryNode ── MemoryEdge      (grafo + pgvector)
              ├─ Connector (MCP, tokens en Infisical)
              ├─ PlaybookVersion (+ EvalResult)
              └─ AgentTrace (Langfuse ref, coste, tokens, modelo)
```

Todo lleva `organization_id` con **Row Level Security** activa. Sin excepción.

---

## 10. Plan de construcción

### Fase 0 — Spike vertical (2 semanas) · objetivo: probar que el cerebro funciona

Sin UI, sin auth, sin DB. Un CLI en TypeScript:

```
qa-agent plan --from jira:VEEV-1234
```

- Ingesta 1 solo tipo de insumo (issue de Jira, vía MCP que ya usas).
- Corre `Analista → Risk Assessor → Strategist → Designer`.
- Emite `.testplan.yml` + `.testcase.yml` en disco.
- Pasa por el `Critic` una vez.
- **Criterio de éxito:** un QA senior mira el plan de 5 tickets reales y dice "esto es lo que yo habría hecho" en ≥3 de 5.

Si esto falla, nada de lo demás importa. Es el experimento más barato que valida la tesis.

### Fase 1 — Producto mínimo usable (4–6 semanas)

- Monorepo + Next.js + Better Auth (Google + email) + Neon + Drizzle, **multi-tenant con RLS desde el commit uno**.
- Insumos: Jira (primero), PDF, URL simple. Azure DevOps entra en Fase 3.
- Pipeline completo hasta **diseño** (no ejecución).
- UI: crear proyecto → pegar insumo → ver estrategia propuesta → editar → exportar (Markdown / Gherkin / CSV para TestRail).
- Inngest para durabilidad + streaming del progreso a la UI.
- Langfuse conectado desde el primer run (no se deja para después).

### Fase 2 — Ejecución y evidencia (4 semanas)

- Implementer + Executor con Playwright (reusa `qa-test-automator`).
- Corridas manuales guiadas (checklist interactivo paso a paso con captura de evidencia).
- `.testrun.yml`, evidencia en R2, reporte de cierre con métricas ISTQB.
- Critic adversarial obligatorio antes de entregar.

### Fase 3 — Integraciones y gates (3–4 semanas)

- Registro de conectores MCP con OAuth por tenant.
- Escritura bidireccional: crear/actualizar en Jira y ADO, comentar PRs, publicar en Slack — **todo con gate y diff**.
- Roles y permisos (Owner / QA Lead / QA / Viewer).

### Fase 4 — Memoria y auto-mejora (4–6 semanas)

- Vault por tenant + indexado + recall en cada agente.
- UI del grafo de conocimiento (Cytoscape) con aprobación de memorias.
- Golden sets + Promptfoo + versionado de playbooks + Reflector semanal.
- Dashboard de "qué aprendió el sistema este mes".

### Fase 5 — Endurecimiento (continuo)

- RLS auditada, cifrado de secretos, retención de datos, DPA.
- Cuotas y presupuesto por tenant, facturación.
- Self-host opcional (clientes enterprise lo van a pedir).

---

## 11. Riesgos y decisiones abiertas

### Riesgos reales

| Riesgo | Mitigación |
|---|---|
| **Alcance descomunal.** Esto son 6–9 meses a tiempo completo | Fase 0 primero. Cortar ejecución automatizada si Fase 1 no convence |
| **"Genera casos" es commodity.** Copilot/Testim ya lo hacen | El diferenciador es estrategia + memoria organizacional, no generación |
| **Confianza.** Un QA no confía en un plan que no puede auditar | Todo artefacto muestra su razonamiento, su fuente y su versión de playbook |
| **Prompt injection vía tickets** | §8.3 desde el día 1, no retrofitteado |
| **Costo por run se dispara** | Ruteo de modelo + caching + presupuesto duro por run |
| **Auto-mejora que degrada en silencio** | Evals obligatorios + gate humano para promover |

### Decisiones tomadas

1. **Genérico multi-empresa desde el diseño.** Veevart es el tenant piloto, no el
   dueño del modelo de dominio. Consecuencia dura: `packages/istqb` y
   `packages/playbooks` no pueden mencionar Salesforce, museos ni Veevart —
   todo eso vive en el vault del tenant. Es la regla que mantiene el sistema vendible.
2. **Primer insumo: Jira**, vía el MCP ya conectado.
3. **Fase 1 llega hasta diseño.** No ejecuta pruebas todavía.
4. **Construcción individual** → monolito Next.js full-stack + un worker en Railway/Fly.

---

## 12. Lo primero que haría mañana

1. Crear el monorepo y el paquete `packages/istqb` — **la matriz de decisión en código puro**, con tests. Es el activo más duradero y no depende de ningún modelo.
2. Portar 3 skills tuyas (`qa-test-extractor`, `qa-coverage-critic`, `qa-bundle-generator`) a `packages/playbooks` como Markdown versionado.
3. Escribir el CLI de Fase 0 con el Claude Agent SDK.
4. Armar el golden set: 20 tickets reales con el plan que un QA senior habría escrito. **Sin esto no hay auto-mejora posible** — es el instrumento de medición.
