# Prompt — Scheduled dispatcher

Relee `AGENTS.md`, `ORCHESTRATION.md` y `tasks/manifest.yaml`. Reconciliá el
estado de la ola activa usando archivos, diffs y evidencia. Si hay tareas `READY`
con blockers `DONE`, ejecuta como máximo una tanda segura con write scopes
disjuntos, verificación y review independientes. Si no hay trabajo ejecutable,
reporta el cierre o bloqueo sin inventar tareas.

No inicies olas `DRAFT`, no cambies requisitos o contratos aprobados, no instales
dependencias, no amplíes permisos, no publiques, no despliegues y no fusiones a
`main`. Respeta dos intentos máximos y documenta todo bloqueo como `OPEN-*`.
