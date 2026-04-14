export interface Limiter {
  run<T>(fn: () => Promise<T>): Promise<T>;
  readonly inFlight: () => number;
  readonly queued: () => number;
}

/**
 * Simple FIFO semaphore. No deps.
 */
export function createLimiter(concurrency: number): Limiter {
  let active = 0;
  const queue: (() => void)[] = [];

  const tryNext = () => {
    if (active >= concurrency) return;
    const next = queue.shift();
    if (next) next();
  };

  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const exec = async () => {
          active++;
          try {
            resolve(await fn());
          } catch (e) {
            reject(e as Error);
          } finally {
            active--;
            tryNext();
          }
        };
        if (active < concurrency) {
          exec();
        } else {
          queue.push(exec);
        }
      });
    },
    inFlight: () => active,
    queued: () => queue.length,
  };
}
