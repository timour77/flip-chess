import { describe, expect, it } from 'vitest';
import { parseNdjson } from '../src/lichess/ndjson';

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) {
    out.push(item);
  }
  return out;
}

describe('parseNdjson', () => {
  it('parses one JSON object per line', async () => {
    const stream = streamFromChunks(['{"a":1}\n{"a":2}\n{"a":3}\n']);
    const events = await collect(parseNdjson<{ a: number }>(stream));
    expect(events).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
  });

  it('skips bare blank-line keep-alives', async () => {
    const stream = streamFromChunks(['{"a":1}\n', '\n', '\n', '{"a":2}\n']);
    const events = await collect(parseNdjson<{ a: number }>(stream));
    expect(events).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('handles a line split across chunk boundaries', async () => {
    const full = '{"type":"gameFull","id":"abc123"}\n';
    const splitAt = 10;
    const stream = streamFromChunks([full.slice(0, splitAt), full.slice(splitAt)]);
    const events = await collect(parseNdjson<{ type: string; id: string }>(stream));
    expect(events).toEqual([{ type: 'gameFull', id: 'abc123' }]);
  });

  it('handles a line split into many small chunks, one byte at a time', async () => {
    const full = '{"x":42}\n';
    const chunks = full.split('');
    const stream = streamFromChunks(chunks);
    const events = await collect(parseNdjson<{ x: number }>(stream));
    expect(events).toEqual([{ x: 42 }]);
  });

  it('parses a final line with no trailing newline', async () => {
    const stream = streamFromChunks(['{"a":1}\n{"a":2}']);
    const events = await collect(parseNdjson<{ a: number }>(stream));
    expect(events).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('ignores whitespace-only lines', async () => {
    const stream = streamFromChunks(['{"a":1}\n   \n\t\n{"a":2}\n']);
    const events = await collect(parseNdjson<{ a: number }>(stream));
    expect(events).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('stops yielding once the signal is aborted', async () => {
    const controller = new AbortController();
    let cancelled = false;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(sc) {
        sc.enqueue(encoder.encode('{"a":1}\n'));
        // Never closes on its own — simulates a live stream.
      },
      cancel() {
        cancelled = true;
      },
    });

    const gen = parseNdjson<{ a: number }>(stream, controller.signal);
    const first = await gen.next();
    expect(first.value).toEqual({ a: 1 });

    controller.abort();
    const second = await gen.next();
    expect(second.done).toBe(true);
    expect(cancelled).toBe(true);
  });
});
