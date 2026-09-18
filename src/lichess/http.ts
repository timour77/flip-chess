import { LichessError } from '../types';

export type FetchFn = typeof fetch;

const DEFAULT_RATE_LIMIT_MS = 60_000;

/**
 * Thin HTTP layer shared by `LichessHttpClient`: auth headers, error
 * mapping to `LichessError`, and a per-instance rate-limit guard that
 * short-circuits requests while a 429's `Retry-After` window is active.
 */
export class LichessHttp {
  private blockedUntil = 0;

  constructor(
    private readonly token: string,
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchFn,
  ) {}

  private checkBlocked(): void {
    const now = Date.now();
    if (now < this.blockedUntil) {
      throw new LichessError(
        'rate-limited',
        'Rate limited by lichess.org; waiting before retrying.',
        429,
        this.blockedUntil - now,
      );
    }
  }

  private authHeaders(accept: string, extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: accept,
      ...extra,
    };
  }

  /** Issues a request and returns the raw `Response`, mapping transport failures to `network`. */
  private async rawFetch(path: string, init: RequestInit): Promise<Response> {
    this.checkBlocked();
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, init);
    } catch (err) {
      if (err instanceof LichessError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new LichessError('network', `Network error: ${message}`, 0);
    }
  }

  /** Maps a non-ok response to the matching `LichessError` and throws it. */
  async throwForStatus(response: Response): Promise<never> {
    const status = response.status;

    if (status === 401) {
      throw new LichessError('unauthorized', 'Lichess token missing, revoked or lacking scope.', 401);
    }

    if (status === 429) {
      const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'));
      this.blockedUntil = Date.now() + retryAfterMs;
      throw new LichessError('rate-limited', 'Rate limited by lichess.org.', 429, retryAfterMs);
    }

    let bodyMessage: string | undefined;
    try {
      const text = await response.text();
      if (text) {
        try {
          const parsed = JSON.parse(text) as { error?: string };
          bodyMessage = parsed.error;
        } catch {
          bodyMessage = text;
        }
      }
    } catch {
      // ignore body-read failures; fall back below
    }

    if (status >= 500) {
      throw new LichessError('network', bodyMessage ?? `Server error (${status})`, status);
    }

    throw new LichessError('rejected', bodyMessage ?? `Request rejected (${status})`, status);
  }

  /** GET/POST expecting a JSON body. */
  async fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.rawFetch(path, {
      ...init,
      headers: this.authHeaders('application/json', init.headers as Record<string, string> | undefined),
    });
    if (!response.ok) {
      return this.throwForStatus(response);
    }
    return (await response.json()) as T;
  }

  /** POST expecting no meaningful body back (move/resign/draw/abort). */
  async fetchVoid(path: string, init: RequestInit = {}): Promise<void> {
    const response = await this.rawFetch(path, {
      ...init,
      headers: this.authHeaders('application/json', init.headers as Record<string, string> | undefined),
    });
    if (!response.ok) {
      await this.throwForStatus(response);
    }
  }

  /** Opens a long-lived ND-JSON stream and returns the raw `Response`. */
  async fetchStream(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.rawFetch(path, {
      ...init,
      headers: this.authHeaders('application/x-ndjson', init.headers as Record<string, string> | undefined),
    });
    if (!response.ok) {
      return this.throwForStatus(response);
    }
    return response;
  }
}

function parseRetryAfter(header: string | null): number {
  if (!header) {
    return DEFAULT_RATE_LIMIT_MS;
  }
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return DEFAULT_RATE_LIMIT_MS;
  }
  return Math.round(seconds * 1000);
}
