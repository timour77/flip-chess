import { LichessError } from '../types';
import type {
  BoardStreamEvent,
  EventStreamEvent,
  GameFullEvent,
  LichessAccount,
  LichessApi,
  OngoingGame,
  SeekParams,
  StreamCallbacks,
  StreamHandle,
  Uci,
} from '../types';
import { LichessHttp } from './http';
import type { FetchFn } from './http';
import { parseNdjson } from './ndjson';
import { nextDelay, sleep } from './backoff';

export interface LichessHttpClientOptions {
  baseUrl?: string;
  fetch?: FetchFn;
}

const DEFAULT_BASE_URL = 'https://lichess.org';

/** `LichessApi` implementation backed by the real (or injected) `fetch`. */
export class LichessHttpClient implements LichessApi {
  private readonly http: LichessHttp;

  constructor(token: string, opts: LichessHttpClientOptions = {}) {
    const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    const fetchImpl = opts.fetch ?? fetch.bind(globalThis);
    this.http = new LichessHttp(token, baseUrl, fetchImpl);
  }

  async getAccount(): Promise<LichessAccount> {
    return this.http.fetchJson<LichessAccount>('/api/account');
  }

  async getOngoingGames(): Promise<OngoingGame[]> {
    const res = await this.http.fetchJson<{ nowPlaying: OngoingGame[] }>('/api/account/playing');
    return res.nowPlaying;
  }

  async fetchGameSnapshot(gameId: string): Promise<GameFullEvent> {
    const response = await this.http.fetchStream(`/api/board/game/stream/${gameId}`);
    const body = response.body;
    if (!body) {
      throw new LichessError('network', 'Empty response body for game stream.', 0);
    }
    try {
      for await (const event of parseNdjson<GameFullEvent | BoardStreamEvent>(body)) {
        if (event.type === 'gameFull') {
          return event;
        }
      }
    } finally {
      try {
        await body.cancel();
      } catch {
        // ignore — stream may already be closed
      }
    }
    throw new LichessError('network', 'Game stream ended before a gameFull event.', 0);
  }

  streamEvents(callbacks: StreamCallbacks<EventStreamEvent>): StreamHandle {
    return this.startStream<EventStreamEvent>('/api/stream/event', callbacks);
  }

  streamGame(gameId: string, callbacks: StreamCallbacks<BoardStreamEvent>): StreamHandle {
    return this.startStream<BoardStreamEvent>(`/api/board/game/stream/${gameId}`, callbacks);
  }

  async move(gameId: string, uci: Uci): Promise<void> {
    await this.http.fetchVoid(`/api/board/game/${gameId}/move/${uci}`, { method: 'POST' });
  }

  async resign(gameId: string): Promise<void> {
    await this.http.fetchVoid(`/api/board/game/${gameId}/resign`, { method: 'POST' });
  }

  async draw(gameId: string, accept: boolean): Promise<void> {
    await this.http.fetchVoid(`/api/board/game/${gameId}/draw/${accept ? 'yes' : 'no'}`, { method: 'POST' });
  }

  async abort(gameId: string): Promise<void> {
    await this.http.fetchVoid(`/api/board/game/${gameId}/abort`, { method: 'POST' });
  }

  async seek(params: SeekParams, signal: AbortSignal): Promise<void> {
    const body = new URLSearchParams();
    body.set('time', String(params.time));
    body.set('increment', String(params.increment));
    body.set('rated', String(params.rated));
    if (params.ratingRange) {
      body.set('ratingRange', params.ratingRange);
    }

    let response: Response;
    try {
      response = await this.http.fetchStream('/api/board/seek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal,
      });
    } catch (err) {
      if (signal.aborted) {
        return;
      }
      throw err;
    }

    const streamBody = response.body;
    if (!streamBody) {
      return;
    }

    const reader = streamBody.getReader();
    const onAbort = () => {
      void reader.cancel().catch(() => undefined);
    };
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    try {
      for (;;) {
        const { done } = await reader.read();
        if (done) {
          break;
        }
      }
    } catch (err) {
      if (!signal.aborted) {
        throw err;
      }
    } finally {
      signal.removeEventListener('abort', onAbort);
      try {
        reader.releaseLock();
      } catch {
        // ignore
      }
    }
  }

  /**
   * Drives a long-lived ND-JSON GET stream with auto-reconnect: on any
   * disconnect (error or clean end-of-stream), reports it via `onError`,
   * backs off, reports the scheduled reconnect via `onReconnect`, then
   * retries. A 401 is terminal and is not retried.
   */
  private startStream<T>(path: string, callbacks: StreamCallbacks<T>): StreamHandle {
    let closed = false;
    let attempt = 0;
    let controller: AbortController | null = null;
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const close = () => {
      if (closed) {
        return;
      }
      closed = true;
      controller?.abort();
    };

    const run = async () => {
      while (!closed) {
        controller = new AbortController();
        try {
          const response = await this.http.fetchStream(path, { signal: controller.signal });
          const body = response.body;
          if (!body) {
            throw new LichessError('network', 'Empty stream body.', 0);
          }
          callbacks.onOpen?.();

          for await (const event of parseNdjson<T>(body, controller.signal)) {
            if (closed) {
              break;
            }
            // The connection stayed up long enough to deliver real data, so
            // the next disconnect starts backing off from attempt 1 again.
            attempt = 0;
            callbacks.onEvent(event);
          }

          if (closed) {
            break;
          }
          // A clean end-of-stream from Lichess is still a disconnect.
          throw new Error('Lichess stream ended');
        } catch (err) {
          if (closed) {
            break;
          }
          if (err instanceof LichessError && err.kind === 'unauthorized') {
            callbacks.onError?.(err);
            close();
            break;
          }
          callbacks.onError?.(err);
        }

        if (closed) {
          break;
        }
        attempt += 1;
        const delayMs = nextDelay(attempt);
        callbacks.onReconnect?.(attempt, delayMs);
        try {
          await sleep(delayMs, controller.signal);
        } catch {
          // aborted while waiting to reconnect
        }
      }
      resolveDone();
    };

    void run();

    return { close, done };
  }
}
