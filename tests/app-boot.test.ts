/**
 * Boot-level integration test.
 *
 * The per-module tests all stub their neighbours, so nothing else proves that
 * the real index.html markup, the screen router and the Lichess client line up.
 * This mounts the actual index.html body and drives startApp() against a fake
 * fetch.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { startApp } from '../src/app';

// Under jsdom `import.meta.url` is an http URL, so resolve from the project root.
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));

/**
 * Lets pending promise chains inside startApp settle. Boot spans several real
 * awaits (token probe, ongoing-games fetch, the first stream read), so this
 * yields to the macrotask queue rather than just draining microtasks.
 */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1) await new Promise((r) => setTimeout(r, 0));
};

function activeScreen(): string | null {
  return document.querySelector('.screen[data-active]')?.getAttribute('data-screen') ?? null;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** An ND-JSON stream that stays open, like the real event stream. */
function openStream(): Response {
  const stream = new ReadableStream<Uint8Array>({ start() { /* never closes */ } });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson' },
  });
}

describe('app boot', () => {
  beforeEach(() => {
    document.body.innerHTML = body;
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('shows the token screen when no token is stored', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    startApp();
    await flush();

    expect(activeScreen()).toBe('token');
    // Nothing should be requested before there is a token to authenticate with.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates a stored token and lands on the idle screen', async () => {
    localStorage.setItem('flipchess.token', 'tok_123');

    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/account')) return jsonResponse({ id: 'me', username: 'me' });
      if (url.endsWith('/api/account/playing')) return jsonResponse({ nowPlaying: [] });
      if (url.includes('/api/stream/event')) return openStream();
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    startApp();
    await flush();

    expect(activeScreen()).toBe('idle');
    const authed = fetchMock.mock.calls.every(([, init]) => {
      const headers = new Headers((init as RequestInit | undefined)?.headers);
      return headers.get('authorization') === 'Bearer tok_123';
    });
    expect(authed).toBe(true);
  });

  it('falls back to the token screen and forgets the token on a 401', async () => {
    localStorage.setItem('flipchess.token', 'revoked');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    );

    startApp();
    await flush();

    expect(activeScreen()).toBe('token');
    expect(localStorage.getItem('flipchess.token')).toBeNull();
  });

  it('resumes a game that was already in progress', async () => {
    localStorage.setItem('flipchess.token', 'tok_123');

    const gameFull = {
      type: 'gameFull',
      id: 'abc123',
      rated: false,
      variant: { key: 'standard', name: 'Standard' },
      clock: { initial: 180000, increment: 2000 },
      white: { id: 'me', name: 'me' },
      black: { id: 'them', name: 'them' },
      initialFen: 'startpos',
      state: {
        type: 'gameState',
        moves: '',
        wtime: 180000,
        btime: 180000,
        winc: 2000,
        binc: 2000,
        status: 'started',
      },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/account')) return jsonResponse({ id: 'me', username: 'me' });
        if (url.endsWith('/api/account/playing')) {
          return jsonResponse({
            nowPlaying: [{ gameId: 'abc123', fullId: 'abc123xy', color: 'white', fen: '', hasMoved: false, isMyTurn: true, opponent: {}, rated: false }],
          });
        }
        if (url.includes('/api/board/game/stream/')) {
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(JSON.stringify(gameFull) + '\n'));
              },
            }),
            { status: 200, headers: { 'content-type': 'application/x-ndjson' } },
          );
        }
        if (url.includes('/api/stream/event')) return openStream();
        throw new Error(`unexpected request: ${url}`);
      }),
    );

    startApp();
    await flush();

    expect(activeScreen()).toBe('game');
    // The board must actually be populated, not just switched to.
    expect(document.querySelectorAll('#board .square').length).toBe(64);
  });
});
