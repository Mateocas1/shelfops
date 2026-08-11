export interface Lifecycle {
  isDraining(): boolean;
  beginDrain(): void;
}

interface SignalSource {
  once(signal: "SIGTERM" | "SIGINT", listener: () => void): unknown;
  removeListener(signal: "SIGTERM" | "SIGINT", listener: () => void): unknown;
}

export function createLifecycle(): Lifecycle {
  let draining = false;
  return { isDraining: () => draining, beginDrain: () => { draining = true; } };
}

export async function shutdownWithin(beginDrain: () => void, close: () => Promise<void>, timeoutMs: number, logger?: ApiLogger): Promise<boolean> {
  beginDrain();
  logger?.info("shutdown.begin");
  let timer: NodeJS.Timeout | undefined;
  try {
    const result = await Promise.race([
      close().then(() => "completed" as const, () => "failed" as const),
      new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), timeoutMs); })
    ]);
    if (result === "completed") logger?.info("shutdown.completed");
    else logger?.error(result === "timeout" ? "shutdown.timeout" : "shutdown.failed", new Error(result));
    return result === "completed";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function bindShutdownSignals(signals: SignalSource, shutdown: () => Promise<boolean>, forcedFailure: () => void): void {
  let stopping: Promise<boolean> | undefined;
  const stop = () => {
    signals.removeListener("SIGTERM", stop);
    signals.removeListener("SIGINT", stop);
    stopping ??= shutdown();
    void stopping.then((clean) => { if (!clean) forcedFailure(); });
  };
  signals.once("SIGTERM", stop);
  signals.once("SIGINT", stop);
}
import type { ApiLogger } from "./logging.js";
