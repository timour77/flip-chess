/**
 * Guards the Board API's undocumented speed floor.
 *
 * lila refuses a board seek with "Invalid time control" for anything faster
 * than Rapid. Nothing in the published OpenAPI schema says so — it documents
 * only time 0-180 and increment 0-180 — so the first shipped preset list was
 * built on the assumption that Bullet and Blitz were fine, and every one of
 * those tiles failed in the user's hands. These tests encode the real rule.
 */

import { describe, expect, it } from 'vitest';

import {
  MIN_SEEK_TOTAL_SECONDS,
  TIME_CONTROLS,
  estimateTotalSeconds,
  isSeekableOnBoardApi,
} from '../src/config';

describe('estimateTotalSeconds', () => {
  // scalachess: estimateTotalSeconds = limitSeconds + 40 * incrementSeconds
  it.each([
    [1, 0, 60],
    [3, 0, 180],
    [3, 2, 260],
    [5, 0, 300],
    [6, 3, 480],
    [8, 0, 480],
    [10, 0, 600],
    [15, 10, 1300],
  ])('%i+%i estimates to %i seconds', (time, increment, expected) => {
    expect(estimateTotalSeconds(time, increment)).toBe(expected);
  });

  it('handles the fractional minutes Lichess allows (0.25, 0.5)', () => {
    expect(estimateTotalSeconds(0.5, 0)).toBe(30);
    expect(estimateTotalSeconds(0.25, 0)).toBe(15);
  });
});

describe('isSeekableOnBoardApi', () => {
  const preset = (time: number, increment: number) => ({
    id: `${time}+${increment}`,
    label: `${time}+${increment}`,
    time,
    increment,
  });

  it('rejects the bullet and blitz controls that Lichess refused in practice', () => {
    // These four were shipped and every one came back rejected.
    expect(isSeekableOnBoardApi(preset(1, 0))).toBe(false);
    expect(isSeekableOnBoardApi(preset(3, 0))).toBe(false);
    expect(isSeekableOnBoardApi(preset(3, 2))).toBe(false);
    expect(isSeekableOnBoardApi(preset(5, 0))).toBe(false);
  });

  it('accepts the rapid controls that worked in practice', () => {
    expect(isSeekableOnBoardApi(preset(10, 0))).toBe(true);
    expect(isSeekableOnBoardApi(preset(15, 10))).toBe(true);
  });

  it('treats the Rapid boundary itself as seekable', () => {
    expect(MIN_SEEK_TOTAL_SECONDS).toBe(480);
    expect(isSeekableOnBoardApi(preset(8, 0))).toBe(true); // exactly 480
    expect(isSeekableOnBoardApi(preset(6, 3))).toBe(true); // exactly 480
    expect(isSeekableOnBoardApi(preset(5, 4))).toBe(false); // 460, just under
  });
});

describe('shipped presets', () => {
  it('are all seekable — a failing entry here is a tile that dies on tap', () => {
    const unseekable = TIME_CONTROLS.filter((p) => !isSeekableOnBoardApi(p)).map(
      (p) => `${p.id} (${estimateTotalSeconds(p.time, p.increment)}s)`,
    );
    expect(unseekable).toEqual([]);
  });

  it('stay inside the API-documented parameter ranges', () => {
    for (const p of TIME_CONTROLS) {
      expect(p.time).toBeGreaterThanOrEqual(0);
      expect(p.time).toBeLessThanOrEqual(180);
      expect(p.increment).toBeGreaterThanOrEqual(0);
      expect(p.increment).toBeLessThanOrEqual(180);
    }
  });

  it('has unique ids', () => {
    const ids = TIME_CONTROLS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
