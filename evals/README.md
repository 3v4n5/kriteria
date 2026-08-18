# Golden set y evals

El instrumento de medición del proyecto. Sin esto no hay forma de saber si un
cambio de prompt mejoró o empeoró el juicio del sistema — y por lo tanto no hay
auto-mejora posible, solo intuición.

## Cómo usarlo

1. Copia `golden/_plantilla.yml` a `golden/<TICKET>.yml`.
2. **Llénala con tu criterio, sin mirar el plan generado.** Es la única forma de
   que la medición signifique algo: un golden derivado del output se evalúa
   contra sí mismo y siempre da 100%.
3. Corre el plan del ticket (`pnpm qa plan --from jira:<TICKET>`).
4. Lee el informe (`pnpm qa report out/<TICKET>`) y anota tu veredicto en
   `humanVerdict.wouldHaveDoneThis`.
5. Mide: `pnpm qa eval` — gratis, sin llamadas a la API.

## Las dos métricas, y por qué se guardan las dos

| Métrica | Qué mide | Para qué sirve |
|---|---|---|
| **Puntaje mecánico** | dimensiones acertadas / dimensiones evaluadas | Detecta regresiones al cambiar prompts o el motor. Corre en segundos, cuesta $0. |
| **Veredicto humano** | planes que un QA senior aprobaría | El criterio real de Fase 0 (≥3/5). Es lento y caro, pero es la verdad. |

La pregunta interesante a mediano plazo es si el **puntaje mecánico predice el
veredicto humano**. Si lo hace, se puede iterar rápido con el puntaje y
reservar la revisión humana para confirmar. Si no lo hace, el puntaje mide las
dimensiones equivocadas y hay que rediseñarlo. Guardar ambos por separado es lo
que permite responder eso con datos en vez de con fe.

## Estados de cada dimensión

- ✅ `match` — el plan decidió lo esperado
- 🟡 `acceptable` — una alternativa que declaraste válida, no tu primera opción
- ❌ `mismatch` — desacuerdo real
- ◻️ `not-scored` — no registraste expectativa; **no cuenta como aprobado**
