import { actionDecision } from "@shelfops/domain/authorization/action-policy";
import type { AuthorizedPrincipal } from "../authorization/authorized-principal.js";

export type CreateIncidentInput = Readonly<{ storeId: string; sectorId: string; locationId: string; productId?: string; category: string; severity: string; title: string; description: string; occurredAt: string; textEvidence: string; idempotencyKey: string; correlationId: string }>;
export type PreparedIncidentCreation = CreateIncidentInput & Readonly<{ reporterId: string; state: "open"; version: 1 }>;
export type IncidentCreated = Readonly<{ status: "created"; incidentId: string; evidenceId: string; eventId: string; reporterId: string; createdAt: string; state: "open"; version: 1 }>;
export type IncidentCreationOutcome = IncidentCreated | Readonly<{ status: "indeterminate"; correlationId: string; retryWithSameKey: true }>;
export class IncidentCreationValidationError extends Error { constructor(message: string) { super(message); } }
export class IncidentCreationForbiddenError extends Error { constructor() { super("incident-creation-forbidden"); } }
export class IncidentReferenceError extends Error { constructor() { super("invalid-incident-reference"); } }
export class IncidentCreationIdempotencyConflictError extends Error { constructor() { super("idempotency-conflict"); } }

export function prepareIncidentCreation(principal: AuthorizedPrincipal, input: CreateIncidentInput, now: Date): PreparedIncidentCreation {
  const required = [input.storeId, input.sectorId, input.locationId, input.category, input.severity, input.title, input.description, input.textEvidence, input.idempotencyKey, input.correlationId];
  if (required.some((value) => typeof value !== "string" || value.trim() === "") || input.productId !== undefined && input.productId.trim() === "") throw new IncidentCreationValidationError("missing-incident-input");
  const textEvidence = input.textEvidence.trim();
  if (Array.from(textEvidence).length > 4_000) throw new IncidentCreationValidationError("text-evidence-too-long");
  const occurred = new Date(input.occurredAt);
  if (!Number.isFinite(occurred.getTime()) || occurred.getTime() > now.getTime() + 300_000) throw new IncidentCreationValidationError("invalid-occurrence-time");
  const normalized: CreateIncidentInput = { storeId: input.storeId.trim(), sectorId: input.sectorId.trim(), locationId: input.locationId.trim(), ...(input.productId === undefined ? {} : { productId: input.productId.trim() }), category: input.category.trim(), severity: input.severity.trim(), title: input.title.trim(), description: input.description.trim(), occurredAt: occurred.toISOString(), textEvidence, idempotencyKey: input.idempotencyKey.trim(), correlationId: input.correlationId.trim() };
  if (actionDecision(principal.id, principal.active, principal.roleScopes, principal.grants, { id: "new", storeId: normalized.storeId, sectorId: normalized.sectorId, category: normalized.category, reporterId: principal.id }, "create").outcome !== "allowed") throw new IncidentCreationForbiddenError();
  return { ...normalized, reporterId: principal.id, state: "open", version: 1 };
}
