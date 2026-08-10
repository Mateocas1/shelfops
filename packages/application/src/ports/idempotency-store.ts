import type { ConfigurationOutcome } from "./configuration-executor.js";
export type IdempotencyScope = Readonly<{ principalId: string; apiMajor: "v1"; operation: "configure-location"; targetKey: string; key: string }>;
export type IdempotencyRecord = Readonly<{ state: "pending" | "completed"; requestHash: string; outcome?: ConfigurationOutcome; expiresAt: string }>;
export interface IdempotencyStore { find(scope: IdempotencyScope): Promise<IdempotencyRecord | undefined>; insertPending(scope: IdempotencyScope, requestHash: string, expiresAt: string): Promise<void>; complete(scope: IdempotencyScope, outcome: ConfigurationOutcome): Promise<void>; }
