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

export async function shutdownWithin(beginDrain: () => void, close: () => Promise<void>, timeoutMs: number): Promise<boolean> {
  beginDrain();
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      close().then(() => true, () => false),
      new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); })
    ]);
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
