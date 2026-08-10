import { readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import { createDevelopmentIdentityProvider, createOpaqueSessionId } from "@shelfops/application/identity/session";
import type { IdentityProvider } from "@shelfops/application/ports/identity-provider";
import { PostgresAuthorizedIncidentRepository } from "@shelfops/infrastructure/repositories/authorized-incident-repository";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const principal: AuthorizedPrincipal = {
  id: "user-a",
  active: true,
  roleScopes: [{
  role: "collaborator",
  storeIds: ["store-a"],
  sectorIds: ["sector-a"],
  categoryResponsibilities: [],
  teamIds: []
  }],
  grants: []
};

type PackageManifest = Readonly<{ exports: Record<string, unknown>; name: string; private: boolean; type: string }>;
const domainPackage = ["@shelfops", "domain"].join("/"); const skippedSegments = new Set(["node_modules", "dist", "generated", "vendor"]);

async function packageManifest(packageName: "domain" | "application" | "infrastructure"): Promise<PackageManifest> {
  return JSON.parse(await readFile(new URL(`../../../packages/${packageName}/package.json`, import.meta.url), "utf8")) as PackageManifest;
}

describe("application package boundary", () => {
  it("resolves application public subpaths using domain vocabulary", () => {
    const session = { id: createOpaqueSessionId(), csrfToken: "csrf-token", expiresAt: Date.now() + 60_000, principal };
    const provider: IdentityProvider = createDevelopmentIdentityProvider(() => session);

    expect(session.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(awaitedProviderKind(provider)).toBe("development");
  });

  it("exposes only the approved package subpaths", async () => {
    const domain = await packageManifest("domain");
    const application = await packageManifest("application");
    const infrastructure = await packageManifest("infrastructure");
    const api = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as Readonly<{ dependencies?: Record<string, string> }>;
    const lockfile = await readFile(new URL("../../../pnpm-lock.yaml", import.meta.url), "utf8");
    const rootPackage = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8")) as Readonly<{ scripts?: Record<string, string> }>;
    const applicationSource = await sourceFile(new URL("../../../packages/application/src/reference-data/configure-reference-data.ts", import.meta.url));
    const triageEvaluatorDeclaration = await readFile(new URL("../../../packages/domain/dist/triage/evaluator.d.ts", import.meta.url), "utf8");
    const triageAuthorityDeclaration = await readFile(new URL("../../../packages/application/dist/triage/authority.d.ts", import.meta.url), "utf8");

    expect(domain).toMatchObject({ name: "@shelfops/domain", private: true, type: "module" });
    expect(Object.keys(domain.exports).sort()).toEqual([
      "./authorization/action-policy",
      "./authorization/assignment-eligibility",
      "./authorization/types",
      "./authorization/visibility-policy", "./governance/versioned-policy", "./recurrence/evaluator", "./triage/evaluator"
    ]);
    expect(domain.exports["./governance/versioned-policy"]).toEqual({ types: "./dist/governance/versioned-policy.d.ts", default: "./dist/governance/versioned-policy.js" });
    expect(domain.exports["./recurrence/evaluator"]).toEqual({ types: "./dist/recurrence/evaluator.d.ts", default: "./dist/recurrence/evaluator.js" });
    expect(domain.exports["./triage/evaluator"]).toEqual({ types: "./dist/triage/evaluator.d.ts", default: "./dist/triage/evaluator.js" });
    expect(triageEvaluatorDeclaration).toMatch(/export declare function evaluateTriage\(/);
    expect(application).toMatchObject({ name: "@shelfops/application", private: true, type: "module" });
    expect(Object.keys(application.exports).sort()).toEqual([
      "./authorization/authorized-principal",
      "./identity/session", "./incidents/create-incident", "./ports/configuration-executor", "./ports/configuration-repository", "./ports/id-generator", "./ports/idempotency-store", "./ports/identity-provider", "./recurrence/authority", "./reference-data/configuration-executor", "./reference-data/configure-reference-data", "./sla/configure-policy", "./sla/start-cycle", "./triage/authority"
    ]);
    for (const subpath of ["./ports/configuration-repository", "./ports/configuration-executor", "./ports/id-generator", "./ports/idempotency-store", "./recurrence/authority", "./reference-data/configure-reference-data", "./reference-data/configuration-executor", "./sla/configure-policy", "./sla/start-cycle", "./triage/authority"]) expect(application.exports[subpath]).toEqual({ types: `./dist/${subpath.slice(2)}.d.ts`, default: `./dist/${subpath.slice(2)}.js` }); expect(api.dependencies?.[domainPackage]).toBeUndefined(); expect(applicationSource.moduleSpecifiers).toContain(`${domainPackage}/governance/versioned-policy`); expect(lockfile).toContain("apps/api:"); expect(lockfile).toContain("packages/application:"); expect(lockfile).toContain("packages/domain: {}"); expect(await apiViolations()).toEqual([]);
    expect(infrastructure.exports).toEqual({ "./identity/postgres-identity-provider": { types: "./dist/identity/postgres-identity-provider.d.ts", default: "./dist/identity/postgres-identity-provider.js" }, "./idempotency/postgres-idempotency-store": { types: "./dist/idempotency/postgres-idempotency-store.d.ts", default: "./dist/idempotency/postgres-idempotency-store.js" }, "./incidents/postgres-incident-creation-executor": { types: "./dist/incidents/postgres-incident-creation-executor.d.ts", default: "./dist/incidents/postgres-incident-creation-executor.js" }, "./postgres/sla-policy-executor": { types: "./dist/postgres/sla-policy-executor.d.ts", default: "./dist/postgres/sla-policy-executor.js" }, "./recurrence/postgres-recurrence-authority-executor": { types: "./dist/recurrence/postgres-recurrence-authority-executor.d.ts", default: "./dist/recurrence/postgres-recurrence-authority-executor.js" }, "./reference-data/postgres-configuration-executor": { types: "./dist/reference-data/postgres-configuration-executor.d.ts", default: "./dist/reference-data/postgres-configuration-executor.js" }, "./reference-data/postgres-configuration-repository": { types: "./dist/reference-data/postgres-configuration-repository.d.ts", default: "./dist/reference-data/postgres-configuration-repository.js" }, "./repositories/authorized-incident-repository": { types: "./dist/repositories/authorized-incident-repository.d.ts", default: "./dist/repositories/authorized-incident-repository.js" }, "./sla/sla-cycle-executor": { types: "./dist/sla/sla-cycle-executor.d.ts", default: "./dist/sla/sla-cycle-executor.js" } });
    expect(typeof PostgresAuthorizedIncidentRepository).toBe("function");
    expect(api.dependencies).toMatchObject({ "@shelfops/infrastructure": "workspace:*", pg: "^8.22.0" });
    expect(lockfile).toContain("'@shelfops/infrastructure':");
    expect(rootPackage.scripts?.["build:producers"]).toContain("@shelfops/infrastructure build");
    expect(rootPackage.scripts?.typecheck).toBe("pnpm run build:producers && tsc --noEmit");
    const applicationSpecifier = ["@shelfops", "application/reference-data/configure-reference-data"].join("/"); const useCase = await import(applicationSpecifier) as { configureReferenceData: unknown }; expect(typeof useCase.configureReferenceData).toBe("function");
    const triageAuthoritySpecifier = ["@shelfops", "application/triage/authority"].join("/"); const triageAuthority = await import(triageAuthoritySpecifier); expect(Object.keys(triageAuthority).sort()).toEqual(["TriageForbiddenError", "TriageIdempotencyConflictError", "TriageInvalidTransitionError", "TriageNotFoundError", "TriageStaleVersionError", "TriageValidationError", "reduceTriageProjection"]); expect(triageAuthorityDeclaration).toMatch(/export type TriageAuthority/);
  });
});

function awaitedProviderKind(provider: IdentityProvider): IdentityProvider["kind"] {
  return provider.kind;
}

async function sourceFile(url: URL): Promise<ts.SourceFile & { moduleSpecifiers: string[] }> {
  const source = ts.createSourceFile(url.pathname, await readFile(url, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS) as ts.SourceFile & { moduleSpecifiers: string[] }; source.moduleSpecifiers = [];
  const visit = (node: ts.Node): void => { if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) { if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) source.moduleSpecifiers.push(node.moduleSpecifier.text); } else if (ts.isCallExpression(node)) { const [argument] = node.arguments; if (argument !== undefined && ts.isStringLiteral(argument) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")) source.moduleSpecifiers.push(argument.text); } ts.forEachChild(node, visit); }; visit(source); return source;
}
function inside(root: string, candidate: string): boolean { const path = relative(root, candidate); return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path); }
async function ownedTypeScriptFiles(root: URL): Promise<URL[]> {
  const rootPath = fileURLToPath(root); const files: URL[] = []; const visit = async (directory: string): Promise<void> => { for (const entry of await readdir(directory, { withFileTypes: true })) { const candidate = resolve(directory, entry.name); if (!inside(rootPath, candidate)) throw new Error("API scanner escaped its owned root"); if (entry.isSymbolicLink() || candidate.split(/[\\/]+/).some((segment) => skippedSegments.has(segment))) continue; if (entry.isDirectory()) await visit(candidate); else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(pathToFileURL(candidate)); } }; await visit(rootPath); return files;
}
async function apiViolations(): Promise<string[]> {
  const roots = [new URL("../src/", import.meta.url), new URL("./", import.meta.url)]; const sources = await Promise.all((await Promise.all(roots.map(ownedTypeScriptFiles))).flat().map(sourceFile)); return sources.flatMap((source) => source.moduleSpecifiers.filter((specifier) => specifier === domainPackage || specifier.startsWith(`${domainPackage}/`) || /(?:^|\/)packages\/[^/]+\/src(?:\/|$)/.test(specifier) || /(?:^|\/)packages\/[^/]+\/src(?:\/|$)/.test(resolve(dirname(source.fileName), specifier))));
}
