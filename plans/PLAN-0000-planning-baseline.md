# PLAN-0000 — Planning Baseline

**Estado:** READY  
**Fase:** planificación únicamente  
**Owner:** Mateo Vázquez  
**Gate objetivo:** G0–G3

## Propósito

Convertir el Brief, PRD y handoff existentes en una base de especificaciones,
contratos, decisiones y work orders que permita delegar la primera capability a
agentes con contexto limpio y criterios verificables.

## Condición observable de éxito

Existe el árbol mínimo definido en `CODEX_HANDOFF.md`; sus artefactos son
coherentes y trazables; un reviewer clean-room puede explicar el slice inicial,
sus invariantes, failure modes y acceptance; y `WAVE-01` queda propuesta como
`DRAFT`, sin autorizar implementación.

## Restricciones

- No código de aplicación, migraciones ni infraestructura.
- No nuevas tecnologías sin ADR y necesidad demostrada.
- No instalación de dependencias o skills.
- Datos únicamente sintéticos, públicos o generados.
- Un solo writer para manifest, contratos compartidos y schemas.
- Toda ambigüedad material se registra como `OPEN-*`.

## Secuencia

1. `SO-PLAN-001`: crear estructura y controles de validación sin dependencias.
2. En paralelo, con scopes disjuntos:
   - `SO-PLAN-002`: producto, glosario, dominio e invariantes.
   - `SO-PLAN-003`: arquitectura y ADRs.
   - `SO-PLAN-004`: threat model, SLOs y perfiles.
3. `SO-PLAN-005`: capability specs y contratos, reconciliando 002–004.
4. `SO-PLAN-006`: DAG de implementación, eval insignia y propuesta `WAVE-01`.
5. `SO-PLAN-007`: revisión clean-room y cierre G0–G3.

## Validación esperada

- estructura requerida presente;
- enlaces Markdown internos resolubles;
- YAML y JSON parseables;
- OpenAPI/AsyncAPI/schemas válidos cuando se creen;
- IDs únicos y trazables;
- no contradicciones silenciosas;
- reporte G0–G3 con evidencia y `OPEN-*`.

## Recuperación

Cada tarea produce commits locales atómicos. Ante conflicto semántico, revertir
solo la tarea afectada o dejarla aislada, conservar evidencia y volver a spec.

## Resultado final

Usar el formato de cierre de `CODEX_HANDOFF.md` y crear
`evidence/WAVE-PLANNING-BASELINE-REPORT.md`.
