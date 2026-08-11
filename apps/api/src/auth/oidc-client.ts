import * as oidc from "openid-client";

import type { OidcConfig } from "./oidc-config.js";

export interface OidcClientLibrary {
  discovery: typeof oidc.discovery;
  randomState: typeof oidc.randomState;
  randomNonce: typeof oidc.randomNonce;
  randomPKCECodeVerifier: typeof oidc.randomPKCECodeVerifier;
  calculatePKCECodeChallenge: typeof oidc.calculatePKCECodeChallenge;
  buildAuthorizationUrl: typeof oidc.buildAuthorizationUrl;
  authorizationCodeGrant: typeof oidc.authorizationCodeGrant;
}

export interface OidcAttempt {
  authorizationUrl: URL;
  state: string;
  nonce: string;
  verifier: string;
}

export interface OidcExchangeChecks {
  state: string;
  nonce: string;
  verifier: string;
}

export interface OidcProtocol {
  begin(): Promise<OidcAttempt>;
  exchange(callbackUrl: URL, checks: OidcExchangeChecks): Promise<{ issuer: string; subject: string }>;
  close(): Promise<void>;
}

export interface OidcProtocolDependencies {
  library?: OidcClientLibrary;
  close?: () => void | Promise<void>;
}

export async function createOidcProtocol(config: OidcConfig, dependencies: OidcProtocolDependencies = {}): Promise<OidcProtocol> {
  const library = dependencies.library ?? oidc;
  const configuration = await library.discovery(
    config.issuer,
    config.clientId,
    { redirect_uris: [config.callbackUrl.href], response_types: ["code"] },
    oidc.ClientSecretBasic(config.clientSecret),
    {
      timeout: config.providerTimeoutSeconds,
      ...(config.allowInsecureRequests ? { execute: [oidc.allowInsecureRequests] } : {})
    }
  );
  let closed = false;

  return {
    async begin() {
      const state = library.randomState();
      const nonce = library.randomNonce();
      const verifier = library.randomPKCECodeVerifier();
      const codeChallenge = await library.calculatePKCECodeChallenge(verifier);
      const authorizationUrl = library.buildAuthorizationUrl(configuration, {
        redirect_uri: config.callbackUrl.href,
        scope: "openid",
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256"
      });
      return { authorizationUrl, state, nonce, verifier };
    },
    async exchange(callbackUrl, checks) {
      const tokens = await library.authorizationCodeGrant(configuration, callbackUrl, {
        expectedState: checks.state,
        expectedNonce: checks.nonce,
        pkceCodeVerifier: checks.verifier,
        idTokenExpected: true
      });
      const subject = tokens.claims()?.sub;
      if (!subject) throw new Error("OIDC ID token subject is missing");
      return { issuer: config.issuer.href.replace(/\/$/, ""), subject };
    },
    async close() {
      if (closed) return;
      closed = true;
      await dependencies.close?.();
    }
  };
}
