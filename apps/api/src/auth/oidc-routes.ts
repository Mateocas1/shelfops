import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { OidcConfig } from "./oidc-config.js";
import type { OidcProtocol } from "./oidc-client.js";
import { expireOidcCookies, issueOidcCookies } from "./cookies.js";
import { createMutationGuard } from "./session-boundary.js";
import type { IdentityProvider } from "@shelfops/application/ports/identity-provider";

type ConsumedAuthorization = { kind: "consumed"; issuer: string; nonce: string; pkceVerifier: string } | { kind: "not-found" };
type MappedUser = { kind: "mapped"; userId: string } | { kind: "not-found" };
type SessionResult = { kind: "created"; sessionId: string; csrfToken: string } | { kind: "user-not-found" };

export interface OidcLoginPersistence {
  beginAuthorization(input: { issuer: string; state: string; nonce: string; pkceVerifier: string; expiresAt: Date }): Promise<{ kind: "started" | "duplicate-state" }>;
  consumeAuthorization(state: string): Promise<ConsumedAuthorization>;
  findMappedUser(input: { issuer: string; subject: string; organizationId: string }): Promise<MappedUser>;
  createSession(input: { userId: string; organizationId: string; expiresAt: Date }): Promise<SessionResult>;
}

export interface OidcRouteDependencies {
  config: OidcConfig;
  protocol: OidcProtocol;
  persistence: OidcLoginPersistence;
  identityProvider?: IdentityProvider;
  revoke?(sessionId: string, userId: string): Promise<{ kind: "revoked" | "not-found" }>;
}

function failure(request: FastifyRequest, reply: FastifyReply, status: 401 | 503) {
  return reply.header("x-correlation-id", request.id).code(status).send({
    code: status === 401 ? "authentication-failed" : "temporarily-unavailable",
    message: status === 401 ? "Authentication failed" : "Authentication is temporarily unavailable",
    correlationId: request.id
  });
}

export async function registerOidcRoutes(app: FastifyInstance, dependencies: OidcRouteDependencies): Promise<void> {
  const { config, persistence, protocol } = dependencies;
  const hidden = { schema: { hide: true } };

  app.get("/auth/login", hidden, async (request, reply) => {
    try {
      const attempt = await protocol.begin();
      const result = await persistence.beginAuthorization({
        issuer: config.issuer.href.replace(/\/$/, ""), state: attempt.state, nonce: attempt.nonce,
        pkceVerifier: attempt.verifier, expiresAt: new Date(Date.now() + 600_000)
      });
      if (result.kind !== "started") return failure(request, reply, 503);
      return reply.redirect(attempt.authorizationUrl.href, 303);
    } catch { return failure(request, reply, 503); }
  });

  app.get<{ Querystring: { state?: string } }>("/auth/callback", hidden, async (request, reply) => {
    const state = request.query.state;
    if (!state) return failure(request, reply, 401);
    let consumed: ConsumedAuthorization;
    try { consumed = await persistence.consumeAuthorization(state); } catch { return failure(request, reply, 503); }
    if (consumed.kind !== "consumed") return failure(request, reply, 401);

    try {
      const callback = new URL(config.callbackUrl.href);
      callback.search = request.raw.url?.split("?", 2)[1] ?? "";
      const identity = await protocol.exchange(callback, { state, nonce: consumed.nonce, verifier: consumed.pkceVerifier });
      if (identity.issuer !== consumed.issuer || identity.issuer !== config.issuer.href.replace(/\/$/, "")) return failure(request, reply, 401);
      const mapped = await persistence.findMappedUser({ ...identity, organizationId: config.organizationId });
      if (mapped.kind !== "mapped") return failure(request, reply, 401);
      const session = await persistence.createSession({ userId: mapped.userId, organizationId: config.organizationId, expiresAt: new Date(Date.now() + config.sessionTtlSeconds * 1000) });
      if (session.kind !== "created") return failure(request, reply, 401);
      issueOidcCookies(reply, session.sessionId, session.csrfToken, config.sessionTtlSeconds);
      return reply.redirect(config.destinationUrl.href, 303);
    } catch { return failure(request, reply, 503); }
  });

  if (dependencies.identityProvider && dependencies.revoke) app.post("/auth/logout", { ...hidden, preHandler: createMutationGuard(dependencies.identityProvider) }, async (request, reply) => {
    const sessionId = request.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("shelfops_session="))?.slice(17);
    if (!sessionId || !request.principal) return failure(request, reply, 401);
    try {
      if ((await dependencies.revoke!(sessionId, request.principal.id)).kind !== "revoked") return failure(request, reply, 401);
      expireOidcCookies(reply); return reply.code(204).send();
    } catch { return failure(request, reply, 503); }
  });
}
