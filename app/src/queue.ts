export type Queue<T> = {
  push(item: T): void;
  flush(): void;
  size(): number;
  destroy(): void;
};

export type QueueOptions<T> = {
  batchSize: number;
  flushInterval: number;
  send(batch: T[]): void;
  schedule?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  cancel?: (handle: ReturnType<typeof setTimeout>) => void;
  maxBuffer?: number;
};

/** Hold events until the batch is full or the interval elapses. */
export function createQueue<T>(options: QueueOptions<T>): Queue<T> {
  const buffer: T[] = [];
  const schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle));
  const maxBuffer = options.maxBuffer ?? 100;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer(): void {
    if (timer == null) return;
    cancel(timer);
    timer = null;
  }

  function trim(): void {
    if (buffer.length > maxBuffer) buffer.splice(0, buffer.length - maxBuffer);
  }

  function flush(): void {
    clearTimer();
    if (buffer.length === 0) return;
    const batch = buffer.splice(0, buffer.length);
    try {
      options.send(batch);
    } catch {
      buffer.unshift(...batch);
      trim();
    }
  }

  function arm(): void {
    if (timer != null || options.flushInterval < 0) return;
    timer = schedule(() => {
      timer = null;
      flush();
    }, options.flushInterval);
  }

  return {
    push(item) {
      buffer.push(item);
      trim();
      if (buffer.length >= options.batchSize) flush();
      else arm();
    },
    flush,
    size: () => buffer.length,
    destroy() {
      clearTimer();
      buffer.length = 0;
    },
  };
}
