const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

export interface RateLimitSettings {
  max: number;
  timeWindow: number;
}

export interface CorsSettings {
  allowedOrigins: readonly string[];
}

export const DEFAULT_RATE_LIMIT: RateLimitSettings = { max: 100, timeWindow: 60_000 };
export const DEFAULT_CORS: CorsSettings = { allowedOrigins: [] };

/**
 * `TRUST_PROXY` is `false` or the number of trusted proxy hops. Trusting every
 * hop (`trustProxy: true`) would let clients forge `X-Forwarded-For` and evade
 * IP rate limits, so `true` means one hop: the load balancer. Production
 * defaults to one hop.
 */
export function parseTrustProxy(value: string | undefined, isProduction: boolean): false | number {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized === "") return isProduction ? 1 : false;
  if (FALSE_VALUES.has(normalized)) return false;
  if (TRUE_VALUES.has(normalized)) return 1;
  if (/^\d+$/.test(normalized)) return Number(normalized);
  throw new Error("TRUST_PROXY must be false, true or a hop count");
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  const raw = value?.trim() ?? "";
  if (raw === "") return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) < 1) throw new Error(`${name} must be a positive integer`);
  return Number(raw);
}

export function parseRateLimitSettings(environment: Readonly<Record<string, string | undefined>>): RateLimitSettings {
  return {
    max: positiveInteger(environment.RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT.max, "RATE_LIMIT_MAX"),
    timeWindow: positiveInteger(environment.RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT.timeWindow, "RATE_LIMIT_WINDOW_MS")
  };
}

export function parseCorsSettings(environment: Readonly<Record<string, string | undefined>>): CorsSettings {
  const raw = environment.CORS_ALLOWED_ORIGINS?.trim() ?? "";
  if (raw === "") return DEFAULT_CORS;
  const allowedOrigins = raw.split(",").map((origin) => origin.trim()).filter((origin) => origin !== "");
  for (const origin of allowedOrigins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error("CORS_ALLOWED_ORIGINS must contain absolute origins");
    }
    if (url.origin !== origin || (url.protocol !== "https:" && url.protocol !== "http:")) throw new Error("CORS_ALLOWED_ORIGINS must contain exact scheme://host origins");
  }
  return { allowedOrigins };
}
