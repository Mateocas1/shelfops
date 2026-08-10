const id = (value: number) => `00000000-0000-7000-8000-${value.toString().padStart(12, "0")}`;
const clock = "2026-01-01T00:00:00.000Z";
const stamp = <T extends object>(record: T) => ({ ...record, createdAt: clock, updatedAt: clock });
const organizationId = id(1);
const stores = ["Store A", "Store B"].map((name, index) => stamp({ id: id(index + 2), organizationId, name, active: true }));
const storeA = stores[0]!;
const storeB = stores[1]!;

export const fixtureVocabulary = {
  clock,
  organization: stamp({ id: organizationId, name: "Simulated ShelfOps Organization", active: true }),
  stores,
  sectors: stores.flatMap((store, index) => ["Sales", "Inventory"].map((name, offset) => stamp({ id: id(10 + index * 2 + offset), organizationId, storeId: store.id, name, active: true }))),
  locations: stores.flatMap((store, index) => ["Front", "Back"].map((name, offset) => stamp({ id: id(20 + index * 2 + offset), organizationId, storeId: store.id, sectorId: id(10 + index * 2 + offset), name, active: true }))),
  products: Array.from({ length: 10 }, (_, index) => stamp({ id: id(30 + index), organizationId, name: `Simulated Product ${index + 1}`, active: index !== 9 })),
  users: [
    ["collaborator", [storeA.id]], ["collaborator", [storeB.id]], ["sector-lead", [storeA.id]], ["supervisor", [storeA.id]], ["supervisor", [storeB.id]], ["inventory-team", [storeA.id]], ["central-operations", [storeA.id]], ["central-operations", stores.map(({ id }) => id)]
  ].map(([role, storeIds], index) => stamp({ id: id(50 + index), organizationId, name: `Simulated User ${index + 1}`, role, storeIds, sectorIds: role === "collaborator" ? [id(10 + index * 2)] : [], active: true }))
};

export const buildReferenceFixture = () => structuredClone(fixtureVocabulary);
