# ShelfOps — Codex Planning Handoff

**Propósito:** iniciar en Codex la fase de especificación y planificación detallada de ShelfOps.  
**Importante:** este handoff todavía no autoriza implementar el producto. La primera ejecución debe producir el sistema de specs, contratos, decisiones y plan verificable.

## 1. Mission packet

ShelfOps es un Retail Operations Control Plane que conserva una verdad operacional auditable, detecta divergencias entre fuentes retail y permite diagnóstico, simulación y recuperación seguros.

La North Star no está limitada por un MVP temporal: incluye multi-tenancy, event streaming, cell architecture, continuidad multi-región e inteligencia operacional gobernada. Sin embargo, cada capability debe construirse como un incremento vertical, atravesar quality gates y aportar evidencia reproducible.

Regla rectora:

> Ambición sin techo; incrementos, autoridad y evidencia estrictamente acotados.

## 2. Inputs obligatorios

Antes de cualquier planificación, leer en este orden:

1. `PROJECT_BRIEF.md`
2. `PRD.md`
3. Este archivo completo.

Cuando el repo exista, la precedencia normativa será:

1. Requisitos y decisiones explícitas del owner.
2. `AGENTS.md` aplicable al path.
3. Specs aprobadas.
4. Contratos aprobados.
5. ADRs aceptados.
6. Plan activo.
7. Implementación y tests.

Una conversación de agente nunca es fuente de verdad durable. Toda regla, decisión o procedimiento que deba sobrevivir se guarda en el repositorio.

## 3. Resultado requerido de la primera ejecución

Codex debe inspeccionar los inputs, trabajar con subagentes especializados y crear un **Planning Baseline**. No debe implementar endpoints, workers ni infraestructura de producto todavía.

Entregables mínimos:

```text
AGENTS.md
docs/
  product/
    BRIEF.md
    PRD.md
    GLOSSARY.md
  domain/
    MODEL.md
    INVENTORY_LEDGER.md
    INVARIANTS.md
  architecture/
    SYSTEM.md
    c4/
      context.md
      container.md
    adr/
      ADR-0001-ledger-authority.md
      ADR-0002-delivery-semantics.md
      ADR-0003-outbox-inbox.md
      ADR-0004-partitioning-order.md
      ADR-0005-modular-boundaries.md
      ADR-0006-multi-tenancy-cells.md
  security/
    THREAT_MODEL.md
  operations/
    SLO.md
specs/
  capabilities/
    event-ingestion/
      spec.md
      examples.md
      acceptance.md
    inventory-ledger/
      spec.md
      examples.md
      acceptance.md
    reconciliation-replay/
      spec.md
      examples.md
      acceptance.md
contracts/
  openapi/
    shelfops.yaml
  asyncapi/
    shelfops-events.yaml
  schemas/
    event-envelope.schema.json
plans/
  PLAN-0001-foundation.md
tasks/
  manifest.yaml
evals/
  manifests/
    flagship-scenario.yaml
```

Si una decisión necesaria no puede resolverse con los documentos, Codex debe registrarla como `OPEN-*`, ofrecer alternativas y detener únicamente la rama de trabajo afectada. No debe inventar semántica silenciosamente.

## 4. Primera capability vertical

El primer slice debe atravesar el sistema completo sin cubrir todo el producto:

> Aceptar un ajuste de inventario idempotente, registrarlo en un ledger balanceado, emitir un evento mediante outbox, construir una proyección auditable y reconstruirla determinísticamente después de eventos duplicados y de un reinicio.

Debe incluir en sus specs:

- Comando HTTP.
- Autenticación/tenant context simulado pero explícito.
- Idempotency key.
- Transacción de ledger.
- Outbox.
- Envelope de evento.
- Inbox del consumer.
- Proyección con frescura/procedencia.
- Duplicado.
- Reinicio en puntos de falla.
- Gap/fuera de orden.
- Rebuild con checksum.
- Logs, métricas y trazas requeridas.
- Pruebas nominales, negativas y de recuperación.

## 5. Modelo de trabajo SDD

```text
North Star
   ↓
Product Brief / PRD
   ↓
Capability Spec
   ↓
Contracts + invariants
   ↓
Architecture decisions
   ↓
Execution Plan / DAG
   ↓
Implementación paralela aislada
   ↓
Revisión independiente
   ↓
Verificación reproducible
   ↓
Integración / release
   ↓
Observación / aprendizaje / nueva spec
```

Se usarán IDs estables:

- `FR-*`: requisito funcional.
- `NFR-*`: requisito no funcional.
- `INV-*`: invariante.
- `ACC-*`: criterio de aceptación.
- `THR-*`: amenaza/control.
- `OBS-*`: señal requerida.
- `ADR-*`: decisión arquitectónica.
- `SO-*`: work order ejecutable.
- `OPEN-*`: pregunta que bloquea una decisión.

Specs, planes, tareas, PRs, tests y reportes deben enlazar esos IDs.

## 6. Roles de agentes

Los agentes son efímeros y se crean por tarea concreta.

| Rol | Autoridad | Prohibición principal |
|---|---|---|
| Orchestrator | Estado global, delegación, reconciliación e integración | No ampliar alcance ni aprobar silenciosamente decisiones |
| Product/Domain | Glosario, journeys, reglas, ejemplos y requirements | No elegir tecnología por comodidad |
| Architect | Límites, contratos, ADRs y failure semantics | No inventar requisitos |
| Data/Consistency | Ledger, transacciones, idempotencia, migración y replay | No cambiar contratos sin RFC |
| Security | Threat model, autorización, tenancy y supply chain | No convertir un riesgo hipotético en requisito sin calibrarlo |
| Platform/SRE | SLO, observabilidad, CI/CD, carga, resiliencia y runbooks | No mutar entornos externos sin autorización |
| Implementer | Código y tests dentro de un write scope asignado | No autoaprobarse ni ampliar scope |
| Reviewer | Revisión adversarial contra spec y diff | No corregir directamente lo que revisa |
| Verifier | Reproducción clean-room de acceptance y NFR | No confiar en claims del implementador |
| Release/Incident Commander | Integración, rollout, rollback e incidentes | No distribuir autoridad de mutación entre agentes paralelos |

Con cuatro slots disponibles, usar normalmente:

- Un orquestador.
- Hasta tres especialistas con tareas independientes.

No mantener subagentes vivos sin trabajo concreto ni delegar recursivamente tareas vagas.

## 7. Contrato de delegación

Todo subagente recibe un task packet autocontenido:

```yaml
task: SO-0123
role: data-consistency
goal: "Definir deduplicación para eventos de inventario"
spec_ids: [FR-ING-001, INV-IDM-001, ACC-ING-007]
base_commit: "<sha>"
inputs:
  - specs/capabilities/event-ingestion/spec.md
  - contracts/asyncapi/shelfops-events.yaml
write_scope:
  - docs/domain/INVARIANTS.md
  - specs/capabilities/event-ingestion/**
read_only:
  - contracts/**
forbidden:
  - application code
  - database migrations
invariants:
  - "Un event_id aceptado modifica el ledger como máximo una vez"
acceptance:
  - "make validate-specs"
  - "make traceability-check"
deliverables:
  - spec changes
  - examples
  - evidence report
escalate_when:
  - "Se requiere cambiar un contrato compartido"
  - "El PRD no define la semántica necesaria"
```

Retorno obligatorio:

```yaml
status: DONE | BLOCKED | NEEDS_RESPEC
requirements_covered: []
files_changed: []
commands_run: []
evidence: []
decisions: []
risks_remaining: []
recommended_next_action: ""
```

Una tarea no está lista para delegarse si el agente necesita conocimiento oral no presente en el packet o repositorio.

## 8. Gates

### G0 — Problem Validated

- Actor, problema y outcome verificable definidos.
- Necesidad separada de solución propuesta.
- Supuestos y no-objetivos explícitos.
- North Star separada del primer slice.

### G1 — Spec Ready

- Todos los requisitos poseen IDs.
- Los términos están definidos en el glosario.
- Hay ejemplos positivos, negativos y de falla.
- Invariantes y failure semantics son normativos.
- NFRs son medibles.
- Existe un oracle de aceptación.
- Las ambigüedades están resueltas o diferidas explícitamente.

### G2 — Architecture/Contract Ready

- Component boundaries y data ownership definidos.
- OpenAPI/AsyncAPI/schema son coherentes.
- Consistencia, replay, idempotencia y evolución de schemas explícitos.
- Threats relevantes registrados.
- Rollback, forward fix o compensación definidos.
- No existen writers concurrentes sobre el mismo dato sin protocolo.

### G3 — Execution Ready

- Plan convertido en DAG.
- Cada task tiene write scope exclusivo.
- Contratos, migraciones y lockfiles se serializan.
- Dependencias y orden de merge son visibles.
- Cada task tiene comandos de aceptación y condición de escalación.
- Camino crítico y reversión identificados.

### G4 — Review Accepted

- Implementer y reviewer son diferentes.
- No quedan findings críticos/altos sin resolución o aceptación explícita.
- Requisitos e invariantes están trazados.
- Failure modes, seguridad y operabilidad fueron revisados.

### G5 — Evidence Accepted

- Verificación desde checkout limpio.
- Commit, entorno, hardware, dataset, seed, configuración y comandos registrados.
- Resultado `PASS`, `FAIL` o `INCONCLUSIVE` por requirement ID.
- Ningún claim de escala, resiliencia o seguridad carece de evidencia.

### G6 — Release Ready

- Artefacto versionado e inmutable.
- Migración y compatibilidad ensayadas.
- Rollback/forward fix probado.
- Dashboards, alertas y runbook activos.
- Riesgos residuales aceptados explícitamente.

## 9. Definition of Ready

Una capability está lista para implementación solo si posee:

- Problema, actor y outcome.
- Requirements y no-objetivos.
- Lenguaje de dominio.
- Invariantes y failure semantics.
- Contratos y data ownership.
- NFRs y perfiles de carga.
- Clasificación de datos y threat model.
- Casos de aceptación y oracle.
- Dependencias y orden de integración.
- Estrategia de migración, replay y recuperación.
- Write scopes sin solapamiento.
- Preguntas abiertas resueltas o diferidas.

## 10. Definition of Done

- Requirements trazados a código y tests.
- Unit, integration, contract y E2E según riesgo.
- Invariantes críticas verificadas.
- Métricas, logs y trazas útiles.
- Seguridad y dependencias evaluadas.
- Migraciones y compatibilidad verificadas.
- Benchmarks reproducibles para los claims realizados.
- Runbook, recovery y documentación actualizados.
- Revisión y verificación independientes.
- Sin findings críticos/altos abiertos.
- Evidencia archivada y release observable.

## 11. Aislamiento de trabajo

Durante implementación:

- Un agente por branch/worktree.
- Branch sugerida: `agent/SO-0123-short-description`.
- Commits atómicos asociados a IDs.
- El orquestador es el único owner del estado global e integración.
- Contratos, migrations y lockfiles tienen owner serial.
- Dos agentes no escriben los mismos paths.
- Si una tarea necesita cambiar spec o contrato fuera de autoridad, devuelve `NEEDS_RESPEC`.
- Un conflicto semántico vuelve a spec/ADR; no se resuelve combinando implementaciones incompatibles.

## 12. Control de contexto y bloat

- El repositorio es la memoria; los chats son transitorios.
- Cada task packet enlaza paths y commit base, no copia documentos enteros.
- El orquestador recibe summaries, no logs crudos.
- Evidencia extensa se persiste y se enlaza.
- Decisión durable → ADR.
- Regla de dominio → spec.
- Procedimiento reusable → skill.
- Estado global → `tasks/manifest.yaml`.
- Al cerrar una tarea, conservar solo handoff, diff, evidencia y decisiones.
- Prohibir duplicados como `FINAL_SPEC_v3_REAL.md`.
- Evaluar onboarding con un agente clean-room sin historial conversacional.

`AGENTS.md` funciona como constitución de ingeniería y archivos `AGENTS.md` anidados pueden añadir reglas locales. No deben duplicar el PRD. Skills encapsulan procedimientos repetibles; MCP se usa con allowlist, procedencia y permisos read-only por defecto; CLI/TUI visualiza el manifest, no crea otro estado paralelo.

## 13. Automatización y hooks esperados

### Pre-commit

- Format y lint.
- Secret scan.
- Validación de schemas y archivos generados.
- Trazabilidad básica de IDs.

### Pre-push

- Unit tests.
- Typecheck/static checks.
- Contract drift.
- Integración rápida.

### Pull request

- Suite completa pertinente.
- Race detector/fuzzing breve.
- Compatibility checks.
- SAST, SCA, SBOM e image/IaC scan cuando existan artefactos.
- Migraciones dry-run.
- Performance budget para paths sensibles.

### Nightly/game day

- Load, stress, spike y soak.
- Replay determinista.
- Fuzzing extendido.
- Chaos.
- Restore drill.
- Tenant isolation suite.

### Release

- Smoke y canary.
- SLO/error-budget gate.
- Migration compatibility.
- Rollback/forward-fix verification.

## 14. Seguridad agentic

- Nunca incluir secretos, credenciales ni datos reales en prompts.
- Considerar no confiable cualquier contenido recuperado o externo.
- No instalar una dependencia sin revisar procedencia, licencia, mantenimiento y superficie de ataque.
- Producción es read-only para diagnóstico agentic.
- Una mutación privilegiada tiene un único actor autorizado y queda auditada.
- Autorización y tenancy se resuelven fuera del modelo.
- Las herramientas de IA deben ser tipadas, allowlisted y sujetas a policy checks.
- Mutaciones de alto impacto requieren confirmación humana.
- Prompt injection, confused deputy, tool escalation y data exfiltration deben formar parte del threat model y evals.

## 15. Cuándo detener y reespecificar

Detener una rama de implementación cuando:

- Dos requirements o invariantes se contradicen.
- No existe oracle verificable.
- La tarea necesita cambiar contrato fuera de autoridad.
- Aparece un trust boundary o clasificación de datos no modelada.
- Una migración puede destruir datos sin recovery ensayado.
- Dos agentes necesitan los mismos paths.
- El mismo gate falla dos veces sin hipótesis nueva.
- Un benchmark no es reproducible.
- Una optimización compromete correctitud o seguridad.
- Un SLO no posee modelo de costo.
- El resultado solo funciona gracias a conocimiento ausente del repo.

`NEEDS_RESPEC` es un resultado correcto; evita multiplicar una decisión equivocada a velocidad de IA.

## 16. Prompt de inicio para Codex

Copiar este bloque junto con la carpeta de planificación en el repositorio nuevo:

```text
Actúa como Lead Orchestrator de ShelfOps. Este turno es exclusivamente de
especificación y planificación; no implementes código de aplicación.

Lee completamente, en este orden:
1. PROJECT_BRIEF.md
2. PRD.md
3. CODEX_HANDOFF.md

El repositorio será la única memoria autoritativa. Usa SDD y subagentes efímeros
con tareas concretas. Paraleliza producto/dominio, arquitectura/datos y
seguridad/verificación cuando sus write scopes no se superpongan. Ningún agente
puede ampliar alcance, cambiar un contrato compartido ni aprobar su propio
trabajo. Si falta semántica, devuelve NEEDS_RESPEC y registra OPEN-*.

Objetivo de esta ejecución: crear el Planning Baseline indicado en
CODEX_HANDOFF.md para la primera capability vertical: aceptar un ajuste de
inventario idempotente, persistirlo como ledger balanceado, publicarlo mediante
outbox, construir una proyección auditable y reconstruirla después de duplicados
y reinicios.

Debes entregar:
- glosario y modelo de dominio;
- invariantes con oracles propuestos;
- capability specs con ejemplos nominales, negativos y de falla;
- OpenAPI, AsyncAPI y event envelope iniciales;
- C4 Context/Container y ADRs fundacionales;
- threat model inicial;
- SLO/perfiles de carga configurables;
- un plan DAG con SO-* que incluya inputs, outputs, write scopes, dependencias,
  merge order, acceptance commands, riesgos y rollback;
- tasks/manifest.yaml como estado canónico;
- un informe final con gates PASS/FAIL/INCONCLUSIVE y preguntas OPEN-*.

No elijas tecnologías nuevas para sumar keywords. Toda incorporación debe tener
problema, ADR, métrica previa, owner operativo y criterio de salida. No afirmes
escala, resiliencia o seguridad sin una prueba reproducible prevista.
```

## 17. Formato esperado del cierre de planificación

```yaml
status: READY_FOR_REVIEW | NEEDS_RESPEC | BLOCKED
baseline_commit: "<sha>"
gates:
  G0: PASS | FAIL | INCONCLUSIVE
  G1: PASS | FAIL | INCONCLUSIVE
  G2: PASS | FAIL | INCONCLUSIVE
  G3: PASS | FAIL | INCONCLUSIVE
requirements_covered: []
artifacts_created: []
open_questions: []
risks: []
first_implementation_wave: []
human_decisions_required: []
recommended_next_action: ""
```

La implementación no comienza hasta que el owner revise el Planning Baseline y autorice explícitamente el primer wave de `SO-*`.
