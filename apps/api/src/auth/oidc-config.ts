const variableNames = [
  "SHELFOPS_OIDC_ISSUER",
  "SHELFOPS_OIDC_CLIENT_ID",
  "SHELFOPS_OIDC_CLIENT_SECRET",
  "SHELFOPS_OIDC_CALLBACK_URL",
  "SHELFOPS_OIDC_DESTINATION_URL",
  "SHELFOPS_OIDC_ORGANIZATION_ID",
  "SHELFOPS_OIDC_SESSION_TTL_SECONDS",
  "SHELFOPS_OIDC_PROVIDER_TIMEOUT_SECONDS"
] as const;

export interface OidcConfig {
  issuer: URL;
  clientId: string;
  clientSecret: string;
  callbackUrl: URL;
  destinationUrl: URL;
  organizationId: string;
  sessionTtlSeconds: number;
  providerTimeoutSeconds: number;
  allowInsecureRequests: boolean;
}

export interface OidcConfigOptions {
  allowLoopbackHttp?: boolean;
}

function fixedUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a fixed absolute URL`);
  }
  if (url.username || url.password || url.search || url.hash) throw new Error(`${label} must be a fixed absolute URL`);
  return url;
}

function isLoopback(url: URL): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

function boundedInteger(value: string, minimum: number, maximum: number, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${label} is out of range`);
  return parsed;
}

export function readOidcConfig(environment: Readonly<Record<string, string | undefined>>, options: OidcConfigOptions = {}): OidcConfig | undefined {
  const values = variableNames.map((name) => environment[name]?.trim() ?? "");
  if (values.every((value) => value === "")) return undefined;
  if (values.some((value) => value === "")) throw new Error("OIDC configuration must be complete");

  const [issuerValue, clientId, clientSecret, callbackValue, destinationValue, organizationId, ttlValue, timeoutValue] = values as [string, string, string, string, string, string, string, string];
  const issuer = fixedUrl(issuerValue, "OIDC issuer");
  const callbackUrl = fixedUrl(callbackValue, "OIDC callback URL");
  const destinationUrl = fixedUrl(destinationValue, "OIDC destination URL");
  if (callbackUrl.pathname !== "/auth/callback") throw new Error("OIDC callback URL must use /auth/callback");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId)) throw new Error("OIDC organization must be a UUID");

  const urls = [issuer, callbackUrl, destinationUrl];
  const insecure = urls.some((url) => url.protocol !== "https:");
  if (insecure && (!options.allowLoopbackHttp || urls.some((url) => url.protocol !== "http:" || !isLoopback(url)))) {
    throw new Error("OIDC URLs must use HTTPS");
  }

  return {
    issuer,
    clientId,
    clientSecret,
    callbackUrl,
    destinationUrl,
    organizationId,
    sessionTtlSeconds: boundedInteger(ttlValue, 60, 2_592_000, "OIDC session TTL"),
    providerTimeoutSeconds: boundedInteger(timeoutValue, 1, 30, "OIDC provider timeout"),
    allowInsecureRequests: insecure
  };
}
