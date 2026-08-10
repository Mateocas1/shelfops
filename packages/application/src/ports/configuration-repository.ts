export type ConfigurationCommand = Readonly<{ eventId: string; target: "store-reference" | "organization-catalog"; referenceId: string; storeId: string; expectedVersion: number; effectiveAt: string; effectiveUntil?: string; active: boolean; label?: string; actorId: string }>;
export type ConfigurationResult = Readonly<{ version: number; before: Record<string, unknown>; after: Record<string, unknown> }>;
export interface ConfigurationRepository { apply(command: ConfigurationCommand): Promise<ConfigurationResult>; }
