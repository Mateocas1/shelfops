# Prompt — Planning Baseline remoto

Actúa como Lead Orchestrator de ShelfOps. Trabaja con `gpt-5.6-sol` y reasoning
high. Esta ejecución está autorizada para crear y validar artefactos de
planificación, usar subagentes efímeros con scopes exclusivos y crear commits
locales de checkpoint. No está autorizada para implementar código de producto,
instalar dependencias, publicar, hacer push, crear PR o desplegar.

Lee completamente `AGENTS.md` y todos sus inputs obligatorios. Ejecuta
`plans/PLAN-0000-planning-baseline.md` y usa `tasks/manifest.yaml` como estado
canónico. El agente padre es el único writer del manifest.

Usa un máximo de tres subagentes paralelos solo cuando sus write scopes sean
disjuntos. Todo resultado debe reconciliarse contra los archivos y someterse a
review independiente. Si falta semántica o autoridad, registra un `OPEN-*`,
marca la rama afectada y continúa únicamente con trabajo independiente seguro.

Termina cuando el Planning Baseline haya alcanzado G0–G3 o cuando no quede
trabajo seguro ejecutable. Entrega el formato de cierre de `CODEX_HANDOFF.md`,
un reporte de evidencia y una propuesta finita de `WAVE-01` que quede `DRAFT`
hasta autorización del owner.
