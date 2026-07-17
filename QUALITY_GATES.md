# ShelfOps — Política operacional de gates

La definición completa de G0–G6 está en `CODEX_HANDOFF.md`. Este archivo define
cómo aplicarla en ejecución autónoma.

## Reglas generales

- Todo gate se registra como `PASS`, `FAIL` o `INCONCLUSIVE`.
- `PASS` requiere evidencia enlazada; ausencia de evidencia es `INCONCLUSIVE`.
- Un agente no aprueba su propio trabajo.
- No se debilita un criterio para hacer pasar una implementación.
- Un finding crítico o alto bloquea integración salvo aceptación explícita del
  owner, registrada con alcance y motivo.

## Gates por transición

| Transición | Gate requerido | Evidencia mínima |
|---|---|---|
| `DRAFT → READY` | G1/G2 según tarea | spec, contratos, invariantes, oracle |
| `READY → CLAIMED` | G3 | packet, blockers, write scope, base commit |
| `IMPLEMENTED → VERIFYING` | aceptación del implementer | diff, tests declarados, comandos |
| `VERIFYING → REVIEWING` | verificación reproducible | checkout/entorno y resultados |
| `REVIEWING → DONE` | G4/G5 | review independiente sin blockers |
| ola → release | G6 | artefacto, compatibilidad, rollback y operación |

## Planning Baseline

La fase actual exige G0–G3. Antes de autorizar código de producto deben existir:

- glosario, modelo de dominio e invariantes;
- capability spec y acceptance del primer slice;
- OpenAPI, AsyncAPI y schemas mínimos coherentes;
- C4 y ADRs fundacionales;
- threat model y clasificación de datos;
- SLOs y perfiles de carga parametrizables;
- DAG con work orders, write scopes y merge order;
- manifest revisado y reporte clean-room.

## Evidencia

Cada evidencia debe registrar, cuando aplique:

- task/requirement IDs;
- commit o estado exacto del árbol;
- herramienta y versión;
- comando completo;
- seed, dataset y configuración;
- resultado observado y esperado;
- `PASS`, `FAIL` o `INCONCLUSIVE`;
- limitaciones conocidas.

Los logs extensos se guardan como artefactos y se enlazan; no se copian al
manifest ni al resumen del orquestador.
