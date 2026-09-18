/**
 * Exponential backoff with jitter for stream reconnects.
 */

const BASE_MS = 1000;
const CAP_MS = 30_000;

export interface BackoffOptions {
  /** Injectable for deterministic tests. Defaults to Math.random. */
  random?: () => number;
  baseMs?: number;
  capMs?: number;
}

/**
 * Delay before reconnect attempt `attempt` (1-based). Full jitter: a random
 * value in `[0, min(cap, base * 2^(attempt-1))]`.
 */
export function nextDelay(attempt: number, opts: BackoffOptions = {}): number {
  const base = opts.baseMs ?? BASE_MS;
  const cap = opts.capMs ?? CAP_MS;
  const random = opts.random ?? Math.random;
  const n = Math.max(1, Math.floor(attempt));
  const exp = Math.min(cap, base * Math.pow(2, n - 1));
  return Math.floor(random() * exp);
}

/**
 * Resolves after `ms` milliseconds, or rejects immediately if `signal` is
 * already aborted / becomes aborted before then. Cleans up its timer and
 * listener either way.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
