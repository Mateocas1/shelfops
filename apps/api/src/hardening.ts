import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";

import type { CorsSettings, RateLimitSettings } from "./config.js";

const EXEMPT_RATE_LIMIT_PATHS = new Set(["/health", "/ready", "/metrics"]);

export async function registerRateLimit(app: FastifyInstance, settings: RateLimitSettings): Promise<void> {
  await app.register(rateLimit, {
    max: settings.max,
    timeWindow: settings.timeWindow,
    allowList: (request) => request.method === "OPTIONS" || EXEMPT_RATE_LIMIT_PATHS.has(request.url.split("?", 1)[0] ?? "")
  });
}

export async function registerCors(app: FastifyInstance, settings: CorsSettings): Promise<void> {
  const allowedOrigins = new Set(settings.allowedOrigins);
  await app.register(cors, {
    origin: allowedOrigins.size === 0 ? false : (origin, callback) => {
      if (!origin) { callback(null, true); return; }
      callback(null, allowedOrigins.has(origin));
    },
    credentials: allowedOrigins.size > 0,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
  });
}
