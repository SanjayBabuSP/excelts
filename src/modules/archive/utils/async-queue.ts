export type AsyncQueue<T> = {
  push: (value: T) => void;
  fail: (err: Error) => void;
  close: () => void;
  iterable: AsyncIterable<T>;
};

export function createAsyncQueue<T>(options: { onCancel?: () => void } = {}): AsyncQueue<T> {
  const values: Array<T | undefined> = [];
  let valuesHead = 0;

  const waiters: Array<
    | {
        resolve: (r: IteratorResult<T>) => void;
        reject: (err: Error) => void;
      }
    | undefined
  > = [];
  let waitersHead = 0;
  let done = false;
  let error: Error | null = null;
  let cancelled = false;

  const cancel = (): void => {
    if (cancelled) {
      return;
    }
    cancelled = true;

    // Mark as done and unblock all waiters before calling `onCancel()`.
    // This avoids races where `onCancel()` triggers an abort that calls `fail()`.
    done = true;
    while (true) {
      const waiter = shiftWaiter();
      if (!waiter) {
        break;
      }
      waiter.resolve({ value: undefined as any, done: true });
    }

    try {
      options.onCancel?.();
    } catch {
      // ignore
    }
  };

  const maybeCompact = (): void => {
    // Prevent unbounded growth of the underlying arrays.
    if (valuesHead > 1024 && valuesHead * 2 > values.length) {
      values.splice(0, valuesHead);
      valuesHead = 0;
    }
    if (waitersHead > 1024 && waitersHead * 2 > waiters.length) {
      waiters.splice(0, waitersHead);
      waitersHead = 0;
    }
  };

  const shiftWaiter = ():
    | {
        resolve: (r: IteratorResult<T>) => void;
        reject: (err: Error) => void;
      }
    | undefined => {
    while (waitersHead < waiters.length) {
      const w = waiters[waitersHead];
      waiters[waitersHead] = undefined;
      waitersHead++;
      if (w) {
        maybeCompact();
        return w;
      }
    }
    maybeCompact();
    return undefined;
  };

  const shiftValue = (): T | undefined => {
    while (valuesHead < values.length) {
      const v = values[valuesHead];
      values[valuesHead] = undefined;
      valuesHead++;
      if (v !== undefined) {
        maybeCompact();
        return v;
      }
    }
    maybeCompact();
    return undefined;
  };

  const push = (value: T): void => {
    if (done || error) {
      return;
    }
    const waiter = shiftWaiter();
    if (waiter) {
      waiter.resolve({ value, done: false });
    } else {
      values.push(value);
    }
  };

  const fail = (err: Error): void => {
    if (done || error) {
      return;
    }
    error = err;
    while (true) {
      const waiter = shiftWaiter();
      if (!waiter) {
        break;
      }
      waiter.reject(err);
    }
  };

  const close = (): void => {
    if (done || error) {
      return;
    }
    done = true;
    while (true) {
      const waiter = shiftWaiter();
      if (!waiter) {
        break;
      }
      waiter.resolve({ value: undefined as any, done: true });
    }
  };

  const iterable: AsyncIterable<T> = {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      return {
        next(): Promise<IteratorResult<T>> {
          if (error) {
            return Promise.reject(error);
          }
          const value = shiftValue();
          if (value !== undefined) {
            return Promise.resolve({ value, done: false });
          }
          if (done) {
            return Promise.resolve({ value: undefined as any, done: true });
          }
          return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
        },
        return(): Promise<IteratorResult<T>> {
          cancel();
          return Promise.resolve({ value: undefined as any, done: true });
        },
        throw(err?: unknown): Promise<IteratorResult<T>> {
          cancel();
          return Promise.reject(err);
        }
      };
    }
  };

  return { push, fail, close, iterable };
}
