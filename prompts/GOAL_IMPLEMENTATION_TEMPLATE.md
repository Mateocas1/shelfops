# Goal — Template de ola de implementación

Reemplazar `<WAVE-ID>` antes de usar. El texto posterior a la línea debe caber en
el objetivo de `/goal`; el detalle vive en el repositorio.

---

Ejecuta la ola `<WAVE-ID>` definida y autorizada en `tasks/manifest.yaml`.
Cumple `AGENTS.md`, `ORCHESTRATION.md`, `QUALITY_GATES.md`, las specs, contratos
y el ExecPlan activo. Procesa solo tareas `READY` de esa ola con blockers `DONE`.
Usa implementers `gpt-5.6-sol` low para work orders acotados y reviewers/verifiers
independientes; el padre conserva razonamiento high. Nunca solapes write scopes.

Una tarea solo llega a `DONE` con acceptance, tests, evidencia y review `PASS`.
Máximo dos correcciones con hipótesis nueva. Ante ambigüedad, riesgo, permiso
faltante o fallo persistente, crea `OPEN-*` y marca `NEEDS_HUMAN`, `NEEDS_RESPEC`
o `BLOCKED`. Continúa solo con trabajo independiente seguro.

Finaliza cuando toda la ola esté `DONE` o no quede trabajo seguro ejecutable.
No inicies otra ola, no amplíes alcance, no instales dependencias, no despliegues,
no hagas push y no fusiones a `main`. Produce el reporte de ola y la siguiente
acción recomendada.
