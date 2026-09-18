import { describe, expect, it, vi } from 'vitest';
import { nextDelay, sleep } from '../src/lichess/backoff';

describe('nextDelay', () => {
  it('grows exponentially with attempt number, before jitter', () => {
    // With random() pinned at 1, nextDelay returns the full (uncapped) exponent.
    const random = () => 1;
    expect(nextDelay(1, { random })).toBe(1000);
    expect(nextDelay(2, { random })).toBe(2000);
    expect(nextDelay(3, { random })).toBe(4000);
    expect(nextDelay(4, { random })).toBe(8000);
    expect(nextDelay(5, { random })).toBe(16000);
  });

  it('caps the delay at 30s', () => {
    const random = () => 1;
    expect(nextDelay(6, { random })).toBe(30000);
    expect(nextDelay(20, { random })).toBe(30000);
  });

  it('applies jitter: delay is within [0, exponent]', () => {
    const random = () => 0.5;
    expect(nextDelay(3, { random })).toBe(2000); // 0.5 * 4000
    expect(nextDelay(1, { random: () => 0 })).toBe(0);
  });

  it('treats attempt < 1 as attempt 1', () => {
    const random = () => 1;
    expect(nextDelay(0, { random })).toBe(1000);
    expect(nextDelay(-5, { random })).toBe(1000);
  });

  it('is deterministic given an injected random function', () => {
    let calls = 0;
    const random = () => {
      calls += 1;
      return 0.25;
    };
    const a = nextDelay(4, { random });
    const b = nextDelay(4, { random });
    expect(a).toBe(b);
    expect(calls).toBe(2);
  });

  it('respects custom base/cap options', () => {
    const random = () => 1;
    expect(nextDelay(1, { random, baseMs: 500, capMs: 1000 })).toBe(500);
    expect(nextDelay(3, { random, baseMs: 500, capMs: 1000 })).toBe(1000);
  });
});

describe('sleep', () => {
  it('resolves after the given delay', async () => {
    vi.useFakeTimers();
    try {
      const promise = sleep(1000);
      let resolved = false;
      void promise.then(() => {
        resolved = true;
      });

      await vi.advanceTimersByTimeAsync(999);
      expect(resolved).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      expect(resolved).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects immediately if the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sleep(1000, controller.signal)).rejects.toThrow();
  });

  it('rejects when aborted mid-sleep, and cleans up the timer', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const promise = sleep(5000, controller.signal);
      const assertion = expect(promise).rejects.toThrow();

      await vi.advanceTimersByTimeAsync(100);
      controller.abort();
      await assertion;

      // No pending timer should still be alive after abort.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not reject after it already resolved, even if aborted later', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const promise = sleep(100, controller.signal);
      await vi.advanceTimersByTimeAsync(100);
      await expect(promise).resolves.toBeUndefined();
      controller.abort(); // should be a no-op now
    } finally {
      vi.useRealTimers();
    }
  });
});
