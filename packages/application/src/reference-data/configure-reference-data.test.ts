import { describe, expect, it } from "vitest";
import { configureReferenceData } from "./configure-reference-data.js";
const supervisor = { id: "supervisor", active: true, roleScopes: [{ role: "supervisor" as const, storeIds: ["store-a"], sectorIds: [], categoryResponsibilities: [], teamIds: [] }], grants: [] };
const command = { eventId: "event-a", target: "store-reference" as const, referenceId: "location-a", storeId: "store-a", expectedVersion: 1, effectiveAt: "2026-08-01T09:00:00.000Z", active: false, label: "Aisle 1" };
describe("configure reference data", () => {
  it("persists an attributable store-supervisor change with the expected version", async () => {
    const calls: unknown[] = []; const repository = { apply: async (input: unknown) => { calls.push(input); return { version: 2, before: { label: "Aisle 1", active: true }, after: { label: "Aisle 1", active: false } }; } };
    await expect(configureReferenceData(supervisor, command, repository)).resolves.toMatchObject({ version: 2, after: { active: false } }); expect(calls).toEqual([{ ...command, actorId: "supervisor", effectiveUntil: undefined }]);
  });
  it("denies ungranted organization catalog changes and invalid ranges without persistence", async () => {
    const calls: unknown[] = []; const repository = { apply: async (input: unknown) => { calls.push(input); return { version: 2, before: {}, after: {} }; } };
    await expect(configureReferenceData(supervisor, { ...command, target: "organization-catalog" }, repository)).rejects.toThrow("unsupported-target"); await expect(configureReferenceData(supervisor, { ...command, effectiveUntil: command.effectiveAt }, repository)).rejects.toThrow("effectiveUntil"); expect(calls).toEqual([]);
  });
  it("rejects organization catalog commands before repository access", async () => {
    const calls: unknown[] = []; const central = { id: "central", active: true, roleScopes: [{ role: "central-operations" as const, storeIds: ["store-a"], sectorIds: [], categoryResponsibilities: [], teamIds: [] }], grants: [{ action: "configure-organization-catalog" as const, role: "central-operations" as const }] };
    await expect(configureReferenceData(central, { ...command, target: "organization-catalog" }, { apply: async (value: unknown) => { calls.push(value); return { version: 2, before: {}, after: {} }; } })).rejects.toThrow("unsupported-target"); expect(calls).toEqual([]);
  });
});
