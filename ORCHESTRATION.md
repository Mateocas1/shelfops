# ShelfOps — Protocolo de orquestación

## 1. Objetivo

Este protocolo permite que Codex avance de forma autónoma dentro de una ola
finita y preaprobada, conservando gates, separación de responsabilidades y un
registro recuperable. No implementa un encadenamiento implícito de `/goal`.
El equivalente controlable es una cola versionada de work orders.

## 2. Componentes de control

| Componente | Responsabilidad | Fuente de verdad |
|---|---|---|
| Owner | Autoriza alcance, publicación y olas | Decisión registrada |
| Lead Orchestrator | Scheduler, reconciliación y estado global | `tasks/manifest.yaml` |
| Planner | Specs, ADRs, contratos y planes | Archivos versionados |
| Implementer | Código y tests de un work order | Branch/worktree aislado |
| Verifier | Reproduce acceptance | `evidence/` |
| Reviewer | Revisión adversarial | Reporte de review |

## 3. Control loop

El Lead Orchestrator repite el siguiente ciclo solo mientras la ola activa tenga
trabajo ejecutable:

1. Leer `AGENTS.md`, este protocolo y `tasks/manifest.yaml` desde disco.
2. Reconciliar tareas `CLAIMED` con resultados/evidencia existentes.
3. Seleccionar únicamente tareas `READY` cuyos blockers estén `DONE`.
4. Detectar solapamientos de write scope; si existen, serializar o bloquear.
5. Crear un task packet por tarea y delegar solo trabajo independiente.
6. Esperar todos los resultados de la tanda.
7. Ejecutar acceptance y asignar verifier/reviewer independientes.
8. Registrar evidencia y transición de estado.
9. Crear un checkpoint local coherente.
10. Repetir o finalizar según las condiciones de salida.

El manifest se relee antes de cada asignación. Los summaries de agentes son
inputs no autoritativos hasta ser reconciliados contra archivos, diff y comandos.

## 4. Reglas del scheduler

- Máximo cuatro threads totales: un orquestador y hasta tres subagentes.
- Profundidad máxima uno; un subagente no crea descendientes.
- Preferir paralelismo read-heavy. Writers paralelos requieren paths disjuntos.
- El orquestador es el único writer de `tasks/manifest.yaml`.
- Una tarea no puede reclamar contratos, schemas, migrations o lockfiles si otra
  tarea los posee.
- El reviewer no corrige directamente; devuelve findings y evidencia.
- Una corrección crea un nuevo intento sobre la misma tarea, no una tarea oculta.
- Toda ampliación de alcance vuelve a `DRAFT` o `NEEDS_RESPEC`.

## 5. Política de reintentos

Se permiten dos correcciones como máximo si cada una contiene:

- hipótesis causal nueva;
- cambio acotado;
- comando que puede falsar la hipótesis;
- rollback simple.

Después del segundo fallo, o ante un fallo no reproducible, marcar
`NEEDS_HUMAN`, `NEEDS_RESPEC` o `BLOCKED` y escribir un `OPEN-*`.

## 6. Integración

Durante las primeras olas:

- un branch/worktree por writer;
- commits atómicos enlazados a `SO-*`;
- sin merge automático a `main`;
- contratos y cambios estructurales entran antes que consumidores;
- una tarea dependiente se rebasa sobre el commit aceptado, no sobre summaries;
- todo conflicto semántico vuelve a spec/ADR.

## 7. Condiciones de finalización de una ola

Una ola termina cuando ocurre el primer caso aplicable:

1. Todas las tareas de la ola están `DONE`.
2. No queda ninguna tarea `READY` ejecutable.
3. Existe un `NEEDS_HUMAN` que bloquea el camino crítico.
4. Se agotó el presupuesto definido para la ola.
5. Un riesgo de seguridad o integridad requiere detener toda la ola.

El cierre debe producir `evidence/WAVE-<id>-REPORT.md` con estados, gates,
comandos, commits, fallos, riesgos y siguiente ola propuesta. Proponer no es
autorizar: una ola posterior queda `DRAFT` hasta aprobación del owner.

## 8. Contrato de `/goal`

Cada Goal debe apuntar a un único archivo de ola y usar este patrón:

```text
Ejecuta la ola <WAVE-ID> definida en tasks/manifest.yaml conforme a AGENTS.md,
ORCHESTRATION.md y QUALITY_GATES.md. Trabaja solo sobre tareas READY de esa ola.
Finaliza cuando todas estén DONE o no quede trabajo seguro ejecutable. Conserva
evidencia, detén loops tras dos intentos y registra toda decisión humana como
OPEN-*. No publiques, despliegues ni fusiones a main.
```

No usar Goals como backlog infinito. El agente puede proponer la siguiente ola,
pero no iniciarla sin autorización durable.

## 9. Scheduled dispatcher opcional

Una tarea programada puede despertar el chat y ejecutar una iteración del control
loop. Debe usar el mismo manifest, la misma condición de salida y un workspace o
worktree aislado. No debe reemplazar los gates ni operar con acceso completo.

Prompt durable sugerido:

```text
Relee AGENTS.md, ORCHESTRATION.md y tasks/manifest.yaml. Reconciliá el estado de
la ola activa. Si existe trabajo READY, ejecuta como máximo una tanda segura y
verifícala. Si no existe, reporta el bloqueo o cierre sin inventar tareas. Nunca
inicies una ola DRAFT, publiques cambios, despliegues ni amplíes permisos.
```
