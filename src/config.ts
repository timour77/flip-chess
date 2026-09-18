import type { TimeControlPreset } from './types';

/**
 * Lichess speed classification, in "estimated total seconds" per player:
 * UltraBullet 0-29, Bullet 30-179, Blitz 180-479, Rapid 480-1499,
 * Classical 1500+. The estimate is the server's own formula.
 *
 * Source: scalachess `Clock.estimateTotalSeconds` and `Speed`.
 */
export function estimateTotalSeconds(timeMinutes: number, incrementSeconds: number): number {
  return Math.round(timeMinutes * 60) + 40 * incrementSeconds;
}

/**
 * The Board API will not pair anything faster than Rapid.
 *
 * lila validates a board seek with `boardApiHook`, which rejects the request
 * with "Invalid time control" unless the clock `isBoardCompatible` — i.e.
 * Rapid or slower. This is a server rule with no equivalent in the published
 * OpenAPI schema, which documents only `time` 0-180 and `increment` 0-180, so
 * it cannot be discovered from the spec: every Bullet and Blitz seek simply
 * comes back rejected.
 */
export const MIN_SEEK_TOTAL_SECONDS = 480;

export function isSeekableOnBoardApi(preset: TimeControlPreset): boolean {
  return estimateTotalSeconds(preset.time, preset.increment) >= MIN_SEEK_TOTAL_SECONDS;
}

/**
 * Time controls offered on the idle screen.
 *
 * Every entry must satisfy `isSeekableOnBoardApi` — a unit test enforces that,
 * because the failure mode is invisible until a real seek is rejected. Within
 * that floor the list favours the fastest games the API allows: 6+3 and 8+0
 * both estimate to exactly 480s, which gives a much shorter game than 15+10
 * while still clearing the Rapid boundary.
 */
export const TIME_CONTROLS: TimeControlPreset[] = [
  { id: '6+3', label: '6+3 Rapid', time: 6, increment: 3 },
  { id: '8+0', label: '8+0 Rapid', time: 8, increment: 0 },
  { id: '10+0', label: '10+0 Rapid', time: 10, increment: 0 },
  { id: '10+5', label: '10+5 Rapid', time: 10, increment: 5 },
  { id: '15+10', label: '15+10 Rapid', time: 15, increment: 10 },
  { id: '20+0', label: '20+0 Rapid', time: 20, increment: 0 },
];

/** How long the result screen stays up before returning to idle. */
export const RESULT_SCREEN_MS = 4000;

/** Clock display turns urgent below this. */
export const LOW_TIME_MS = 10_000;
