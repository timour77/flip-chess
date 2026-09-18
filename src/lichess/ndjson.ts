/**
 * Parses a Lichess ND-JSON stream: one JSON object per line, with bare
 * blank lines sent periodically as keep-alives. Handles chunk boundaries
 * that split a line across two reads.
 */
export async function* parseNdjson<T>(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<T> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  if (signal) {
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  try {
    for (;;) {
      if (signal?.aborted) {
        return;
      }

      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (err) {
        if (signal?.aborted) {
          return;
        }
        throw err;
      }

      const { done, value } = result;

      if (value) {
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          const trimmed = line.trim();
          if (trimmed.length === 0) {
            continue; // keep-alive
          }
          yield JSON.parse(trimmed) as T;
        }
      }

      if (done) {
        buffer += decoder.decode();
        const trimmed = buffer.trim();
        buffer = '';
        if (trimmed.length > 0) {
          yield JSON.parse(trimmed) as T;
        }
        return;
      }
    }
  } finally {
    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}
