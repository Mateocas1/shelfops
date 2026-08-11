import { describe, expect, it, vi } from "vitest";

import { readOidcConfig } from "../src/auth/oidc-config.js";
import { createOidcProtocol, type OidcClientLibrary } from "../src/auth/oidc-client.js";

const completeEnvironment = {
  SHELFOPS_OIDC_ISSUER: "https://issuer.example.com",
  SHELFOPS_OIDC_CLIENT_ID: "shelfops",
  SHELFOPS_OIDC_CLIENT_SECRET: "secret",
  SHELFOPS_OIDC_CALLBACK_URL: "https://shelfops.example.com/auth/callback",
  SHELFOPS_OIDC_DESTINATION_URL: "https://shelfops.example.com/incidents",
  SHELFOPS_OIDC_ORGANIZATION_ID: "123e4567-e89b-42d3-a456-426614174000",
  SHELFOPS_OIDC_SESSION_TTL_SECONDS: "3600",
  SHELFOPS_OIDC_PROVIDER_TIMEOUT_SECONDS: "5"
} as const;

describe("OIDC configuration", () => {
  it("disables OIDC only when every setting is absent", () => {
    expect(readOidcConfig({})).toBeUndefined();
    expect(() => readOidcConfig({ SHELFOPS_OIDC_CLIENT_ID: "partial" })).toThrow("OIDC configuration must be complete");
  });

  it("accepts a complete HTTPS configuration", () => {
    expect(readOidcConfig(completeEnvironment)).toMatchObject({
      clientId: "shelfops",
      organizationId: completeEnvironment.SHELFOPS_OIDC_ORGANIZATION_ID,
      sessionTtlSeconds: 3600,
      providerTimeoutSeconds: 5,
      allowInsecureRequests: false
    });
  });

  it("rejects unsafe URLs and accepts explicitly injected loopback HTTP", () => {
    expect(() => readOidcConfig({ ...completeEnvironment, SHELFOPS_OIDC_ISSUER: "http://issuer.example.com" })).toThrow("HTTPS");
    expect(() => readOidcConfig({ ...completeEnvironment, SHELFOPS_OIDC_CALLBACK_URL: "https://shelfops.example.com/other" })).toThrow("/auth/callback");
    expect(() => readOidcConfig({ ...completeEnvironment, SHELFOPS_OIDC_DESTINATION_URL: "https://user@shelfops.example.com/incidents?next=/admin" })).toThrow("fixed absolute URL");

    const loopback = Object.fromEntries(Object.entries(completeEnvironment).map(([key, value]) => [key, value.replaceAll("https://shelfops.example.com", "http://127.0.0.1:3000").replace("https://issuer.example.com", "http://localhost:9000")])) as Record<string, string>;
    expect(readOidcConfig(loopback, { allowLoopbackHttp: true })?.allowInsecureRequests).toBe(true);
  });

  it.each([
    ["SHELFOPS_OIDC_SESSION_TTL_SECONDS", "59"],
    ["SHELFOPS_OIDC_SESSION_TTL_SECONDS", "2592001"],
    ["SHELFOPS_OIDC_PROVIDER_TIMEOUT_SECONDS", "0"],
    ["SHELFOPS_OIDC_PROVIDER_TIMEOUT_SECONDS", "31"]
  ])("rejects out-of-range %s", (key, value) => {
    expect(() => readOidcConfig({ ...completeEnvironment, [key]: value })).toThrow("out of range");
  });

  it.each([
    ["60", "1"],
    ["2592000", "30"]
  ])("accepts TTL %s and timeout %s at inclusive boundaries", (ttl, timeout) => {
    expect(readOidcConfig({
      ...completeEnvironment,
      SHELFOPS_OIDC_SESSION_TTL_SECONDS: ttl,
      SHELFOPS_OIDC_PROVIDER_TIMEOUT_SECONDS: timeout
    })).toMatchObject({ sessionTtlSeconds: Number(ttl), providerTimeoutSeconds: Number(timeout) });
  });
});

describe("OIDC protocol client", () => {
  it("does not retry failed discovery", async () => {
    const discovery = vi.fn().mockRejectedValue(new Error("provider unavailable"));
    await expect(createOidcProtocol(readOidcConfig(completeEnvironment)!, {
      library: { discovery } as unknown as OidcClientLibrary
    })).rejects.toThrow("provider unavailable");
    expect(discovery).toHaveBeenCalledTimes(1);
  });

  it("discovers once with a bounded timeout and creates fresh S256 requests", async () => {
    const discover = vi.fn().mockResolvedValue({ metadata: () => ({ issuer: completeEnvironment.SHELFOPS_OIDC_ISSUER }) });
    const library = {
      discovery: discover,
      randomState: vi.fn().mockReturnValueOnce("state-1").mockReturnValueOnce("state-2"),
      randomNonce: vi.fn().mockReturnValueOnce("nonce-1").mockReturnValueOnce("nonce-2"),
      randomPKCECodeVerifier: vi.fn().mockReturnValueOnce("verifier-1").mockReturnValueOnce("verifier-2"),
      calculatePKCECodeChallenge: vi.fn(async (verifier: string) => `challenge:${verifier}`),
      buildAuthorizationUrl: vi.fn((_configuration, parameters) => new URL(`https://issuer.example.com/authorize?${new URLSearchParams(parameters)}`)),
      authorizationCodeGrant: vi.fn()
    } as unknown as OidcClientLibrary;

    const protocol = await createOidcProtocol(readOidcConfig(completeEnvironment)!, { library });
    const first = await protocol.begin();
    const second = await protocol.begin();

    expect(discover).toHaveBeenCalledTimes(1);
    expect(discover.mock.calls[0]?.[4]).toMatchObject({ timeout: 5 });
    expect(first).toMatchObject({ state: "state-1", nonce: "nonce-1", verifier: "verifier-1" });
    expect(first.authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(second.state).toBe("state-2");
  });

  it("returns only issuer and subject from a checked ID token and closes once", async () => {
    const close = vi.fn();
    const library = {
      discovery: vi.fn().mockResolvedValue({ metadata: () => ({ issuer: completeEnvironment.SHELFOPS_OIDC_ISSUER }) }),
      authorizationCodeGrant: vi.fn().mockResolvedValue({ claims: () => ({ sub: "user-42", role: "admin" }), access_token: "discard-me" })
    } as unknown as OidcClientLibrary;
    const protocol = await createOidcProtocol(readOidcConfig(completeEnvironment)!, { library, close });

    await expect(protocol.exchange(new URL("https://shelfops.example.com/auth/callback?code=one&state=state"), {
      state: "state", nonce: "nonce", verifier: "verifier"
    })).resolves.toEqual({ issuer: completeEnvironment.SHELFOPS_OIDC_ISSUER, subject: "user-42" });
    expect(library.authorizationCodeGrant).toHaveBeenCalledWith(expect.anything(), expect.any(URL), expect.objectContaining({
      expectedState: "state", expectedNonce: "nonce", pkceCodeVerifier: "verifier", idTokenExpected: true
    }));

    await protocol.close();
    await protocol.close();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
