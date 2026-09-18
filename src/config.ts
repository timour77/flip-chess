import type { TimeControlPreset } from './types';

/**
 * Time controls offered on the idle screen.
 *
 * Lichess's Board API accepts any clock, including bullet (see the research
 * issue linked from the spec), so the list is chosen for what is playable on a
 * cover screen rather than for what the API allows: fast enough to be worth
 * opening on a folded phone, with increments on the shorter ones because
 * tapping squares there is slower than moving a mouse.
 */
export const TIME_CONTROLS: TimeControlPreset[] = [
  { id: '1+0', label: '1+0 Bullet', time: 1, increment: 0 },
  { id: '3+0', label: '3+0 Blitz', time: 3, increment: 0 },
  { id: '3+2', label: '3+2 Blitz', time: 3, increment: 2 },
  { id: '5+0', label: '5+0 Blitz', time: 5, increment: 0 },
  { id: '10+0', label: '10+0 Rapid', time: 10, increment: 0 },
  { id: '15+10', label: '15+10 Rapid', time: 15, increment: 10 },
];

/** How long the result screen stays up before returning to idle. */
export const RESULT_SCREEN_MS = 4000;

/** Clock display turns urgent below this. */
export const LOW_TIME_MS = 10_000;
