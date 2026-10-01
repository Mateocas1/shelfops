import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url);

describe("production API container image", () => {
  it("builds a pinned production closure and runs the compiled API as non-root", async () => {
    const dockerfile = await readFile(new URL("Dockerfile.api", root), "utf8");

    expect(dockerfile).toMatch(/^FROM node:22\.19\.0-bookworm-slim@sha256:[a-f0-9]{64} AS build$/m);
    expect(dockerfile).toMatch(/^FROM node:22\.19\.0-bookworm-slim@sha256:[a-f0-9]{64} AS runtime$/m);
    expect(dockerfile).toContain("corepack prepare pnpm@11.11.0 --activate");
    expect(dockerfile).toContain("pnpm install --frozen-lockfile");
    expect(dockerfile).toContain("pnpm run build:producers");
    expect(dockerfile).toContain("pnpm --filter @shelfops/api build");
    expect(dockerfile).toMatch(/pnpm --filter @shelfops\/api --prod deploy/);
    expect(dockerfile).toContain("rm -rf /app/deploy/src");
    expect(dockerfile).toContain("rm -f /app/deploy/tsconfig.json");
    expect(dockerfile).toContain("COPY --from=build --chown=node:node /app/deploy ./");
    expect(dockerfile).toContain("ARG SOURCE_REVISION");
    expect(dockerfile).toContain("ARG SOURCE_REPOSITORY");
    expect(dockerfile).toContain("org.opencontainers.image.revision=$SOURCE_REVISION");
    expect(dockerfile).toContain("org.opencontainers.image.source=$SOURCE_REPOSITORY");
    expect(dockerfile).toMatch(/ENV NODE_ENV=production \\\n+ {4}HOST=0\.0\.0\.0 \\\n+ {4}PORT=3000/);
    expect(dockerfile).toContain("WORKDIR /app");
    expect(dockerfile).toContain("USER node");
    expect(dockerfile).toContain('ENTRYPOINT ["node", "dist/server.js"]');
    expect(dockerfile).not.toMatch(/(?:DATABASE_URL|CURSOR_SECRET)\s*=/);
    expect(dockerfile).not.toMatch(/(?:curl|wget|HEALTHCHECK)/);
  });

  it("ships a migration target with the bundled RDS trust store and keeps the API image default", async () => {
    const dockerfile = await readFile(new URL("Dockerfile.api", root), "utf8");

    expect(dockerfile).toMatch(/^FROM node:22\.19\.0-bookworm-slim@sha256:[a-f0-9]{64} AS ca-bundle$/m);
    expect(dockerfile).toContain("https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem");
    expect(dockerfile).not.toMatch(/https:\/\/truststore[^ ]*[\s\S]{0,80}(?:curl|wget)/);
    expect(dockerfile).toMatch(/^FROM node:22\.19\.0-bookworm-slim@sha256:[a-f0-9]{64} AS migrate$/m);
    expect(dockerfile).toContain("pnpm run build:migrate");
    expect(dockerfile).toContain("COPY --from=build --chown=node:node /app/dist/migrate/migrate.js ./scripts/migrate.cjs");
    expect(dockerfile).toContain("COPY --from=build --chown=node:node /app/dist/migrate/seed-tenant.js ./scripts/seed-tenant.cjs");
    expect(dockerfile).toContain("COPY --from=build --chown=node:node /app/migrations ./migrations");
    expect(dockerfile).toContain("COPY --from=ca-bundle --chown=node:node /global-bundle.pem ./certs/global-bundle.pem");
    expect(dockerfile).toContain('ENTRYPOINT ["node", "scripts/migrate.cjs"]');

    const stages = [...dockerfile.matchAll(/^FROM\s.+?\sAS\s(\w+)$/gm)].map((match) => match[1]);
    expect(stages.at(-1)).toBe("runtime");
  });

  it("excludes host and authority state from the build context", async () => {
    const ignored = await readFile(new URL(".dockerignore", root), "utf8");

    for (const entry of [
      ".git",
      "node_modules",
      "dist",
      ".env",
      "coverage",
      ".codegraph",
      ".opencode",
      "docs",
      "test",
      "odd",
    ]) {
      expect(ignored).toContain(entry);
    }
    expect(ignored).toMatch(/\*\.(?:pem|key)/);
  });
});
