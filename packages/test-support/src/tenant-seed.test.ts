import { describe, expect, it } from "vitest";

import { parseTenantSeedInput } from "../../../scripts/seed-tenant.js";

function args(overrides: Partial<Record<"--org-slug" | "--org-name" | "--store-code" | "--store-name" | "--user-email" | "--oidc-issuer" | "--oidc-subject", string>> = {}): string[] {
  const values = {
    "--org-slug": "acme-retail",
    "--org-name": "Acme Retail",
    "--store-code": "store-001",
    "--store-name": "Acme Downtown",
    "--user-email": "Ops@Acme.Example",
    "--oidc-issuer": "https://idp.acme.example",
    "--oidc-subject": "subject-001",
    ...overrides
  };
  return Object.entries(values).flatMap(([flag, value]) => [flag, value]);
}

describe("tenant seed input", () => {
  it("parses CLI arguments and normalizes values with defaults", () => {
    expect(parseTenantSeedInput(args(), {})).toEqual({
      organizationSlug: "acme-retail",
      organizationName: "Acme Retail",
      storeCode: "store-001",
      storeName: "Acme Downtown",
      userEmail: "ops@acme.example",
      userName: "ops@acme.example",
      userRole: "supervisor",
      oidcIssuer: "https://idp.acme.example",
      oidcSubject: "subject-001"
    });
  });

  it("supports --key=value and environment fallbacks", () => {
    const input = parseTenantSeedInput(["--org-slug=acme-retail", "--store-code=store-001"], {
      SHELFOPS_SEED_ORG_NAME: "Acme Retail",
      SHELFOPS_SEED_STORE_NAME: "Acme Downtown",
      SHELFOPS_SEED_USER_EMAIL: "ops@acme.example",
      SHELFOPS_SEED_USER_NAME: "Operations Lead",
      SHELFOPS_SEED_USER_ROLE: "collaborator",
      SHELFOPS_SEED_OIDC_ISSUER: "https://idp.acme.example",
      SHELFOPS_SEED_OIDC_SUBJECT: "subject-001"
    });
    expect(input).toMatchObject({ organizationSlug: "acme-retail", userName: "Operations Lead", userRole: "collaborator" });
  });

  it("rejects missing mandatory input", () => {
    expect(() => parseTenantSeedInput([], {})).toThrow("tenant-seed-input-required");
    expect(() => parseTenantSeedInput(["--org-slug", "acme"], {})).toThrow("tenant-seed-input-required");
  });

  it("accepts an argument separator", () => {
    expect(parseTenantSeedInput(["--", ...args()], {})).toMatchObject({ organizationSlug: "acme-retail" });
  });

  it("rejects unknown arguments", () => {
    expect(() => parseTenantSeedInput([...args(), "--unknown", "value"], {})).toThrow("tenant-seed-input-invalid");
  });

  it("rejects blank mandatory values as required", () => {
    expect(() => parseTenantSeedInput(args({ "--oidc-subject": "   " }), {})).toThrow("tenant-seed-input-required");
  });

  it.each([
    ["--org-slug", "Not A Slug"],
    ["--store-code", "has spaces"],
    ["--user-email", "not-an-email"],
    ["--oidc-issuer", "http://idp.acme.example"],
    ["--oidc-issuer", "https://idp.acme.example/"]
  ])("rejects invalid %s", (flag, value) => {
    expect(() => parseTenantSeedInput(args({ [flag]: value }), {})).toThrow("tenant-seed-input-invalid");
  });

  it("rejects an unsupported user role", () => {
    expect(() => parseTenantSeedInput([...args(), "--user-role", "administrator"], {})).toThrow("tenant-seed-input-invalid");
  });
});
