import { spawn } from "node:child_process";
import { createOidcProtocol } from "../apps/api/src/auth/oidc-client.js";
import { buildApi } from "../apps/api/src/app.js";

const COMPOSE = "infra/compose.oidc.yml";
const PROJECT = "shelfops-oidc-proof";
const issuer = "http://127.0.0.1:18080/default";
const origin = "http://127.0.0.1:18181";

function compose(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["compose", "--project-name", PROJECT, "--file", COMPOSE, ...args], { shell: false, stdio: "inherit" });
    child.once("error", reject); child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`docker compose failed with ${code ?? "signal"}`)));
  });
}
async function ready(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await fetch(`${issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(2_000) }).then((response) => response.ok).catch(() => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("mock issuer readiness timed out");
}
async function main(): Promise<void> {
  let app: Awaited<ReturnType<typeof buildApi>> | undefined;
  await compose(["down", "--volumes", "--remove-orphans"]);
  try {
    await compose(["up", "--detach"]); await ready();
    const config = { issuer: new URL(issuer), clientId: "shelfops-proof", clientSecret: "proof-secret", callbackUrl: new URL(`${origin}/auth/callback`), destinationUrl: new URL(`${origin}/complete`), organizationId: "00000000-0000-4000-8000-000000000001", sessionTtlSeconds: 60, providerTimeoutSeconds: 5, allowInsecureRequests: true };
    const protocol = await createOidcProtocol(config); const attempts = new Map<string, any>(); let active = false;
    const sessionId = "s".repeat(43), csrfToken = "c".repeat(43);
    app = await buildApi({ configurationExecutor: { execute: async () => ({ kind: "not-found" }) as never }, oidc: { config, protocol,
      identityProvider: { kind: "production", lookupSession: async (id) => active && id === sessionId ? { id, expiresAt: Date.now() + 60_000, principal: { id: "proof-user", active: true, roleScopes: [], grants: [] }, matchesCsrfToken: (value) => value === csrfToken } : undefined },
      revoke: async () => { active = false; return { kind: "revoked" }; },
      persistence: {
        beginAuthorization: async (value) => { attempts.set(value.state, value); return { kind: "started" }; },
        consumeAuthorization: async (state) => { const value = attempts.get(state); attempts.delete(state); return value ? { kind: "consumed", issuer: value.issuer, nonce: value.nonce, pkceVerifier: value.pkceVerifier } : { kind: "not-found" }; },
        findMappedUser: async ({ issuer: actual }) => actual === issuer ? { kind: "mapped", userId: "proof-user" } : { kind: "not-found" },
        createSession: async () => { active = true; return { kind: "created", sessionId, csrfToken }; }
      }
    } });
    await app.listen({ host: "127.0.0.1", port: 18181 });
    const login = await fetch(`${origin}/auth/login`, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    const authorizationUrl = login.headers.get("location")!;
    const authorization = await fetch(authorizationUrl, { method: "POST", body: new URLSearchParams({ username: "proof-user" }), redirect: "manual", signal: AbortSignal.timeout(10_000) });
    const callbackUrl = authorization.headers.get("location")!; const callback = await fetch(callbackUrl, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    const cookies = callback.headers.getSetCookie(); if (callback.status !== 303 || cookies.length !== 2) throw new Error("callback proof failed");
    if ((await fetch(callbackUrl, { redirect: "manual", signal: AbortSignal.timeout(10_000) })).status !== 401) throw new Error("callback replay was accepted");
    const logout = await fetch(`${origin}/auth/logout`, { method: "POST", headers: { cookie: `shelfops_session=${sessionId}; shelfops_csrf=${csrfToken}`, "x-csrf-token": csrfToken }, signal: AbortSignal.timeout(10_000) });
    if (logout.status !== 204 || active) throw new Error("logout proof failed");
    console.log("OIDC runtime proof passed: login callback session replay logout cleanup");
  } finally {
    await app?.close().catch(() => undefined); await compose(["down", "--volumes", "--remove-orphans"]).catch(() => undefined);
  }
}
main().catch((error) => { console.error(`OIDC runtime proof failed: ${error instanceof Error ? error.message : "unknown error"}`); process.exitCode = 1; });
