export type Reference = Readonly<{ active: boolean }>;
type ScopedReference = Reference & Readonly<{ id: string; organizationId: string }>;
type Sector = ScopedReference & Readonly<{ storeId: string }>;
type Location = Sector & Readonly<{ sectorId: string }>;
type Product = ScopedReference;
export type Category = Readonly<{ key: string; organizationId: string; active: boolean; requiresLocation: boolean; requiresProduct: boolean; requiresCreationEvidence: boolean; requiresNote: boolean }>;
type Severity = Readonly<{ key: string; organizationId: string; active: boolean; order: number; guidance: string }>;

const catalogOrganizationId = "00000000-0000-7000-8000-000000000001";
const immutable = <T extends object>(values: T[]) => Object.freeze(values.map((value) => Object.freeze(value))) as ReadonlyArray<Readonly<T>>;
const category = (key: string, overrides = {}) => ({ key, organizationId: catalogOrganizationId, active: true, requiresLocation: true, requiresProduct: true, requiresCreationEvidence: true, requiresNote: false, ...overrides });
export const categories = immutable<Category>(["out-of-stock", "inventory-mismatch", "misplaced-product", "price-or-label", "replenishment-blocked"].map(category).concat([category("equipment-failure", { requiresProduct: false }), category("other", { requiresProduct: false, requiresNote: true })]));
export const severities = immutable<Severity>(["low", "medium", "high", "critical"].map((key, index) => ({ key, organizationId: catalogOrganizationId, active: true, order: index + 1, guidance: ["Limited impact with a workaround", "Material local disruption without immediate safety or store-wide impact", "Major operational impact, substantial loss risk, or no practical workaround", "Immediate safety, regulatory, severe loss, or store-wide continuity risk"][index]! })));

export function normalizeName(name: string): string {
  const normalized = name.trim();
  if (!normalized) throw new Error("Name must not be blank");
  return normalized;
}

export const isSelectableReference = (reference: Reference) => reference.active;
export const selectableReferences = <T extends Reference>(references: readonly T[]) => references.filter(isSelectableReference);

export function validateIncidentReferences(input: { organizationId: string; store: ScopedReference; sector: Sector; location: Location; product?: Product; availableStoreIds?: readonly string[] }): void {
  const references = [input.store, input.sector, input.location, input.product].filter((reference): reference is ScopedReference => reference !== undefined);
  if (references.some((reference) => !reference.active)) throw new Error("Reference must be active");
  if (references.some((reference) => reference.organizationId !== input.organizationId)) throw new Error("Reference must belong to the incident organization");
  if (input.sector.storeId !== input.store.id || input.location.storeId !== input.store.id || input.location.sectorId !== input.sector.id) throw new Error("Location must belong to the incident store and sector");
  if (input.product && input.availableStoreIds && !input.availableStoreIds.includes(input.store.id)) throw new Error("Product is unavailable for the incident store");
}
