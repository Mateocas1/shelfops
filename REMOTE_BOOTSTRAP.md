# ShelfOps — Bootstrap desde Codex Remote

Este runbook permite iniciar el proyecto desde la app móvil usando como host la
computadora donde corre ChatGPT Desktop/Codex.

## 1. Precondiciones del host

- ChatGPT Desktop abierto y sesión iniciada.
- Remote ya emparejado con el mismo usuario/workspace.
- Equipo conectado a energía, red estable y opción de mantenerlo despierto.
- Git y Codex disponibles en el host.
- Credenciales GitHub configuradas si se clonará un repositorio privado.
- Permiso `workspace-write`; no usar acceso completo.

## 2. Puente recomendado: repositorio privado independiente

Crear `Mateocas1/shelfops` como repositorio **privado**. No reutilizar
`invent-stock` ni `ofertaSUPER`: ShelfOps es un producto independiente y su
historial debe empezar limpio.

Después, desde **Remote** en el móvil:

1. Elegir el host conectado.
2. Crear un chat nuevo y seleccionar la carpeta padre donde vivirá el proyecto.
3. Pedir a Codex clonar el repositorio privado.
4. Abrir un nuevo chat apuntando a la raíz clonada.
5. Confirmar que `AGENTS.md`, `PROJECT_BRIEF.md`, `PRD.md`,
   `CODEX_HANDOFF.md`, `ORCHESTRATION.md` y `tasks/manifest.yaml` existen.

Si el repositorio todavía no existe, este paquete ZIP puede copiarse o adjuntarse
al host y extraerse en una carpeta nueva. GitHub sigue siendo el puente durable
recomendado antes de iniciar implementación.

## 3. Primera ejecución remota: planificación

Seleccionar `gpt-5.6-sol` con effort `high` y enviar el contenido de
`prompts/PLANNING_BOOTSTRAP.md`. Esta ejecución puede crear archivos de
planificación, subagentes y commits locales, pero no código de aplicación.

Al terminar, revisar desde el móvil:

- resumen de gates;
- lista de `OPEN-*`;
- diff y estructura creada;
- tareas propuestas para `WAVE-01`;
- tests/validadores ejecutados.

La ejecución puede continuar si no hay preguntas materiales. Cuando una
decisión sea necesaria, Codex debe pausar la rama y dejar el `OPEN-*` listo para
que la respuesta desde el móvil sea corta y precisa.

## 4. Segunda ejecución: Goal de implementación

Solo después de aceptar el Planning Baseline:

1. Registrar la autorización en `tasks/manifest.yaml`.
2. Crear la ola finita `WAVE-01` con tareas `READY`.
3. Abrir un chat/worktree limpio.
4. Seleccionar el modelo padre/reviewer en effort alto.
5. Ejecutar `/goal` con `prompts/GOAL_IMPLEMENTATION_TEMPLATE.md` adaptado al ID.

Los implementers pueden usar `gpt-5.6-sol` low mediante el agente de proyecto;
el orquestador y reviewer permanecen en high.

## 5. Gestión desde el móvil

Remote permite continuar chats, enviar instrucciones, aprobar acciones y revisar
diffs, tests, terminal y resultados. Si el host duerme, pierde red o cierra la
app, la ejecución remota se detiene hasta que vuelva a estar disponible.

No confiar en una cadena abierta de Goals. Cada Goal consume una ola finita. Una
tarea programada puede reactivar el mismo chat y procesar la próxima tanda, pero
solo dentro de la ola ya autorizada.

## 6. Comandos que el agente puede proponer

Estos comandos son orientativos; el agente debe verificar el estado antes:

```bash
git clone git@github.com:Mateocas1/shelfops.git
cd shelfops
git switch -c planning/baseline
```

No ejecutar `git push`, crear PR ni fusionar hasta que el owner lo autorice en
el chat remoto o en un work order.
