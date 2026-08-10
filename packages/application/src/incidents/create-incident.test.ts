import { describe, expect, it } from "vitest";
import type { AuthorizedPrincipal } from "../authorization/authorized-principal.js";
import { IncidentCreationForbiddenError, IncidentCreationValidationError, prepareIncidentCreation, type CreateIncidentInput } from "./create-incident.js";

const now = new Date("2026-08-08T10:00:00.000Z");
const principal = (overrides: Partial<AuthorizedPrincipal> = {}): AuthorizedPrincipal => ({ id: "reporter", active: true, roleScopes: [{ role: "collaborator", storeIds: ["store-a"], sectorIds: ["sector-a"], categoryResponsibilities: [], teamIds: [] }], grants: [], ...overrides });
const input = (overrides: Partial<CreateIncidentInput> = {}): CreateIncidentInput => ({ storeId: "store-a", sectorId: "sector-a", locationId: "location-a", productId: "product-a", category: "out-of-stock", severity: "high", title: " Empty shelf ", description: " No units remain ", occurredAt: "2026-08-08T09:55:00.000Z", textEvidence: " Shelf checked ", idempotencyKey: "key-a", correlationId: "correlation-a", ...overrides });

describe("incident creation command", () => {
  it("normalizes required evidence and owns attribution and initial fields", () => {
    const prepared = prepareIncidentCreation(principal(), { ...input(), reporterId: "attacker", state: "resolved", version: 99, createdAt: "2000-01-01" } as CreateIncidentInput, now);
    expect(prepared).toMatchObject({ reporterId: "reporter", title: "Empty shelf", description: "No units remain", textEvidence: "Shelf checked", occurredAt: "2026-08-08T09:55:00.000Z", state: "open", version: 1 });
    expect(prepared).not.toHaveProperty("createdAt");
  });

  it("rejects missing inputs and blank or oversized attributable evidence", () => {
    for (const field of ["storeId", "sectorId", "locationId", "category", "severity", "title", "description", "idempotencyKey"] as const) expect(() => prepareIncidentCreation(principal(), input({ [field]: " " }), now)).toThrow(IncidentCreationValidationError);
    for (const textEvidence of ["  ", "x".repeat(4_001)]) expect(() => prepareIncidentCreation(principal(), input({ textEvidence }), now)).toThrow(IncidentCreationValidationError);
    expect(prepareIncidentCreation(principal(), input({ category: "other", productId: undefined, textEvidence: "Explanation" }), now).textEvidence).toBe("Explanation");
  });

  it("allows the five-minute boundary but rejects invalid or later occurrence times", () => {
    expect(prepareIncidentCreation(principal(), input({ occurredAt: "2026-08-08T10:05:00.000Z" }), now).occurredAt).toBe("2026-08-08T10:05:00.000Z");
    for (const occurredAt of ["invalid", "2026-08-08T10:05:00.001Z"]) expect(() => prepareIncidentCreation(principal(), input({ occurredAt }), now)).toThrow(IncidentCreationValidationError);
  });

  it("denies inactive and mismatched scopes without mutating input", () => {
    const command = input(); const before = structuredClone(command);
    expect(() => prepareIncidentCreation(principal({ active: false }), command, now)).toThrow(IncidentCreationForbiddenError);
    expect(() => prepareIncidentCreation(principal({ roleScopes: [{ role: "collaborator", storeIds: ["store-b"], sectorIds: [], categoryResponsibilities: [], teamIds: [] }] }), command, now)).toThrow(IncidentCreationForbiddenError);
    expect(command).toEqual(before);
  });
});
