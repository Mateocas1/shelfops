import { readFile } from "node:fs/promises";
import { posix as path } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

async function sourceFile(relativePath: string): Promise<ts.SourceFile> {
  const sourceUrl = new URL(relativePath, import.meta.url);
  return ts.createSourceFile(sourceUrl.pathname, await readFile(sourceUrl, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function imports(source: ts.SourceFile): Map<string, readonly string[]> {
  return new Map(source.statements.filter(ts.isImportDeclaration).map((statement) => [
    statement.moduleSpecifier.getText(source).slice(1, -1),
    statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)
      ? statement.importClause.namedBindings.elements.map((element) => element.name.text)
      : []
  ]));
}

function normalizePath(value: string): string {
  return decodeURIComponent(value).replace(/^file:\/+/i, "/").replace(/\\/g, "/");
}

function packageSourceReachThroughImports(source: ts.SourceFile): readonly string[] {
  const sourceDirectory = path.dirname(normalizePath(source.fileName));

  return source.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return [];

    const moduleSpecifier = statement.moduleSpecifier.text;
    const normalizedModuleSpecifier = normalizePath(moduleSpecifier);
    const resolvedPath = normalizedModuleSpecifier.startsWith(".")
      ? path.resolve(sourceDirectory, normalizedModuleSpecifier)
      : normalizedModuleSpecifier;

    return /(?:^|\/)packages\/[^/]+\/src(?:\/|$)/.test(resolvedPath) ? [moduleSpecifier] : [];
  });
}

function contains(source: ts.Node, predicate: (node: ts.Node) => boolean): boolean {
  if (predicate(source)) return true;
  return source.getChildren().some((child) => contains(child, predicate));
}

describe("auth boundary structure", () => {
  it("keeps identity contracts and session validation out of the HTTP adapter", async () => {
    const boundary = await sourceFile("../src/auth/session-boundary.ts");
    const localDeclarationNames = boundary.statements
      .filter((statement): statement is ts.InterfaceDeclaration | ts.TypeAliasDeclaration => ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement))
      .map((statement) => statement.name.text);

    expect(localDeclarationNames).not.toEqual(expect.arrayContaining(["AuthorizedPrincipal", "IdentitySession", "IdentityProvider"]));
    expect(contains(boundary, (node) => ts.isFunctionDeclaration(node) && node.name?.text === "isCurrentSession")).toBe(false);
    expect(contains(boundary, (node) => ts.isPropertyAccessExpression(node) && ["lookupSession", "expiresAt", "revokedAt", "active"].includes(node.name.text))).toBe(false);
  });

  it("uses the public application ports and session resolver", async () => {
    const boundary = await sourceFile("../src/auth/session-boundary.ts");
    const boundaryImports = imports(boundary);

    expect(boundaryImports.get("@shelfops/application/ports/identity-provider")).toEqual(expect.arrayContaining(["IdentityProvider", "IdentitySession"]));
    expect(boundaryImports.get("@shelfops/application/identity/session")).toEqual(["resolveSession"]);
    expect(contains(boundary, (node) => ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "resolveSession")).toBe(true);
  });

  it("keeps auth contract tests on public application subpaths", async () => {
    const authContract = await sourceFile("./auth.contract.test.ts");
    const authImports = imports(authContract);

    expect([...authImports.keys()]).not.toEqual(expect.arrayContaining([expect.stringMatching(/packages\/.+\/src/)]));
    expect(authImports.get("@shelfops/application/authorization/authorized-principal")).toEqual(expect.arrayContaining(["AuthorizedPrincipal"]));
    expect(authImports.get("@shelfops/application/identity/session")).toEqual(expect.arrayContaining(["createDevelopmentIdentityProvider", "createOpaqueSessionId"]));
  });

  it("prevents API imports from reaching through package source directories", async () => {
    const inspectedFiles = [
      ["apps/api/src/app.ts", "../src/app.ts"],
      ["apps/api/src/auth/session-boundary.ts", "../src/auth/session-boundary.ts"],
      ["apps/api/test/auth.contract.test.ts", "./auth.contract.test.ts"],
      ["apps/api/test/auth-boundary-structure.contract.test.ts", "./auth-boundary-structure.contract.test.ts"]
    ] as const;

    const violationsByFile = Object.fromEntries(await Promise.all(
      inspectedFiles.map(async ([label, relativePath]) => {
        const source = await sourceFile(relativePath);
        return [label, packageSourceReachThroughImports(source)] as const;
      })
    ));

    expect(violationsByFile).toEqual(Object.fromEntries(
      inspectedFiles.map(([label]) => [label, []])
    ));
  });
});
