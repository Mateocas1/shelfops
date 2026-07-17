# ShelfOps — Product Requirements Document

**Estado:** Draft pre-planificación  
**Versión:** 0.1  
**Fecha:** 2026-07-17  
**Documento rector:** `PROJECT_BRIEF.md`

## 1. Resumen

ShelfOps es un Retail Operations Control Plane multi-tenant, orientado a eventos y diseñado para mantener una verdad operacional auditable frente a fuentes parciales o contradictorias. Ingiere hechos desde sistemas como POS, e-commerce, depósitos, proveedores y conteos físicos; mantiene ledgers y proyecciones; detecta divergencias; correlaciona evidencia; y permite simular, aprobar y ejecutar recuperaciones seguras.

El núcleo no depende de IA. Los agentes y modelos pueden asistir en diagnóstico, explicación, búsqueda y planificación, pero las invariantes, autorizaciones y mutaciones se resuelven mediante código determinista, herramientas tipadas y políticas externas al modelo.

## 2. Problema

Una operación minorista distribuye su estado entre POS, ERP, WMS, e-commerce, integraciones, archivos y procesos manuales. Esos sistemas pueden:

- Usar identidades, unidades o relojes diferentes.
- Quedar temporalmente desconectados.
- Producir eventos duplicados, atrasados o fuera de orden.
- Aplicar parcialmente una operación.
- Mostrar precios, reservas o existencias incompatibles.
- Alertar sin explicar causa, impacto ni recuperación.
- Hacer riesgoso el replay por posibles efectos secundarios duplicados.

El sistema debe convertir hechos heterogéneos en estado explicable, detectar cuándo ese estado deja de ser confiable y ofrecer una recuperación verificable.

## 3. Actores

| Actor | Necesidad principal |
|---|---|
| Operador de tienda | Registrar, consultar y corregir movimientos sin perder trazabilidad |
| Responsable de sucursal | Comprender anomalías, faltantes, mermas y acciones pendientes |
| Analista de inventario | Reconciliar fuentes y rastrear divergencias |
| Analista de precios | Detectar diferencias entre precio esperado, publicado y cobrado |
| Planificador de reposición | Anticipar faltantes y proponer transferencias u órdenes |
| Operador de depósito | Gestionar recepciones, lotes, transferencias y despachos |
| Auditor | Reconstruir quién hizo qué, cuándo, por qué y con qué autorización |
| Incident responder/SRE | Diagnosticar fallas, inspeccionar señales y recuperar procesamiento |
| Ingeniero de integración | Incorporar fuentes mediante APIs, eventos, webhooks o archivos |
| Administrador | Gestionar tenants, usuarios, roles, políticas, cuotas y credenciales |
| Agente de IA | Analizar evidencia y proponer acciones dentro de permisos explícitos |
| Desarrollador de plataforma | Extender contratos, reglas, conectores y capacidades sin romper compatibilidad |

## 4. Dominios

### 4.1 Organización y topología

Organizaciones, regiones, tiendas, depósitos, zonas, canales, usuarios, equipos, service classes y asignación de tenant a cell.

### 4.2 Catálogo e identidad

Productos canónicos, SKU, variantes, códigos externos, unidades, conversiones, categorías y resolución de identidades ambiguas.

### 4.3 Ledger de inventario

Recepciones, ventas, ajustes, devoluciones, reservas, liberaciones, transferencias, mermas, daños, vencimientos y conteos.

### 4.4 Lotes y vencimientos

Lotes, fechas, trazabilidad, FIFO/FEFO, bloqueo, rotación y riesgo de vencimiento.

### 4.5 Precios y promociones

Precio base, precio efectivo, vigencia, promociones, canal y diferencias entre precio esperado, publicado y cobrado.

### 4.6 Pedidos, reservas y disponibilidad

Reservas, asignación, cancelación, expiración, fulfillment y relación causal entre demanda y disponibilidad.

### 4.7 Reposición y transferencias

Sugerencias, aprobaciones, órdenes, despacho, recepción, compensaciones y excepciones.

### 4.8 Integración y eventos

Contratos, schemas, adaptadores, webhooks, batch, colas, retries, cuarentena, replay y evolución compatible.

### 4.9 Reconciliación e incidentes

Políticas de autoridad, comparación entre fuentes, clasificación de divergencias, impacto, investigación, remediación y postmortem.

### 4.10 Simulación e inteligencia operacional

Tráfico sintético, fallas controladas, digital twin, evaluación de políticas, búsqueda sobre runbooks y asistencia basada en evidencia.

## 5. Requisitos funcionales

### FR-ORG-001 — Organización y aislamiento

- Modelar tenants, regiones, tiendas, depósitos y canales.
- Mantener moneda, unidad y zona horaria explícitas.
- Soportar configuración y cuotas por organización, región y ubicación.
- Aislar datos y operaciones entre tenants.
- Permitir que un tenant se asigne o migre entre cells sin cambiar contratos del producto.

### FR-CAT-001 — Catálogo canónico

- Registrar productos y variantes canónicas.
- Mapear identificadores externos a identidades internas.
- Detectar mappings ambiguos y enviarlos a revisión.
- Versionar atributos y conversiones de unidades.
- Exponer procedencia y vigencia de cada mapping.

### FR-ING-001 — Ingesta multicanal

- Aceptar eventos por API, broker, webhook y archivos batch.
- Exigir tenant, fuente, esquema, versión, identidad, timestamps, correlation ID e idempotency key.
- Validar contrato y autorización antes del procesamiento.
- Conservar el payload original y cuarentenar entradas inválidas.
- Aplicar rate limiting, cuotas, límites de payload y backpressure.
- No confirmar como aceptado un comando que no haya alcanzado la garantía de durabilidad declarada.

### FR-LED-001 — Ledger inmutable

- Registrar mutaciones de inventario como transacciones append-only.
- Representar correcciones mediante transacciones compensatorias.
- Preservar actor, motivo, tenant, causalidad, correlación y timestamps.
- Impedir que un duplicado modifique el ledger dos veces.
- Permitir reconstruir balances desde el ledger y una versión de reglas.
- Exponer desde cada proyección la evidencia que la originó.

### FR-LED-002 — Proyecciones de inventario

- Calcular stock físico, reservado, disponible, en tránsito, dañado, vencido y bloqueado.
- Exponer `as_of_event`, `calculated_at` y `staleness_ms`.
- Detectar gaps de versión y evitar sobrescrituras silenciosas.
- Permitir borrar y reconstruir una proyección sin modificar el ledger.
- Verificar checksum o invariantes después de una reconstrucción.

### FR-REC-001 — Reconciliación

- Comparar estado observado, calculado y declarado por distintas fuentes.
- Configurar autoridad y precedencia por entidad, fuente y situación.
- Clasificar divergencias por severidad, antigüedad, impacto y confianza.
- Explicar qué reglas y evidencias produjeron el estado elegido.
- Mantener un workflow auditable de investigación y resolución.

### FR-PRC-001 — Precios y promociones

- Versionar precios por canal, tienda y vigencia.
- Impedir o señalar superposiciones incompatibles.
- Relacionar un precio cobrado con la política vigente al ocurrir el hecho.
- Detectar diferencias entre fuente, publicación y cobro.
- Conservar el historial y la procedencia de cada cambio.

### FR-LOT-001 — Lotes y vencimientos

- Rastrear lote, cantidad, vencimiento, ubicación y estado.
- Aplicar FIFO/FEFO mediante políticas versionadas.
- Detectar stock bloqueado, inconsistente o próximo a vencer.
- Proponer rotación, transferencia, revisión o compensación.

### FR-RSV-001 — Reservas y disponibilidad

- Crear, liberar y expirar reservas idempotentemente.
- Prevenir sobreasignación según la consistencia configurada.
- Mostrar la relación causal entre pedido, reserva y movimiento.
- Modelar fallas parciales mediante compensaciones explícitas.

### FR-TRF-001 — Transferencias y reposición

- Generar sugerencias según umbrales, demanda o políticas.
- Modelar transferencias como workflows durables y auditables.
- Permitir aprobación, rechazo, expiración y compensación.
- Integrar acciones con conectores simulados o sandbox.
- Detectar workflows detenidos o estados imposibles.

### FR-ANO-001 — Detección de anomalías

- Detectar stock negativo no autorizado, saltos improbables, gaps, lag, divergencias persistentes y fallas de integración.
- Combinar reglas deterministas con detectores estadísticos opcionales.
- Correlacionar alertas relacionadas dentro de un incidente.
- Priorizar por impacto operacional y no solo por error técnico.
- Exponer la regla o modelo que produjo la alerta.

### FR-INC-001 — Gestión de incidentes

- Crear incidentes manual o automáticamente.
- Reunir eventos, proyecciones, logs, métricas, trazas, entidades afectadas y cambios.
- Mantener timeline, severidad, owner, hipótesis, acciones y estado.
- Asociar runbooks, aprobaciones y evidencia.
- Generar borradores de postmortem sujetos a revisión humana.

### FR-RPL-001 — Replay y recuperación

- Reprocesar eventos, rangos, agregados, particiones o incidentes.
- Ejecutar dry-run y mostrar el diff esperado.
- Distinguir procesamiento original de replay.
- Evitar efectos secundarios duplicados.
- Exigir step-up y aprobación para acciones riesgosas.
- Verificar automáticamente convergencia e invariantes posteriores.
- Mantener un registro auditable de intento, resultado y rollback/forward fix.

### FR-POL-001 — Políticas y aprobaciones

- Expresar políticas según tenant, rol, ubicación, cantidad, impacto, severidad y tipo de acción.
- Versionar políticas y registrar cuál se aplicó.
- Soportar segregación de funciones.
- Permitir aprobación automática solo para acciones explícitamente clasificadas como de bajo riesgo.

### FR-AUD-001 — Auditoría y procedencia

- Registrar usuario o agente, acción, motivo, evidencia, autorización, política y resultado.
- Navegar desde una proyección hasta sus hechos y viceversa.
- Evitar modificaciones silenciosas del historial.
- Exportar evidencia por incidente, entidad o período.
- Soportar archivo inmutable según política de retención.

### FR-SIM-001 — Simulación y digital twin

- Generar tráfico sintético con seed reproducible.
- Simular desconexión, latencia, duplicados, desorden, particiones y fallas parciales.
- Evaluar cambios de políticas sin modificar el estado autoritativo.
- Comparar escenarios mediante resultados e invariantes.
- Guardar escenarios de demo, benchmark y game day.

### FR-AI-001 — Copiloto operacional

- Responder usando únicamente datos, telemetría y documentación autorizados.
- Citar evidencia concreta y separar hecho, inferencia e incertidumbre.
- Respetar permisos del usuario invocante.
- Proponer acciones mediante herramientas tipadas y allowlisted.
- Requerir aprobación externa al modelo antes de mutaciones de alto impacto.
- Registrar prompts, tool calls, decisiones y resultados según políticas de privacidad.
- Ser completamente prescindible para el funcionamiento del núcleo.
- Incluir evaluaciones de groundedness, autorización, tool selection y resistencia a prompt injection.

### FR-DEV-001 — Plataforma para integradores

- Publicar OpenAPI, AsyncAPI y schemas versionados.
- Ofrecer ejemplos o SDKs, webhooks firmados y credenciales rotables.
- Proporcionar sandbox con datos sintéticos.
- Documentar compatibilidad, deprecación y límites de cuota.

### FR-UI-001 — Cockpit operacional

- Mostrar salud, lag, frescura, incidentes, divergencias y acciones pendientes.
- Buscar por SKU, sitio, pedido, evento, agregado o correlation ID.
- Permitir drill-down desde un indicador hasta su evidencia.
- Adaptar vistas y acciones a permisos.
- Mantener accesibilidad por teclado y no depender solo del color.

### FR-SEC-001 — Seguridad y administración

- Usar OIDC/OAuth2 y credenciales de servicio rotables.
- Aplicar RBAC y atributos de tenant, site y operación.
- Gestionar secretos fuera del repositorio.
- Cifrar datos en tránsito y reposo.
- Auditar accesos y acciones administrativas.
- Aplicar retención, minimización y eliminación según clasificación de datos.

### FR-EDGE-001 — Operación desconectada

- Permitir que un componente edge simulado almacene eventos durante una interrupción.
- Sincronizar al recuperar conexión sin duplicar efectos.
- Exponer conflictos, lag y estado de sincronización.
- No asumir relojes perfectamente sincronizados.
- Aplicar límites de almacenamiento, reintentos y cuarentena.

## 6. Invariantes fundacionales

- `INV-LED-001`: el ledger es append-only; una corrección crea otra transacción.
- `INV-LED-002`: toda transacción de inventario balancea según las cuentas definidas.
- `INV-IDM-001`: `tenant + source + idempotency_key` modifica el ledger como máximo una vez.
- `INV-DUR-001`: un comando confirmado no se pierde dentro de la garantía declarada.
- `INV-PRJ-001`: el mismo stream y versión de reglas producen el mismo checksum de proyección.
- `INV-ORD-001`: una versión de agregado anterior nunca sobrescribe silenciosamente una posterior.
- `INV-AUD-001`: toda mutación registra actor, tenant, motivo, correlación y timestamps.
- `INV-TEN-001`: ninguna operación autorizada para un tenant puede leer o mutar otro tenant.
- `INV-RPL-001`: un replay no duplica efectos secundarios ya confirmados.
- `INV-PRC-001`: períodos de precio incompatibles no se superponen silenciosamente.
- `INV-MON-001`: dinero y cantidades no usan `float`; se emplean minor units o decimal fijo.
- `INV-AI-001`: un modelo no puede eludir autorización, policy engine ni audit trail.

## 7. Requisitos no funcionales

### NFR-COR-001 — Correctitud

- Cada invariante crítica debe tener un oráculo y una prueba ejecutable.
- Coverage porcentual es una señal, no el gate.
- Las proyecciones deben declarar frescura y procedencia.

### NFR-SCL-001 — Escalabilidad

- APIs stateless y consumers deben escalar horizontalmente.
- El orden se garantiza por agregado/partition key, no globalmente.
- La concurrencia debe ser acotada y aplicar backpressure.
- Cada benchmark debe declarar commit, hardware, dataset, seed, configuración, duración, throughput, percentiles y errores.
- La plataforma debe publicar su curva hasta saturación y sus límites conocidos.
- La capacidad global crece agregando celdas, no introduciendo transacciones globales distribuidas.

### NFR-REL-001 — Disponibilidad y degradación

- Los servicios no esenciales deben degradarse sin detener el ledger.
- La caída del broker no debe perder comandos ya confirmados; el outbox acumula hasta un umbral seguro.
- La caída de un consumer debe producir redelivery idempotente.
- Los SLOs deben vivir en configuración versionada y alimentar tests, dashboards y alertas.

### NFR-REC-001 — Recuperación

- Backups, restore, rebuild de proyecciones, replay y failover deben ensayarse.
- RPO/RTO deben definirse por service class.
- Un backup no se considera válido hasta completar una restauración y checksum.

### NFR-SEC-001 — Seguridad

- Tenant isolation, mínimo privilegio, step-up para acciones sensibles y threat model versionado.
- SAST, SCA, secret scanning, IaC scanning, SBOM, firma y provenance para artefactos desplegables.
- Producción debe ser read-only para agentes de diagnóstico; una mutación tiene un único actor autorizado.

### NFR-OBS-001 — Observabilidad

- Logs estructurados, métricas, trazas y W3C Trace Context en rutas críticas.
- Señales técnicas: request rate/error/duration, saturation, consumer lag, outbox age, quarantine age, lock waits y replica lag.
- Señales de corrección: ledger/projection drift, gaps, reservas vencidas, transferencias detenidas, precios superpuestos y eventos sin causalidad.
- Alertas basadas en síntomas, SLOs y error budgets.

### NFR-MNT-001 — Mantenibilidad y evolución

- Límites de dominio, ownership de datos, contratos versionados y ADRs.
- Cambios de DB mediante expand/contract o forward fix seguro.
- Compatibilidad de API, eventos y schemas verificada en CI.
- Un agente clean-room debe poder incorporarse usando solamente el repositorio.

### NFR-CST-001 — Eficiencia de costo

- Cada service class debe declarar un budget de costo.
- Debe medirse costo por millón de eventos y por tenant/cell cuando exista infraestructura real.
- No se adopta una tecnología cuya operación no tenga owner, métrica y estrategia de salida.

## 8. Arquitectura objetivo

### 8.1 Principios

- PostgreSQL es la fuente de verdad transaccional.
- Kafka/Redpanda distribuye y permite replay.
- Transactional outbox evita dual writes entre DB y broker.
- Inbox/idempotency table protege a los consumers.
- Saga/compensación resuelve procesos entre agregados; no se usan transacciones distribuidas.
- Cada tenant tiene una home cell; cada cell contiene el data plane completo para un conjunto de tenants.
- El control plane global no se encuentra en el hot path de cada mutación.

### 8.2 Límites lógicos

- Command & Ingestion.
- Inventory Ledger.
- Catalog & Pricing.
- Durable Workflows.
- Projection & Query.
- Reconciliation & Replay.
- Integration Adapters.
- Tenant Registry y Cell Routing.
- Policy, Identity y Audit.
- Observability y Platform Operations.

Estos límites comienzan como módulos o procesos mínimos. Un módulo solo se extrae si obtiene SLO propio, perfil de escalado diferente, aislamiento de falla, ownership de datos, requisito de seguridad o ciclo de despliegue separado.

### 8.3 Selección tecnológica objetivo

| Capacidad | Decisión inicial/objetivo | Condición |
|---|---|---|
| Backend | Go | Principal para APIs, consumers y herramientas operativas |
| OLTP | PostgreSQL + `pgx` + `sqlc` | SQL e invariantes visibles |
| Streaming | Kafka; Redpanda en local | Se incorpora al superar el gate del Estado 0 |
| API HTTP | OpenAPI + JSON | Contrato externo interoperable |
| Eventos | AsyncAPI + Protobuf/Schema Registry | Al estabilizar envelope y compatibilidad |
| Telemetría | OpenTelemetry | Vendor-neutral desde el inicio |
| Observabilidad | Prometheus, Grafana, Tempo y Loki | Local reproducible y proveedor intercambiable |
| Identidad | OIDC/OAuth2; Keycloak local | No construir auth propia |
| Infraestructura | Terraform | Toda infraestructura real debe ser reproducible |
| Orquestación | Kubernetes | Solo al necesitar operación multi-workload/HA |
| Autoscaling | HPA/KEDA | CPU para API; lag/edad para consumers |
| Workflows | Temporal | Solo si timers/compensaciones durables justifican su operación |
| Analítica | ClickHouse | Solo si analítica histórica degrada PostgreSQL |
| Cache | Redis excluido por defecto | Solo después de medición y ADR |

## 9. Estados de madurez

No son etapas con fechas. Cada estado exige evidencia antes de habilitar el siguiente.

### M0 — Arquitectura ejecutable

- Aplicación Go modular, worker, PostgreSQL, ledger, outbox/inbox, REST/OpenAPI, OpenTelemetry, Docker Compose y CI.
- Gate: invariantes probadas, reinicio seguro, deduplicación, arranque con un comando y benchmark base reproducible.

### M1 — Cell event-driven

- Kafka/Redpanda, Schema Registry, proyecciones reconstruibles, retries, cuarentena, replay, lag/freshness metrics y pruebas spike/soak.
- Gate: caída de broker/consumer sin pérdida o doble efecto; eventos desordenados definidos; rebuild determinista; curva throughput/latencia publicada.

### M2 — Multi-tenant operable

- Kubernetes, PostgreSQL HA/PITR, RLS/composite keys, OIDC, políticas de red, GitOps, canary, SBOM, SLOs, runbooks y restore drills.
- Gate: aislamiento probado, noisy-neighbor acotado, restore/rollback dentro del RTO, canary defectuoso detenido y game day completo.

### M3 — Escala por celdas

- Tenant registry/routing, varias cells, sharding por tenant, cuotas, dedicated cells y migración entre cells.
- Gate: migración con fencing sin pérdida/doble escritura; caída aislada; control plane fuera del hot path; capacidad por cell publicada.

### M4 — Continuidad multi-región

- Región escritora por tenant, fencing epoch, réplica, storage replicado, failover/failback, archive/replay regional y analítica separada si corresponde.
- Gate: region-failure game day, RPO/RTO medidos, single-writer garantizado y reconciliación post-failback.

### M5 — Inteligencia operacional gobernada

- Copiloto sobre eventos, telemetría y runbooks; RAG/evals; herramientas tipadas; approval engine; model/provider routing y observabilidad de costo/calidad.
- Gate: evaluación reproducible, cero bypass de autorización, resistencia adversarial y funcionamiento completo del núcleo sin LLM.

## 10. Modelo de eventos mínimo

```json
{
  "event_id": "uuid-v7",
  "event_type": "inventory.stock_adjusted.v1",
  "schema_version": 1,
  "tenant_id": "tenant-id",
  "aggregate_type": "inventory_account",
  "aggregate_id": "site:sku:lot",
  "aggregate_version": 42,
  "partition_key": "tenant:site:sku",
  "occurred_at": "timestamp",
  "recorded_at": "timestamp",
  "correlation_id": "uuid",
  "causation_id": "uuid",
  "traceparent": "w3c-trace-context",
  "producer": "inventory-ledger",
  "data": {}
}
```

Eventos iniciales:

- `inventory.receipt_recorded`
- `inventory.stock_adjusted`
- `inventory.reservation_created`
- `inventory.reservation_released`
- `inventory.reservation_expired`
- `inventory.transfer_requested`
- `inventory.transfer_dispatched`
- `inventory.transfer_received`
- `sale.completed`
- `sale.voided`
- `price.changed`
- `reconciliation.variance_detected`
- `reconciliation.variance_resolved`
- `lot.expiry_risk_detected`

## 11. Failure modes obligatorios

| Falla | Comportamiento esperado | Evidencia requerida |
|---|---|---|
| PostgreSQL indisponible | No confirmar comandos | Test, retry semantics y alerta SLO |
| Broker indisponible | Commit + outbox; publicación pendiente | Outbox age, backpressure y recovery drill |
| Consumer cae después del commit | Redelivery sin doble efecto | Kill-after-commit test |
| Duplicado | Mismo resultado observable | Unique constraint + invariant test |
| Fuera de orden | No pisa estado posterior | Aggregate version + parking/rebuild |
| Poison event | No bloquea otros agregados | Cuarentena y replay auditado |
| Hot partition | Degradación acotada | Skew metrics y mitigación documentada |
| Tenant ruidoso | Cuotas y fair scheduling | Noisy-neighbor benchmark |
| Schema incompatible | Bloqueado antes de release | Compatibility check en CI |
| Projection drift | Lectura declara inconsistencia | Reconciliation + checksum/rebuild |
| Clock skew | No define orden por sí solo | Aggregate version test |
| Migración defectuosa | Coexistencia y forward fix | Expand/contract rehearsal |
| Deploy defectuoso | Canary detenido | Rollout evidence |
| Región perdida | Single writer con fencing | Region game day |
| Backup inválido | Backup marcado fallido | Restore + checksum |
| Integración lenta | No bloquea core | Timeout, circuit breaker y buffer persistente |

## 12. Estrategia de pruebas

- Unitarias para reglas y state machines.
- Property-based para balance del ledger, idempotencia y propiedades algebraicas válidas.
- Fuzzing de parsers, endpoints y eventos.
- Integración con PostgreSQL y broker reales mediante Testcontainers.
- Contract tests para OpenAPI, AsyncAPI y schema compatibility.
- Component tests con externos simulados.
- E2E desde comando hasta proyección, alerta y auditoría.
- Replay determinista con checksum.
- Migraciones desde versiones soportadas.
- Matriz de autorización y aislamiento entre tenants.
- Performance: smoke, load, stress, spike y soak.
- Chaos: kill, red, broker, lag, disco y dependencia externa.
- Recovery: restore, rebuild, failover y failback.
- AI evals: grounding, autorización, tool use, prompt injection y abstención.

## 13. Métricas y criterios de éxito

### Correctitud

- Cero duplicación de efecto en casos idempotentes cubiertos.
- Cero drift inexplicado entre ledger y proyección.
- Cero exposición cruzada de tenants.
- 100% de mutaciones del ledger con auditoría y causalidad requeridas.

### Operabilidad

- Un incidente puede recorrerse desde alerta hasta evento causal.
- Cada alerta accionable enlaza a un runbook.
- Restore, replay y rollback/forward fix se ejecutan, no solo se documentan.
- Un game day produce timeline, postmortem y acciones verificables.

### Escalabilidad

- Generador de carga reproducible y versionado.
- Curvas throughput/latencia y punto de saturación publicados.
- Al menos una optimización demostrada mediante before/after.
- Capacidad y límites conocidos por cell.
- Costo por workload publicado cuando exista infraestructura real.

### Producto

- Tiempo de detección de divergencia.
- Tiempo de diagnóstico y recuperación.
- Porcentaje de reconciliaciones automáticas.
- Alertas duplicadas por incidente.
- Precisión/frescura de disponibilidad proyectada.
- Recomendaciones aceptadas, modificadas o rechazadas.
- Incidentes recuperados sin intervención directa sobre DB.

### Calidad de entrega

- Un tercero ejecuta el escenario insignia desde checkout limpio.
- Requisito, spec, código, prueba, telemetría y evidencia mantienen trazabilidad.
- El demo muestra falla, diagnóstico y recuperación, no solo happy path.

## 14. Riesgos principales

| Riesgo | Mitigación |
|---|---|
| Scope sin identidad | Toda capability debe fortalecer verdad, trazabilidad o recuperación operacional |
| Arquitectura teatral | Extracción solo con criterio y evidencia |
| Agentes inconsistentes | Specs, scopes exclusivos, gates y verificación independiente |
| Replay destructivo | Dry-run, fencing, idempotencia, aprobación y verificación |
| Fuga multi-tenant | Defensa en profundidad y pruebas negativas sistemáticas |
| IA alucinando | Evidencia citada, output estructurado, evals y human-in-the-loop |
| Benchmarks engañosos | Entorno, dataset, seed y raw results versionados |
| Infraestructura costosa | Service classes, budgets y estados de madurez |
| Conocimiento de dominio supuesto | Datos sintéticos y supuestos explícitos; no presentar hipótesis como hechos reales |
| Dependencia tecnológica accidental | ADR, owner, métrica y estrategia de salida |

## 15. Acceptance del PRD para pasar a planning

Este PRD está listo para convertirse en specs cuando:

- El glosario defina términos y unidades ambiguas.
- El modelo de ledger y cuentas tenga ejemplos balanceados.
- El escenario insignia tenga Given/When/Then nominales y de falla.
- Los invariantes tengan oráculos propuestos.
- Se haya resuelto el envelope inicial de eventos.
- Se documenten SLOs iniciales como valores configurables, no claims.
- El threat model inicial clasifique datos, trust boundaries y abuso.
- Los ADRs fundacionales registren alternativas descartadas.
- La primera capability vertical tenga límites y no-objetivos explícitos.

La cadena de trazabilidad esperada es:

```text
Necesidad de producto
→ FR/NFR/INV
→ capability spec
→ contrato HTTP/evento
→ escenarios y oracle
→ ADR y plan DAG
→ implementación
→ tests y telemetría
→ evidencia de aceptación
```
