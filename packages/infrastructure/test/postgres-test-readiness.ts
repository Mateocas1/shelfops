import { Client } from "pg";

const transientCodes = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "57P03"]);

export const connectReadyPostgres = async (
  connectionString: string,
  { deadlineMs = 5_000, backoffMs = 100 }: { deadlineMs?: number; backoffMs?: number } = {},
): Promise<Client> => {
  const startedAt = Date.now();
  const deadline = startedAt + deadlineMs;
  const endpoint = new URL(connectionString);
  let attempts = 0;
  let lastError: unknown;

  while (Date.now() < deadline) {
    attempts += 1;
    const client = new Client({ connectionString });
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
      const code = error instanceof Error && "code" in error ? String(error.code) : "unknown";
      if (!transientCodes.has(code)) throw error;
      const remainingMs = deadline - Date.now();
      if (remainingMs > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(backoffMs, remainingMs)));
    }
  }

  const code = lastError instanceof Error && "code" in lastError ? String(lastError.code) : "unknown";
  const message = lastError instanceof Error ? lastError.message.replace(connectionString, "[connection string redacted]") : String(lastError);
  throw new Error(`PostgreSQL at ${endpoint.hostname}:${endpoint.port} was not ready after ${attempts} attempts/${Date.now() - startedAt}ms; last error ${code}: ${message}`);
};
