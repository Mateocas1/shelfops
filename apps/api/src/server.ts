import { startApi } from "./startup.js";
import { bindShutdownSignals, createLifecycle, shutdownWithin } from "./lifecycle.js";

try {
  const lifecycle = createLifecycle();
  const app = await startApi({ lifecycle });
  bindShutdownSignals(process, () => shutdownWithin(lifecycle.beginDrain, () => app.close(), 10_000), () => process.exit(1));
} catch (error: unknown) {
  process.exitCode = 1;
}
