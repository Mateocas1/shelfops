import type { AuthorizedPrincipal } from "../authorization/authorized-principal.js";
import type { ConfigurationRepository } from "./configuration-repository.js";
import type { IdempotencyStore } from "./idempotency-store.js";
export type ConfigurationInput = Readonly<{ storeId: string; locationId: string; expectedVersion: number; effectiveAt: string; effectiveUntil?: string; active: boolean; label?: string; idempotencyKey: string; correlationId: string }>;
export type ConfigurationOutcome = Readonly<{ status: 200; eventId: string; version: number; before: Record<string, unknown>; after: Record<string, unknown>; effectiveAt: string; correlationId: string }>;
export interface ConfigurationExecutor { execute(principal: AuthorizedPrincipal, input: ConfigurationInput): Promise<ConfigurationOutcome>; }
export type ConfigurationExecutionContext = Readonly<{ idempotency: IdempotencyStore; repository: ConfigurationRepository; fingerprint(input: ConfigurationInput): string; expiresAt(): string; newEventId(): string }>;
export class StaleConfigurationError extends Error { constructor() { super("stale-version"); } }
export class IdempotencyConflictError extends Error { constructor() { super("idempotency-conflict"); } }
