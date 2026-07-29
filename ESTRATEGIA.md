# Kriteria — Estrategia de producto y foco de mercado

> Escrito 2026-07-29, basado en investigación del mercado actual.
> Complementa PLAN.md (arquitectura/fases); este documento responde *para quién* y *por qué ganamos*.

---

## 1. El mercado hoy: qué está saturado y qué está vacío

### Los hechos

- El mercado de automatización de pruebas vale **~$24.25B en 2026**. Forrester renombró la categoría a **"Autonomous Testing Platforms"** y perfila 31 vendors — reconociendo que la industria se estancó en ~25% de cobertura automatizada.
- **Generar casos de prueba desde Jira ya es commodity**: TestCollab, KaneAI, TestStory.ai, AgileTest lo hacen, con sync bidireccional, desde ~$0-100/mes. Competir ahí es competir en precio contra features regaladas.
- **La ejecución automatizada tiene dueños**: QA Wolf (servicio gestionado, $60k-250k+/año), mabl y testRigor ($10k-60k/año), Momentic, Testim. Empiezan en ~$5k/mes en sus planes serios.
- **El extremo barato existe pero es tonto**: los tiers de $60-300/mes (testRigor, mabl entry) dan herramienta de ejecución sin criterio — asumen que el equipo ya sabe qué probar.
- En LatAm, las pymes son >99% del tejido empresarial y >60% del empleo formal; la restricción presupuestal es la barrera número uno. No existe una herramienta de *criterio de QA* en español, con precios LatAm.

### La conclusión estructural

El mercado entero vende **manos** (ejecutar pruebas más rápido). Nadie vende **cabeza** (decidir qué probar, cuánto, en qué orden, y por qué). Todos los vendors asumen que el cliente tiene un QA senior que dirige; las empresas de 5-25 devs con 0-1 personas de QA — la mayoría absoluta en LatAm — no lo tienen.

**Ese es el hueco. Y es exactamente lo que Kriteria ya hace.**

---

## 2. Posicionamiento: el QA Lead que tu equipo no puede pagar

**Kriteria no es una herramienta de testing. Es un QA Lead senior como servicio.**

Recibe el ticket, decide la estrategia (ISTQB, auditable línea por línea), diseña los casos, se auto-critica adversarialmente, te entrega el plan con las preguntas que deberías hacerle a tu PM — y recuerda tu producto cada vez mejor.

### Diferenciadores reales vs. el mercado (lo que otros NO tienen)

| Diferenciador | Por qué nadie lo tiene | Evidencia nuestra |
|---|---|---|
| **Motor de estrategia determinista y explicable** | Todos usan LLM end-to-end (caja negra). Nuestra matriz ISTQB es código auditable: cada decisión trae su rationale | `packages/istqb`, 40 tests, cero tokens |
| **Crítico adversarial como gate** | Los generadores generan; ninguno refuta su propio output. Nuestro critic encontró session tokens de Places sin verificar, regresión de componente compartido, casos contradictorios | Corrida FR-1551: 16+13 hallazgos nivel senior |
| **Ambigüedades como entregable** | Ningún tool te dice "esto no se puede probar hasta que el PM responda X". Nosotros entregamos las preguntas con supuesto de trabajo y riesgo | 4 ambigüedades legítimas en FR-1551 |
| **Memoria organizacional por tenant** (Fase 4) | Los tools son amnésicos: cada ticket parte de cero. Kriteria acumula módulos, jerga, patrones de defecto, severidades del cliente | Diseñado, vault por tenant |
| **Trazabilidad estructural** | covers/mitigates/verifies en el schema, gaps detectables mecánicamente | `@kriteria/core` |
| **Español primero + precio LatAm** | Todo el mercado es inglés-primero con precios USA | Informe HTML en español ya operativo |
| **Costo transparente por corrida** | Vendors ocultan precios tras "book a demo" | ~$1-1.5/plan, visible en cada corrida |

### Lo que NO somos (tan importante como lo que sí)

- **No** competimos en ejecución automatizada — Momentic/mabl/QA Wolf tienen años de ventaja en infraestructura de browsers. **Exportamos hacia ellos** (Gherkin, CSV a TestRail/Xray) y eventualmente generamos el código que sus runners corren.
- **No** somos test management — Qase/TestRail existen; nos integramos.
- **No** perseguimos enterprise regulado al inicio — el motor explicable nos abre esa puerta *después*.

---

## 3. Cliente objetivo (ICP), en orden de ataque

### ICP-1: Fábricas de software y agencias en LatAm (empezar aquí)

Colombia tiene un ecosistema denso de dev shops (5-50 devs, múltiples proyectos de clientes). Su dolor: el QA es centro de costo, cada proyecto reinventa el proceso, perder un cliente por bugs es existencial, y un QA Lead senior cuesta $8-15M COP/mes que no pueden justificar por proyecto.

- **Propuesta**: cada proyecto nuevo arranca con planes de QA nivel senior desde el día uno. La memoria por tenant = memoria por *cliente final* (multi-proyecto nativo — nuestro modelo multi-tenant les sirve internamente).
- **Canal**: venta directa/red personal en Colombia, comunidades dev locales, casos de estudio.
- **Precio ancla**: $99-299 USD/mes por equipo (vs. $5k/mes del mercado gringo). Margen sano: costo marginal ~$1/plan.

### ICP-2: Startups producto 5-25 devs sin QA (LatAm → global)

El primer QA que contratan hereda cero proceso. Kriteria ES el proceso: llega el ticket, sale el plan, el dev ejecuta guiado. Self-service, freemium (3 planes/mes gratis), producto-led.

### ICP-3 (después): equipos QA establecidos que quieren elevar el nivel

Aquí compites con más ruido; entras cuando la memoria acumulada sea demostrable.

---

## 4. Norte del producto

> **"Un equipo sin QA senior obtiene, en menos de 10 minutos y por menos de $1 de costo marginal, el plan de pruebas que un QA Lead de 10 años de experiencia habría hecho — con las preguntas que ese QA le habría hecho al PM."**

Métricas que definen éxito (y alimentan la auto-mejora de Fase 4):

1. **Tasa de aprobación sin edición** del plan por un humano (proxy de calidad de juicio)
2. **Bugs escapados** en features planificadas con Kriteria vs. sin (el argumento de venta definitivo)
3. **Tiempo ticket→plan** (<10 min)
4. **Costo por plan** (<$1 en régimen)
5. **Retención de memoria**: ¿el plan del mes 6 es mejor que el del mes 1 para el mismo tenant?

---

## 5. Implicaciones para el roadmap (ajustes a PLAN.md)

Las fases se mantienen, con estos cambios de énfasis:

1. **Fase 2 cambia de prioridad: ejecución manual guiada ANTES que automatizada.** El ICP no tiene infra de automatización — necesita el checklist interactivo con captura de evidencia que un dev junior pueda seguir. La generación de código Playwright pasa a Fase 3+ como puente hacia los runners existentes.
2. **El informe legible es producto, no accesorio.** `qa report` es lo que el cliente ve; invertir en él (y su versión en la UI web) es invertir en la percepción de valor. Español e inglés.
3. **La memoria por tenant sube de prioridad** — es el foso real contra los incumbentes que agregarán "AI strategy" como feature. Adelantar lo posible de Fase 4 a Fase 2-3.
4. **Exportar bien > ejecutar**: Gherkin, CSV TestRail/Xray, y publicar el plan como subtarea de QA en Jira (esto último ya lo hace tu skill `qa-bundle-generator` — portarlo).
5. **Los lanes rápidos** (code review, API, seguridad) quedan para después del PMF del lane principal — un producto enfocado vence a una navaja suiza mediocre.

### Riesgos honestos

| Riesgo | Realidad | Mitigación |
|---|---|---|
| Incumbentes agregan "AI test planning" | Lo harán como feature checkbox; sin motor explicable ni memoria | Velocidad + foso de memoria + precio |
| "Cabeza sin manos" se percibe incompleto | Real: el plan hay que ejecutarlo | Ejecución manual guiada cierra el ciclo percibido |
| Vender a pymes LatAm es duro (ciclos cortos pero presupuestos chicos) | Real | Freemium PLG + fábricas de software como multiplicador (1 venta = N proyectos) |
| Fundador único | Real | Fase 0/1 son demostrables en solitario; levantar equipo/capital con el piloto |

---

## 6. Los próximos 90 días (secuencia concreta)

1. **Terminar la validación Fase 0**: 4 tickets más, medir ≥3/5 con tu criterio. Sin esto, nada de lo anterior importa.
2. **Golden set + evals** (Promptfoo): el instrumento que permite mejorar sin romper.
3. **Fase 1 con el recorte de foco**: UI mínima (pegar ticket → plan → informe → export), Better Auth, multi-tenant, solo-lectura.
4. **3 pilotos reales**: Veevart + 2 fábricas de software colombianas de tu red. Gratis a cambio de feedback y caso de estudio.
5. **Decidir con datos**: si los pilotos aprueban >60% de planes sin edición mayor, levantar la apuesta (precio, marca, quizás equipo). Si no, iterar el cerebro — que es barato iterar porque es código + evals.
