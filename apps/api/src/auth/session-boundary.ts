import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import { resolveSession } from "@shelfops/application/identity/session";
import type { IdentityProvider, IdentitySession } from "@shelfops/application/ports/identity-provider";

export interface SessionBoundaryOptions {
  identityProvider?: IdentityProvider;
}

declare module "fastify" {
  interface FastifyRequest {
    principal?: AuthorizedPrincipal;
  }
}

const SESSION_COOKIE = "shelfops_session";
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function sendAuthenticationRequired(request: FastifyRequest, reply: FastifyReply): void {
  reply.header("x-correlation-id", request.id).code(401).send({
    code: "authentication-required",
    message: "Authentication is required",
    correlationId: request.id
  });
}

function sendForbidden(request: FastifyRequest, reply: FastifyReply): void {
  reply.header("x-correlation-id", request.id).code(403).send({
    code: "forbidden",
    message: "CSRF validation failed",
    correlationId: request.id
  });
}

function cookieValue(cookie: string | undefined, name: string): string | undefined {
  return cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function currentSession(request: FastifyRequest, provider: IdentityProvider | undefined): Promise<IdentitySession | undefined> {
  const sessionId = cookieValue(request.headers.cookie, SESSION_COOKIE);
  if (!provider || !sessionId || !SESSION_ID_PATTERN.test(sessionId)) return undefined;

  return resolveSession(provider, sessionId, Date.now());
}

export function createMutationGuard(provider: IdentityProvider | undefined) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const session = await currentSession(request, provider);
    if (!session) return sendAuthenticationRequired(request, reply);
    const csrfToken = request.headers["x-csrf-token"];
    if (typeof csrfToken !== "string" || !session.matchesCsrfToken(csrfToken)) return sendForbidden(request, reply);
    request.principal = session.principal;
  };
}

export function createReadGuard(provider: IdentityProvider | undefined) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await currentSession(request, provider);
    if (!session) {
      sendAuthenticationRequired(request, reply);
      return reply;
    }
    request.principal = session.principal;
  };
}

export async function registerSessionBoundary(app: FastifyInstance, options: SessionBoundaryOptions = {}): Promise<void> {
  const mutationGuard = createMutationGuard(options.identityProvider);
  app.addHook("onRequest", async (request, reply) => {
    if (request.method === "GET" || !request.url.startsWith("/api/v1/me/")) return;
    return mutationGuard(request, reply);
  });

  app.get("/api/v1/me", async (request, reply) => {
    const session = await currentSession(request, options.identityProvider);
    if (!session) return sendAuthenticationRequired(request, reply);

    reply.header("x-correlation-id", request.id);
    return session.principal;
  });
}
