import type { FastifyInstance } from "fastify";

export interface Readiness {
  isDraining(): boolean;
  probe(): Promise<void>;
}

const readinessSchema = {
  response: {
    200: { type: "object", additionalProperties: false, properties: { status: { const: "ready" } }, required: ["status"] },
    503: { type: "object", additionalProperties: false, properties: { status: { const: "unavailable" } }, required: ["status"] }
  }
} as const;

export async function registerHealthRoute(app: FastifyInstance, readiness: Readiness): Promise<void> {
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/ready", { schema: readinessSchema }, async (_request, reply) => {
    if (!readiness.isDraining()) {
      try { await readiness.probe(); return { status: "ready" as const }; } catch {}
    }
    return reply.code(503).send({ status: "unavailable" });
  });
}
