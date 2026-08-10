import type { AuthorizedPrincipal } from "../authorization/authorized-principal.js";
import { IdempotencyConflictError, StaleConfigurationError } from "../ports/configuration-executor.js";
import type { ConfigurationExecutionContext, ConfigurationExecutor, ConfigurationInput, ConfigurationOutcome } from "../ports/configuration-executor.js";
import { configureReferenceData } from "./configure-reference-data.js";
export class ReferenceDataConfigurationExecutor implements ConfigurationExecutor {
  constructor(private readonly context: ConfigurationExecutionContext) {}
  execute(principal: AuthorizedPrincipal, input: ConfigurationInput): Promise<ConfigurationOutcome> { return executeConfiguration(this.context, principal, input); }
}
async function executeConfiguration(context: ConfigurationExecutionContext, principal: AuthorizedPrincipal, input: ConfigurationInput): Promise<ConfigurationOutcome> {
  const scope = { principalId: principal.id, apiMajor: "v1" as const, operation: "configure-location" as const, targetKey: `${input.storeId}/${input.locationId}`, key: input.idempotencyKey }; const hash = context.fingerprint(input); const previous = await context.idempotency.find(scope);
  if (previous?.state === "completed") { if (previous.requestHash !== hash) throw new IdempotencyConflictError(); if (previous.outcome) return previous.outcome; }
  if (previous) throw new Error("idempotency-pending");
  const eventId = context.newEventId(); await context.idempotency.insertPending(scope, hash, context.expiresAt());
  try { const result = await configureReferenceData(principal, { eventId, target: "store-reference", referenceId: input.locationId, storeId: input.storeId, expectedVersion: input.expectedVersion, effectiveAt: input.effectiveAt, effectiveUntil: input.effectiveUntil, active: input.active, label: input.label }, context.repository); const outcome = { status: 200 as const, eventId, ...result, effectiveAt: input.effectiveAt, correlationId: input.correlationId }; await context.idempotency.complete(scope, outcome); return outcome; } catch (error) { if (error instanceof Error && error.message === "stale-version") throw new StaleConfigurationError(); throw error; }
}
