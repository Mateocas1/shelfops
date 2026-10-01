import { describe, expect, it } from "vitest";

import { DEFAULT_CORS, DEFAULT_RATE_LIMIT, parseCorsSettings, parseRateLimitSettings, parseTrustProxy } from "../../../apps/api/src/config.js";

describe("runtime configuration", () => {
  it("defaults trustProxy to the environment and accepts explicit booleans", () => {
    expect(parseTrustProxy(undefined, true)).toBe(true);
    expect(parseTrustProxy("", false)).toBe(false);
    expect(parseTrustProxy("TRUE", false)).toBe(true);
    expect(parseTrustProxy("0", true)).toBe(false);
    expect(() => parseTrustProxy("maybe", true)).toThrow("TRUST_PROXY must be a boolean");
  });

  it("applies rate limit defaults and validates overrides", () => {
    expect(parseRateLimitSettings({})).toEqual(DEFAULT_RATE_LIMIT);
    expect(parseRateLimitSettings({ RATE_LIMIT_MAX: "5", RATE_LIMIT_WINDOW_MS: "1000" })).toEqual({ max: 5, timeWindow: 1_000 });
    expect(() => parseRateLimitSettings({ RATE_LIMIT_MAX: "0" })).toThrow("RATE_LIMIT_MAX must be a positive integer");
    expect(() => parseRateLimitSettings({ RATE_LIMIT_WINDOW_MS: "later" })).toThrow("RATE_LIMIT_WINDOW_MS must be a positive integer");
  });

  it("defaults CORS to deny and parses exact origins", () => {
    expect(parseCorsSettings({})).toEqual(DEFAULT_CORS);
    expect(parseCorsSettings({ CORS_ALLOWED_ORIGINS: "https://app.example, http://localhost:5173" })).toEqual({ allowedOrigins: ["https://app.example", "http://localhost:5173"] });
    expect(() => parseCorsSettings({ CORS_ALLOWED_ORIGINS: "https://app.example/path" })).toThrow("exact scheme://host origins");
    expect(() => parseCorsSettings({ CORS_ALLOWED_ORIGINS: "not a url" })).toThrow("absolute origins");
  });
});
