import { describe, expect, it } from "vitest";
import { IdempotencyConflictError, StaleConfigurationError, type ConfigurationInput, type ConfigurationOutcome } from "../ports/configuration-executor.js";
import { ReferenceDataConfigurationExecutor } from "./configuration-executor.js";

const principal = { id: "supervisor-a", active: true, roleScopes: [{ role: "supervisor" as const, storeIds: ["store-a"], sectorIds: [], categoryResponsibilities: [], teamIds: [] }], grants: [] };
const input: ConfigurationInput = { storeId: "store-a", locationId: "location-a", expectedVersion: 1, effectiveAt: "2026-08-01T09:00:00.000Z", active: false, label: "Aisle 1", idempotencyKey: "key-a", correlationId: "correlation-a" };
const replay: ConfigurationOutcome = { status: 200, eventId: "event-old", version: 2, before: { active: true }, after: { active: false }, effectiveAt: input.effectiveAt, correlationId: input.correlationId };
function harness(record?: { state: "completed"; requestHash: string; outcome: ConfigurationOutcome; expiresAt: string }, hash = "hash-a", failure?: Error) {
  const order: string[] = []; const commands: unknown[] = []; const completed: ConfigurationOutcome[] = [];
  return { order, commands, completed, executor: new ReferenceDataConfigurationExecutor({ idempotency: { find: async () => { order.push("find"); return record; }, insertPending: async () => { order.push("pending"); }, complete: async (_scope, outcome) => { order.push("complete"); completed.push(outcome); } }, repository: { apply: async (command) => { order.push("repository"); commands.push(command); if (failure) throw failure; return { version: 2, before: replay.before, after: replay.after }; } }, fingerprint: () => hash, expiresAt: () => "2026-08-02T09:00:00.000Z", newEventId: () => { order.push("event"); return "event-new"; } }) };
}
describe("configuration executor", () => {
  it("looks up first then derives and completes one store-location outcome", async () => {
    const test = harness(); const expected = { ...replay, eventId: "event-new" }; await expect(test.executor.execute(principal, input)).resolves.toEqual(expected);
    expect(test.order).toEqual(["find", "event", "pending", "repository", "complete"]); expect(test.commands).toEqual([{ eventId: "event-new", target: "store-reference", referenceId: "location-a", storeId: "store-a", expectedVersion: 1, effectiveAt: input.effectiveAt, effectiveUntil: undefined, active: false, label: "Aisle 1", actorId: "supervisor-a" }]); expect(test.completed).toEqual([expected]);
  });
  it("replays equal completion and conflicts a changed fingerprint before repository access", async () => {
    const completed = harness({ state: "completed", requestHash: "hash-a", outcome: replay, expiresAt: "" }); await expect(completed.executor.execute(principal, input)).resolves.toEqual(replay); expect(completed.order).toEqual(["find"]);
    const conflict = harness({ state: "completed", requestHash: "hash-a", outcome: replay, expiresAt: "" }, "changed"); await expect(conflict.executor.execute(principal, input)).rejects.toBeInstanceOf(IdempotencyConflictError); expect(conflict.order).toEqual(["find"]);
  });
  it("maps stale repository failures to the public typed error", async () => {
    await expect(harness(undefined, "hash-a", new Error("stale-version")).executor.execute(principal, input)).rejects.toBeInstanceOf(StaleConfigurationError);
  });
});
