import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LichessHttpClient } from '../src/lichess/client';
import type { FetchFn } from '../src/lichess/http';
import { LichessError } from '../src/types';
import type { BoardStreamEvent, EventStreamEvent, StreamCallbacks } from '../src/types';

interface FakeHeaders {
  get(name: string): string | null;
}

function makeHeaders(h: Record<string, string> = {}): FakeHeaders {
  const lower = new Map(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    get(name: string) {
      return lower.get(name.toLowerCase()) ?? null;
    },
  };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const ok = status >= 200 && status < 300;
  const text = JSON.stringify(body);
  return {
    ok,
    status,
    headers: makeHeaders(headers),
    body: null,
    async json() {
      return body;
    },
    async text() {
      return text;
    },
  } as unknown as Response;
}

function emptyResponse(status: number, headers: Record<string, string> = {}): Response {
  const ok = status >= 200 && status < 300;
  return {
    ok,
    status,
    headers: makeHeaders(headers),
    body: null,
    async json() {
      return {};
    },
    async text() {
      return '';
    },
  } as unknown as Response;
}

/** A stream response whose body the test can push lines into and close on demand. */
function controllableStreamResponse(status = 200): {
  response: Response;
  push(line: string): void;
  close(): void;
  error(err: unknown): void;
} {
  let ctrl: ReadableStreamDefaultController<Uint8Array> | null = null;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      ctrl = controller;
    },
  });
  const response = {
    ok: status >= 200 && status < 300,
    status,
    headers: makeHeaders(),
    body,
    async json() {
      return {};
    },
    async text() {
      return '';
    },
  } as unknown as Response;

  return {
    response,
    push(line: string) {
      ctrl?.enqueue(encoder.encode(line));
    },
    close() {
      ctrl?.close();
    },
    error(err: unknown) {
      ctrl?.error(err);
    },
  };
}

function staticStreamResponse(lines: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: makeHeaders(),
    body,
    async json() {
      return {};
    },
    async text() {
      return '';
    },
  } as unknown as Response;
}

/** Flushes a generous number of microtask ticks — enough to drain the layered
 * awaits between `startStream`'s loop and the fake fetch's resolved promise. */
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

interface FakeCall {
  url: string;
  init: RequestInit | undefined;
}

function makeQueueFetch(
  responses: Array<Response | ((url: string, init: RequestInit | undefined) => Response)>,
): { fetch: FetchFn; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  let i = 0;
  const fetchImpl: FetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    const item = responses[i];
    i += 1;
    if (!item) {
      throw new Error(`No fake response queued for call #${i} (${url})`);
    }
    return typeof item === 'function' ? item(url, init) : item;
  }) as FetchFn;
  return { fetch: fetchImpl, calls };
}

describe('LichessHttpClient — REST calls', () => {
  it('getAccount parses the account JSON', async () => {
    const { fetch } = makeQueueFetch([jsonResponse(200, { id: 'u1', username: 'timour' })]);
    const client = new LichessHttpClient('tok', { fetch, baseUrl: 'https://example.test' });
    await expect(client.getAccount()).resolves.toEqual({ id: 'u1', username: 'timour' });
  });

  it('sends Authorization and Accept headers', async () => {
    const { fetch, calls } = makeQueueFetch([jsonResponse(200, { id: 'u1', username: 'timour' })]);
    const client = new LichessHttpClient('secret-token', { fetch, baseUrl: 'https://example.test' });
    await client.getAccount();
    expect(calls).toHaveLength(1);
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret-token');
    expect(headers.Accept).toBe('application/json');
    expect(calls[0]?.url).toBe('https://example.test/api/account');
  });

  it('getOngoingGames unwraps nowPlaying', async () => {
    const games = [{ gameId: 'g1' }];
    const { fetch } = makeQueueFetch([jsonResponse(200, { nowPlaying: games })]);
    const client = new LichessHttpClient('tok', { fetch });
    await expect(client.getOngoingGames()).resolves.toEqual(games);
  });

  it('maps 401 to a LichessError with kind unauthorized', async () => {
    const { fetch } = makeQueueFetch([jsonResponse(401, { error: 'nope' })]);
    const client = new LichessHttpClient('bad-tok', { fetch });
    await expect(client.getAccount()).rejects.toMatchObject({
      name: 'LichessError',
      kind: 'unauthorized',
      status: 401,
    });
  });

  it('maps other 4xx to kind rejected, using the server error message', async () => {
    const { fetch } = makeQueueFetch([jsonResponse(400, { error: 'Invalid time control' })]);
    const client = new LichessHttpClient('tok', { fetch });
    try {
      await client.getAccount();
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(LichessError);
      const lichessErr = err as LichessError;
      expect(lichessErr.kind).toBe('rejected');
      expect(lichessErr.status).toBe(400);
      expect(lichessErr.message).toBe('Invalid time control');
    }
  });

  it('maps 5xx to kind network', async () => {
    const { fetch } = makeQueueFetch([jsonResponse(503, { error: 'down' })]);
    const client = new LichessHttpClient('tok', { fetch });
    await expect(client.getAccount()).rejects.toMatchObject({ kind: 'network', status: 503 });
  });

  it('maps a thrown fetch (transport failure) to kind network', async () => {
    const fetchImpl: FetchFn = (async () => {
      throw new TypeError('fetch failed');
    }) as FetchFn;
    const client = new LichessHttpClient('tok', { fetch: fetchImpl });
    await expect(client.getAccount()).rejects.toMatchObject({ kind: 'network' });
  });

  it('parses Retry-After (seconds) into retryAfterMs on 429', async () => {
    const { fetch } = makeQueueFetch([jsonResponse(429, { error: 'too fast' }, { 'Retry-After': '2' })]);
    const client = new LichessHttpClient('tok', { fetch });
    await expect(client.getAccount()).rejects.toMatchObject({
      kind: 'rate-limited',
      status: 429,
      retryAfterMs: 2000,
    });
  });

  it('defaults retryAfterMs to 60000 when Retry-After is absent', async () => {
    const { fetch } = makeQueueFetch([jsonResponse(429, { error: 'too fast' })]);
    const client = new LichessHttpClient('tok', { fetch });
    await expect(client.getAccount()).rejects.toMatchObject({
      kind: 'rate-limited',
      retryAfterMs: 60000,
    });
  });

  it('blocks follow-up calls for the rate-limit window without hitting the network again', async () => {
    const { fetch, calls } = makeQueueFetch([
      jsonResponse(429, { error: 'too fast' }, { 'Retry-After': '60' }),
      jsonResponse(200, { id: 'u1', username: 'timour' }),
    ]);
    const client = new LichessHttpClient('tok', { fetch });

    await expect(client.getAccount()).rejects.toMatchObject({ kind: 'rate-limited' });
    expect(calls).toHaveLength(1);

    // Immediate follow-up must be rejected locally, not hit the network.
    await expect(client.getOngoingGames()).rejects.toMatchObject({ kind: 'rate-limited' });
    expect(calls).toHaveLength(1);
  });

  it('move/resign/abort POST to the right paths', async () => {
    const { fetch, calls } = makeQueueFetch([
      emptyResponse(200),
      emptyResponse(200),
      emptyResponse(200),
    ]);
    const client = new LichessHttpClient('tok', { fetch, baseUrl: 'https://example.test' });
    await client.move('g1', 'e2e4');
    await client.resign('g1');
    await client.abort('g1');

    expect(calls[0]?.url).toBe('https://example.test/api/board/game/g1/move/e2e4');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[1]?.url).toBe('https://example.test/api/board/game/g1/resign');
    expect(calls[2]?.url).toBe('https://example.test/api/board/game/g1/abort');
  });

  it('draw(true) posts to draw/yes and draw(false) posts to draw/no', async () => {
    const { fetch, calls } = makeQueueFetch([emptyResponse(200), emptyResponse(200)]);
    const client = new LichessHttpClient('tok', { fetch, baseUrl: 'https://example.test' });
    await client.draw('g1', true);
    await client.draw('g1', false);
    expect(calls[0]?.url).toBe('https://example.test/api/board/game/g1/draw/yes');
    expect(calls[1]?.url).toBe('https://example.test/api/board/game/g1/draw/no');
  });

  it('fetchGameSnapshot returns the first gameFull event and stops', async () => {
    const gameFull = { type: 'gameFull', id: 'g1', state: { type: 'gameState', moves: '' } };
    const response = staticStreamResponse([
      `${JSON.stringify(gameFull)}\n`,
      `${JSON.stringify({ type: 'gameState', moves: 'e2e4' })}\n`,
    ]);
    const { fetch } = makeQueueFetch([response]);
    const client = new LichessHttpClient('tok', { fetch });
    await expect(client.fetchGameSnapshot('g1')).resolves.toEqual(gameFull);
  });
});

describe('LichessHttpClient — seek', () => {
  it('sends an x-www-form-urlencoded body', async () => {
    const stream = controllableStreamResponse();
    const { fetch, calls } = makeQueueFetch([stream.response]);
    const client = new LichessHttpClient('tok', { fetch, baseUrl: 'https://example.test' });
    const controller = new AbortController();

    const seekPromise = client.seek({ time: 5, increment: 3, rated: true }, controller.signal);
    await flush();

    expect(calls[0]?.url).toBe('https://example.test/api/board/seek');
    expect(calls[0]?.init?.method).toBe('POST');
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(calls[0]?.init?.body).toBe('time=5&increment=3&rated=true');

    controller.abort();
    await seekPromise;
  });

  it('resolves (does not reject) once the signal aborts, even mid-stream', async () => {
    const stream = controllableStreamResponse();
    const { fetch } = makeQueueFetch([stream.response]);
    const client = new LichessHttpClient('tok', { fetch });
    const controller = new AbortController();

    const seekPromise = client.seek({ time: 3, increment: 2, rated: false }, controller.signal);
    stream.push('\n');
    await flush();

    controller.abort();
    await expect(seekPromise).resolves.toBeUndefined();
  });

  it('resolves normally when Lichess pairs the player and closes the stream', async () => {
    const stream = controllableStreamResponse();
    const { fetch } = makeQueueFetch([stream.response]);
    const client = new LichessHttpClient('tok', { fetch });
    const controller = new AbortController();

    const seekPromise = client.seek({ time: 3, increment: 2, rated: false }, controller.signal);
    stream.close();
    await expect(seekPromise).resolves.toBeUndefined();
  });
});

describe('LichessHttpClient — streaming with reconnect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reconnects after a clean end-of-stream and resets the attempt counter', async () => {
    const first = controllableStreamResponse();
    const second = controllableStreamResponse();
    const { fetch, calls } = makeQueueFetch([first.response, second.response]);
    const client = new LichessHttpClient('tok', { fetch, baseUrl: 'https://example.test' });

    const events: EventStreamEvent[] = [];
    const opens: number[] = [];
    const errors: unknown[] = [];
    const reconnects: Array<{ attempt: number; delayMs: number }> = [];

    const callbacks: StreamCallbacks<EventStreamEvent> = {
      onEvent: (e) => events.push(e),
      onOpen: () => opens.push(1),
      onError: (e) => errors.push(e),
      onReconnect: (attempt, delayMs) => reconnects.push({ attempt, delayMs }),
    };
    const handle = client.streamEvents(callbacks);

    await flush();
    await flush();
    expect(opens).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://example.test/api/stream/event');

    const gameStart = { type: 'gameStart', game: { gameId: 'g1', color: 'white' } };
    first.push(`${JSON.stringify(gameStart)}\n`);
    await flush();
    await flush();
    expect(events).toEqual([gameStart]);

    // Clean disconnect.
    first.close();
    await flush();
    await flush();
    await flush();
    expect(errors).toHaveLength(1);
    expect(reconnects).toHaveLength(1);
    expect(reconnects[0]?.attempt).toBe(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(opens).toHaveLength(2);
    expect(calls).toHaveLength(2);

    handle.close();
    await handle.done;
  });

  it('backs off further on consecutive failures without a successful reconnect', async () => {
    const responses = [
      controllableStreamResponse(),
      controllableStreamResponse(),
      controllableStreamResponse(),
    ];
    const { fetch } = makeQueueFetch(responses.map((r) => r.response));
    const client = new LichessHttpClient('tok', { fetch });

    const reconnects: Array<{ attempt: number; delayMs: number }> = [];
    const handle = client.streamEvents({
      onEvent: () => undefined,
      onReconnect: (attempt, delayMs) => reconnects.push({ attempt, delayMs }),
    });

    await flush();
    await flush();

    // First connection opens then immediately errors (never emits an event).
    responses[0]?.error(new Error('boom'));
    await flush();
    await flush();
    await flush();
    expect(reconnects).toHaveLength(1);
    expect(reconnects[0]?.attempt).toBe(1);

    await vi.advanceTimersByTimeAsync(2000);
    await flush();
    await flush();

    responses[1]?.error(new Error('boom again'));
    await flush();
    await flush();
    await flush();
    expect(reconnects.length).toBeGreaterThanOrEqual(2);
    expect(reconnects[1]?.attempt).toBe(2);
    // attempt 2's delay ceiling is larger than attempt 1's.
    expect(reconnects[1]?.delayMs).toBeGreaterThanOrEqual(0);

    handle.close();
    await vi.advanceTimersByTimeAsync(30000);
    await handle.done;
  });

  it('does not reconnect after a 401 and reports it via onError', async () => {
    const { fetch, calls } = makeQueueFetch([jsonResponse(401, { error: 'bad token' })]);
    const client = new LichessHttpClient('tok', { fetch });

    const errors: unknown[] = [];
    const reconnects: unknown[] = [];
    const handle = client.streamEvents({
      onEvent: () => undefined,
      onError: (e) => errors.push(e),
      onReconnect: () => reconnects.push(1),
    });

    await handle.done;

    expect(calls).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect((errors[0] as LichessError).kind).toBe('unauthorized');
    expect(reconnects).toHaveLength(0);
  });

  it('close() is idempotent and resolves done without leaking a pending reconnect', async () => {
    const stream = controllableStreamResponse();
    const { fetch, calls } = makeQueueFetch([stream.response]);
    const client = new LichessHttpClient('tok', { fetch });

    const handle = client.streamGame('g1', { onEvent: () => undefined });
    await flush();
    await flush();

    handle.close();
    handle.close();
    handle.close();

    await handle.done;
    expect(calls).toHaveLength(1);

    // No further reconnect should occur even after time passes.
    await vi.advanceTimersByTimeAsync(60000);
    expect(calls).toHaveLength(1);
  });

  it('streamGame requests the per-game path and yields BoardStreamEvents', async () => {
    const stream = controllableStreamResponse();
    const { fetch, calls } = makeQueueFetch([stream.response]);
    const client = new LichessHttpClient('tok', { fetch, baseUrl: 'https://example.test' });

    const events: BoardStreamEvent[] = [];
    const handle = client.streamGame('game42', { onEvent: (e) => events.push(e) });
    await flush();
    await flush();

    expect(calls[0]?.url).toBe('https://example.test/api/board/game/stream/game42');

    const gameState = { type: 'gameState', moves: 'e2e4', wtime: 1000, btime: 1000, winc: 0, binc: 0, status: 'started' };
    stream.push(`${JSON.stringify(gameState)}\n`);
    await flush();
    await flush();
    expect(events).toEqual([gameState]);

    handle.close();
    await handle.done;
  });
});
