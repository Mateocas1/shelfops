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
    ]) {
      expect(ignored).toContain(entry);
    }
    expect(ignored).toMatch(/\*\.(?:pem|key)/);
  });
});
