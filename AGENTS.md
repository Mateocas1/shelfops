# ShelfOps — Constitución de agentes

Este archivo gobierna todo el repositorio. Un `AGENTS.md` más cercano puede añadir
restricciones para su subárbol, pero no puede relajar estas reglas.

## 1. Misión y fase vigente

ShelfOps es un Retail Operations Control Plane auditable. La regla rectora es:

> Ambición sin techo; incrementos, autoridad y evidencia estrictamente acotados.

Fase vigente: `PLANNING_BASELINE`.

Hasta que el owner registre una autorización explícita, está prohibido implementar
endpoints, workers, migraciones, infraestructura o código de producto. La tarea
autorizada actualmente es producir y revisar el Planning Baseline descrito en
`CODEX_HANDOFF.md` y `plans/PLAN-0000-planning-baseline.md`.

## 2. Lectura y precedencia

Antes de modificar archivos, leer:

1. `PROJECT_BRIEF.md`
2. `PRD.md`
3. `CODEX_HANDOFF.md`
4. `ORCHESTRATION.md`
5. `QUALITY_GATES.md`
6. El plan y work order activos

Precedencia normativa:

1. Instrucción explícita y vigente del owner.
2. `AGENTS.md` aplicable al path.
3. Specs y contratos aprobados.
4. ADRs aceptados.
5. Plan y work order activos.
6. Código y tests.

Un chat, resumen de agente o recuerdo del modelo no es fuente de verdad durable.
Toda decisión durable debe persistirse como spec, ADR, plan, work order u `OPEN-*`.

## 3. IDs, trazabilidad y verdad

Usar IDs estables:

- `FR-*`, `NFR-*`, `INV-*`, `ACC-*`, `THR-*`, `OBS-*`
- `ADR-*`, `SO-*`, `OPEN-*`

Cada cambio debe declarar qué IDs cubre. No afirmar correctitud, rendimiento,
resiliencia o seguridad sin un oracle y evidencia reproducible.

## 4. Orquestación obligatoria

El agente padre actúa como Lead Orchestrator y es el único que puede:

- cambiar estados en `tasks/manifest.yaml`;
- asignar work orders;
- reconciliar resultados;
- decidir integración;
- declarar un gate `PASS`.

Puede delegar hasta tres subtareas independientes en paralelo. Todo subagente
debe recibir un task packet autocontenido, un write scope exclusivo y criterios
de aceptación. Los subagentes no delegan nuevamente (`max_depth = 1`).

No ejecutar dos writers sobre el mismo path. Contratos compartidos, migraciones,
schemas y lockfiles siempre se serializan. Reviewer y verifier no pueden ser el
implementer de la misma tarea.

## 5. Estados y transición

Estados permitidos:

`DRAFT`, `READY`, `CLAIMED`, `IMPLEMENTED`, `VERIFYING`, `REVIEWING`, `DONE`,
`BLOCKED`, `NEEDS_RESPEC`, `NEEDS_HUMAN`, `FAILED_RETRYABLE`.

Solo tomar una tarea `READY` con todos sus blockers en `DONE`. Una tarea llega a
`DONE` únicamente con acceptance, evidencia y revisión independiente aceptadas.

Máximo dos intentos de corrección por hipótesis. Si el mismo gate falla dos veces
o no existe una hipótesis nueva, crear `open-items/OPEN-<task-id>.md` y detener la
rama afectada. No entrar en loops.

## 6. Autoridad durante trabajo desatendido

Permitido dentro del workspace:

- leer, crear y editar artefactos del work order;
- ejecutar formatters, linters, tests y validadores autorizados;
- crear branch/worktree y commits locales de checkpoint;
- escribir evidencia y reportes `OPEN-*`.

Requiere autorización explícita del owner:

- instalar skills, plugins, dependencias o herramientas nuevas;
- habilitar red o ampliar permisos;
- hacer push, crear un PR o fusionar branches;
- cambiar un contrato aprobado o el alcance del producto;
- iniciar la primera ola de código de aplicación.

Siempre prohibido durante trabajo desatendido:

- `danger-full-access`, bypass de sandbox o exposición pública de app-server;
- desplegar, operar producción o usar secretos/datos reales;
- migraciones destructivas, force-push o merge directo a `main`;
- enviar mensajes, efectuar pagos o mutar sistemas externos;
- ocultar tests fallidos o degradar gates para obtener `PASS`.

## 7. Verificación mínima

En fase de planificación:

- validar estructura y enlaces Markdown;
- validar YAML/JSON/OpenAPI/AsyncAPI cuando existan;
- comprobar unicidad y trazabilidad de IDs;
- revisar contradicciones entre Brief, PRD, specs, contratos y ADRs;
- hacer una revisión clean-room del onboarding y del plan.

En implementación se aplican G0–G6 de `CODEX_HANDOFF.md` y
`QUALITY_GATES.md`. Un resultado puede ser `FAIL` o `INCONCLUSIVE`; nunca se
convierte en `PASS` por falta de tiempo.

## 8. Cierre obligatorio

Cada ejecución debe cerrar con:

- estado final y motivo;
- tareas y requirement IDs cubiertos;
- archivos modificados;
- comandos y resultados;
- evidencia producida;
- riesgos y preguntas abiertas;
- siguiente acción segura recomendada.

Si se necesita una decisión humana, documentarla primero y después pedirla.
