# ShelfOps — Project Brief

**Estado:** Draft para planificación  
**Versión:** 0.1  
**Fecha:** 2026-07-17  
**Owner inicial:** Mateo Vázquez  
**Audiencia:** producto, arquitectura, ingeniería, seguridad, SRE y agentes de desarrollo

## 1. Decisión ejecutiva

ShelfOps será un **Retail Operations Control Plane**: una plataforma capaz de recibir hechos desde POS, e-commerce, depósitos, proveedores y conteos físicos; mantener una representación auditable del estado operacional; detectar divergencias; explicar su causa; y recuperar el sistema sin duplicar ni perder efectos.

Conceptualmente evoluciona el conocimiento y las capacidades ya exploradas en `ofertaSUPER` e `InventStock`, pero será un producto independiente y solo utilizará datos sintéticos, públicos o generados. No debe utilizar información interna o confidencial de Carrefour ni de terceros.

No se tratará como un MVP limitado por un calendario. Se diseñará una North Star ambiciosa —multi-tenant, orientada a eventos, escalable por celdas, multi-región y operable— y se alcanzará mediante **estados de madurez con quality gates**, no mediante promesas ni fechas artificiales.

## 2. Aclaración sobre IA y alcance

La premisa de ejecución es:

> Ambición sin techo; incrementos, autoridad y evidencia estrictamente acotados.

La IA y los subagentes pueden comprimir investigación, generación, pruebas y revisión. No eliminan:

- Conflictos de requisitos.
- Semántica de consistencia y concurrencia.
- Failure modes de sistemas distribuidos.
- Riesgos de seguridad y privacidad.
- Costos de infraestructura.
- Validación independiente.
- La necesidad de medir cualquier claim de rendimiento o escalabilidad.

Por eso no habrá un límite arbitrario de tecnologías o escala, pero cada incorporación deberá resolver un problema demostrado, quedar justificada en un ADR y atravesar pruebas reproducibles.

## 3. Tesis de producto

Cuando dos o más sistemas de una operación minorista discrepan, ShelfOps debe permitir responder:

1. ¿Qué ocurrió según cada fuente?
2. ¿Cuál es el estado operacional más confiable y por qué?
3. ¿Qué productos, tiendas, lotes, reservas o pedidos están afectados?
4. ¿Qué acción puede corregir la divergencia?
5. ¿Es seguro simular, ejecutar o repetir esa acción?
6. ¿Cómo comprobamos que la recuperación convergió?

La promesa del producto es:

> De una alerta incomprensible a una explicación verificable y una recuperación segura.

## 4. North Star

Construir un gemelo operacional de una red minorista capaz de:

- Integrar tiendas, depósitos, canales digitales y proveedores.
- Representar inventario, precios, lotes, reservas y transferencias como hechos auditables.
- Tolerar duplicados, eventos atrasados, desorden, desconexiones y fallas parciales.
- Reconstruir proyecciones determinísticamente.
- Detectar inconsistencias y explicar su procedencia.
- Proponer remediaciones mediante políticas versionadas.
- Exigir aprobación humana según riesgo e impacto.
- Simular fallas, políticas y recuperaciones antes de mutar un entorno real.
- Permitir que humanos y agentes operen sobre la misma evidencia, permisos y auditoría.
- Escalar horizontalmente por particiones, consumers y celdas.
- Ejecutar continuidad multi-región sin prometer orden global ni multi-master indiscriminado.

## 5. Escenario insignia

Una tienda pierde conectividad y continúa generando ventas. Mientras está desconectada:

- E-commerce crea reservas.
- Un depósito informa una recepción.
- Un operador realiza un conteo físico.
- Cambian precios de ciertos productos.

Al recuperarse la conexión, llegan eventos duplicados y fuera de orden. Un worker cae después de persistir un cambio pero antes de confirmar el mensaje.

ShelfOps debe:

1. Aceptar y preservar los eventos válidos.
2. Cuarentenar los inválidos sin perder el payload original.
3. Deduplicar mediante identidad e idempotency key.
4. Conservar `occurred_at` y `recorded_at`.
5. Reconstruir las proyecciones según versiones de agregado y reglas.
6. Detectar divergencias, stock imposible o precio incompatible.
7. Correlacionar eventos, logs, métricas y trazas.
8. Identificar el impacto operacional.
9. Proponer recount, transferencia, compensación o replay.
10. Ejecutar un dry-run y solicitar aprobación si corresponde.
11. Aplicar la remediación de manera auditable.
12. Verificar convergencia e invariantes después de la recuperación.
13. Producir un timeline y postmortem basados en evidencia.

Esta será la demostración central para recruiters, desarrolladores senior y potenciales usuarios.

## 6. Principios no negociables

- **Ledger antes que contador mutable.** Las correcciones son movimientos compensatorios.
- **PostgreSQL como autoridad transaccional.** El broker distribuye y permite replay, pero no sustituye el ledger.
- **At-least-once + idempotencia.** No se promete exactly-once end-to-end.
- **Orden por agregado.** No se intenta imponer orden global.
- **Explicabilidad por diseño.** Todo estado relevante expone procedencia y frescura.
- **IA fuera del núcleo determinista.** Puede explicar o recomendar; no define silenciosamente la verdad operacional.
- **Human-in-the-loop según riesgo.** Las mutaciones sensibles requieren aprobación.
- **Observabilidad como capacidad del producto.** Si no puede investigarse, no está terminado.
- **Multi-tenancy defendida en profundidad.** Token, aplicación, datos, colas, cuotas y observabilidad.
- **Evidencia antes que claims.** Escala, resiliencia y seguridad deben ser reproducibles.
- **Complejidad por necesidad.** Un módulo se extrae solo por SLO, escala, seguridad, ownership o aislamiento de fallas.

## 7. Objetivos

### Objetivos de producto

- Detectar y explicar divergencias de inventario y precios.
- Preservar un historial causal y auditable.
- Permitir replay y recuperación seguros.
- Reducir el tiempo de diagnóstico y recuperación en escenarios simulados.
- Exponer una plataforma extensible para integraciones y políticas.

### Objetivos de ingeniería

- Demostrar dominio real de Go, PostgreSQL, concurrencia y event streaming.
- Construir contratos HTTP y de eventos versionados.
- Probar idempotencia, backpressure, replay, aislamiento y recuperación.
- Operar mediante SLOs, dashboards, alertas, runbooks y game days.
- Publicar benchmarks con entorno, dataset, configuración y resultados.
- Mantener trazabilidad entre requisito, spec, código, prueba y evidencia.

### Objetivos profesionales

- Servir como proyecto central de portfolio backend.
- Evidenciar ownership de punta a punta: producto, diseño, implementación, despliegue y operación.
- Permitir una conversación técnica defendible sobre trade-offs y failure modes.
- Mostrar capacidad de trabajar con procesos compatibles con startups y organizaciones grandes.

## 8. Decisiones iniciales adoptadas

- **Objetivo:** portfolio técnico de nivel alto con potencial de producto/open source.
- **Wedge inicial:** verdad y recuperación operacional de inventario; precios como segundo dominio integrado.
- **Lenguaje principal:** Go.
- **Tecnología en bordes:** TypeScript para adaptadores existentes y cockpit web cuando sea conveniente.
- **Persistencia:** PostgreSQL con SQL explícito.
- **Entrega de eventos:** at-least-once con outbox/inbox y consumers idempotentes.
- **Multi-tenancy:** presente desde el modelo; aislamiento por celdas al evolucionar.
- **IA operacional:** read-only y basada en evidencia inicialmente; mutaciones siempre gobernadas por herramientas tipadas y políticas.
- **Datos:** exclusivamente sintéticos, públicos o generados.
- **Modo de ejecución:** SDD, contratos primero, subagentes con scopes exclusivos y verificación independiente.

## 9. No-objetivos lógicos

Estos límites preservan la tesis; no son recortes por falta de tiempo:

- Reemplazar por completo ERP, contabilidad, nómina o CRM.
- Procesar pagos reales o custodiar dinero.
- Controlar equipamiento físico real.
- Implementar conectores propietarios sin acceso legítimo a sus contratos.
- Afirmar certificaciones o cumplimiento regulatorio no auditado.
- Usar cantidad de microservicios o logos tecnológicos como métrica de calidad.
- Permitir que un LLM modifique inventario, precios o políticas críticas sin autorización externa al modelo.
- Presentar forecasting probabilístico como fuente de verdad.

## 10. Condición para pasar a planificación

Antes de implementar código de aplicación, Codex debe producir y someter a revisión:

- Glosario y modelo de dominio.
- Invariantes fundacionales.
- Capability spec del escenario insignia.
- OpenAPI y AsyncAPI mínimos.
- C4 Context y Container.
- ADRs fundacionales.
- Threat model inicial.
- NFRs y perfiles de carga parametrizables.
- DAG de trabajo con write scopes, orden de integración y comandos de aceptación.

El archivo `CODEX_HANDOFF.md` contiene el contrato exacto para esa siguiente fase.
