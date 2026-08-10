import { describe, expect, it } from "vitest";

import { buildReferenceFixture, fixtureVocabulary } from "../../../test-support/src/fixtures/vocabulary.js";
import { categories, isSelectableReference, normalizeName, selectableReferences, severities, validateIncidentReferences } from "./reference-data.js";

describe("reference data", () => {
  it("normalizes names and exposes safe category and severity defaults", () => {
    expect(normalizeName("  Store A  ")).toBe("Store A");
    expect(() => normalizeName(" \t ")).toThrow("Name must not be blank");
    expect(categories.find(({ key }) => key === "inventory-mismatch")).toMatchObject({
      requiresLocation: true,
      requiresProduct: true,
      requiresCreationEvidence: true
    });
    expect(categories.find(({ key }) => key === "other")).toMatchObject({ requiresProduct: false, requiresNote: true });
    expect(severities.map(({ key }) => key)).toEqual(["low", "medium", "high", "critical"]);
    expect(Object.isFrozen(categories)).toBe(true);
    expect(selectableReferences(fixtureVocabulary.products)).toHaveLength(9);
    expect(isSelectableReference({ active: true })).toBe(true);
    expect(isSelectableReference({ active: false })).toBe(false);
  });

  it("provides deterministic, clearly simulated fixture vocabulary", () => {
    expect(fixtureVocabulary.organization.name).toContain("Simulated");
    expect(fixtureVocabulary.stores).toHaveLength(2);
    expect(fixtureVocabulary.sectors).toHaveLength(4);
    expect(fixtureVocabulary.locations).toHaveLength(4);
    expect(fixtureVocabulary.products).toHaveLength(10);
    expect(fixtureVocabulary.products.some(({ active }) => !active)).toBe(true);
    expect(fixtureVocabulary.users.map(({ role }) => role)).toEqual(
      expect.arrayContaining(["collaborator", "sector-lead", "supervisor", "inventory-team", "central-operations"])
    );
    expect(fixtureVocabulary.sectors.filter(({ storeId }) => storeId === fixtureVocabulary.stores[0]!.id)).toHaveLength(2);
    expect(fixtureVocabulary.locations.filter(({ storeId }) => storeId === fixtureVocabulary.stores[1]!.id)).toHaveLength(2);
    expect(fixtureVocabulary.locations.every(({ sectorId }) => fixtureVocabulary.sectors.some(({ id }) => id === sectorId))).toBe(true);
    expect(fixtureVocabulary.users.filter(({ role }) => role === "collaborator").map(({ storeIds, sectorIds }) => [storeIds, sectorIds])).toEqual([[[fixtureVocabulary.stores[0]!.id], [fixtureVocabulary.sectors[0]!.id]], [[fixtureVocabulary.stores[1]!.id], [fixtureVocabulary.sectors[2]!.id]]]);
    expect([fixtureVocabulary.organization, ...fixtureVocabulary.stores, ...fixtureVocabulary.sectors, ...fixtureVocabulary.locations, ...fixtureVocabulary.products, ...fixtureVocabulary.users].every(({ createdAt, updatedAt }) => createdAt === fixtureVocabulary.clock && updatedAt === fixtureVocabulary.clock)).toBe(true);
    expect(buildReferenceFixture()).toEqual(buildReferenceFixture());
  });

  it("rejects inactive, cross-hierarchy, cross-organization, and unavailable product references", () => {
    const [storeA, storeB] = fixtureVocabulary.stores;
    const [sectorA] = fixtureVocabulary.sectors;
    const [, , locationB] = fixtureVocabulary.locations;
    expect(() => validateIncidentReferences({ organizationId: fixtureVocabulary.organization.id, store: storeA!, sector: sectorA!, location: locationB!, product: fixtureVocabulary.products[0]!, availableStoreIds: [storeA!.id] })).toThrow("Location must belong to the incident store and sector");
    expect(() => validateIncidentReferences({ organizationId: fixtureVocabulary.organization.id, store: storeA!, sector: sectorA!, location: fixtureVocabulary.locations[0]!, product: fixtureVocabulary.products[0]!, availableStoreIds: [storeB!.id] })).toThrow("Product is unavailable for the incident store");
  });
});
