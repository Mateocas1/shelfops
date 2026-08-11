import { startApi } from "./startup.js";
import { bindShutdownSignals, createLifecycle, shutdownWithin } from "./lifecycle.js";
import { createApiLogger } from "./logging.js";

const bootstrapLogger = createApiLogger({ environment: process.env.NODE_ENV ?? "production", release: process.env.RELEASE ?? process.env.npm_package_version ?? "unknown" });
let startupDelegated = false;
try {
  const lifecycle = createLifecycle();
  const logger = createApiLogger({ environment: process.env.NODE_ENV ?? "production", release: process.env.RELEASE ?? process.env.npm_package_version ?? "unknown", level: process.env.LOG_LEVEL });
  startupDelegated = true;
  const app = await startApi({ lifecycle, logger });
  bindShutdownSignals(process, () => shutdownWithin(lifecycle.beginDrain, () => app.close(), 10_000, logger), () => process.exit(1));
} catch (error: unknown) {
  if (!startupDelegated) bootstrapLogger.error("startup.failed", error);
  process.exitCode = 1;
}
