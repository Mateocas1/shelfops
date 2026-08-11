import type { FastifyReply } from "fastify";

const attributes = (maxAge: number, httpOnly: boolean) =>
  `Max-Age=${maxAge}; Path=/; ${httpOnly ? "HttpOnly; " : ""}Secure; SameSite=Lax`;

export function issueOidcCookies(reply: FastifyReply, sessionId: string, csrfToken: string, maxAge: number): void {
  reply.header("set-cookie", [
    `shelfops_session=${sessionId}; ${attributes(maxAge, true)}`,
    `shelfops_csrf=${csrfToken}; ${attributes(maxAge, false)}`
  ]);
}

export function expireOidcCookies(reply: FastifyReply): void {
  reply.header("set-cookie", [
    `shelfops_session=; ${attributes(0, true)}`,
    `shelfops_csrf=; ${attributes(0, false)}`
  ]);
}
