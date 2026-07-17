# ShelfOps Remote Execution & Planning Pack

Paquete autocontenido para llevar ShelfOps desde la idea hasta una planificación
SDD detallada y gestionarla mediante Codex Desktop/Remote.

## Orden de lectura

1. [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) — North Star, tesis, escenario insignia y decisiones iniciales.
2. [`PRD.md`](PRD.md) — requisitos, invariantes, arquitectura objetivo, estados de madurez y criterios de éxito.
3. [`CODEX_HANDOFF.md`](CODEX_HANDOFF.md) — workflow agentic, roles, gates, task packets y prompt de inicio.
4. [`AGENTS.md`](AGENTS.md) — constitución persistente y límites de autoridad.
5. [`ORCHESTRATION.md`](ORCHESTRATION.md) — scheduler, estados, reintentos y cierre de olas.
6. [`REMOTE_BOOTSTRAP.md`](REMOTE_BOOTSTRAP.md) — arranque y gestión desde el móvil.
7. [`plans/PLAN-0000-planning-baseline.md`](plans/PLAN-0000-planning-baseline.md) y
   [`tasks/manifest.yaml`](tasks/manifest.yaml) — primera ola ejecutable de planificación.

## Estado actual

El producto está en **pre-planificación**. El paquete permite iniciar la próxima fase, pero no autoriza todavía la implementación de código de aplicación.

La siguiente ejecución en Codex debe generar el Planning Baseline: glosario,
modelo de dominio, capability specs, contratos, ADRs, threat model, SLOs, plan
DAG y la propuesta de la primera ola de implementación. La implementación sigue
desautorizada hasta revisión explícita del owner.

## Inicio rápido remoto

1. Abrir el repositorio/carpeta desde **Remote** en la app móvil.
2. Seleccionar `gpt-5.6-sol` con effort `high`.
3. Enviar [`prompts/PLANNING_BOOTSTRAP.md`](prompts/PLANNING_BOOTSTRAP.md).
4. Revisar gates, `OPEN-*`, diff y propuesta `WAVE-01`.
5. Solo después de autorizarla, iniciar `/goal` con
   [`prompts/GOAL_IMPLEMENTATION_TEMPLATE.md`](prompts/GOAL_IMPLEMENTATION_TEMPLATE.md).

## Regla rectora

> Ambición sin techo; incrementos, autoridad y evidencia estrictamente acotados.

La IA acelera el trabajo, pero cada claim de correctitud, escala, resiliencia o seguridad deberá tener evidencia reproducible.
