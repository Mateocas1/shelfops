# OPEN-REPOSITORY-PUBLICATION

**Estado:** NEEDS_HUMAN  
**Bloquea:** publicación y clone remoto; no bloquea planificación local

## Decisión

Crear un repositorio independiente `Mateocas1/shelfops`, recomendado inicialmente
como privado, y publicar este baseline en una branch de planificación.

## Motivo

ShelfOps es independiente de `invent-stock` y `ofertaSUPER`. Reutilizar sus
repositorios mezclaría historia, permisos y decisiones no relacionadas.

## Opción recomendada

- Repo: `Mateocas1/shelfops`
- Visibilidad inicial: privada
- Default branch: `main`
- Primera branch: `planning/baseline`
- Primer PR: draft, solo artefactos de planificación

## Autoridad requerida

El owner debe confirmar creación y visibilidad. Hasta entonces no hacer push ni
crear PR.
