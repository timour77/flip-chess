/**
 * Local ticking clock model. Lichess pushes authoritative wtime/btime on
 * every `gameState` event; between events the UI extrapolates locally from
 * `syncedAt`. Every function here is pure and takes `now` as an argument
 * (a `performance.now()`-style timestamp) — nothing in this module ever
 * calls `Date.now()` itself, so the UI's animation-frame loop stays in
 * full control of when clocks are read.
 */
import type { Clocks, Color, GameStateEvent } from '../types';

/**
 * Builds the `Clocks` shape from an authoritative `gameState` (or the
 * `state` field of a `gameFull`). Only the side to move is marked
 * `running`, and only once the game has actually started: Lichess does not
 * start either clock until both players have made a move, so with fewer
 * than 2 moves played neither side is running. A finished game never has a
 * running side either.
 *
 * `present` is always true here since `wtime`/`btime` are always present on
 * the wire type; a caller that knows the game has no real clock at all
 * (`gameFull.clock` is null/absent, e.g. a correspondence game) should
 * override `present` to false on the result.
 */
export function syncClocks(state: GameStateEvent, turn: Color, finished: boolean, now: number): Clocks {
  const movesPlayed = state.moves.trim().length === 0 ? 0 : state.moves.trim().split(/\s+/).length;
  const started = movesPlayed >= 2;
  const running = !finished && started;

  return {
    white: { remainingMs: state.wtime, running: running && turn === 'white' },
    black: { remainingMs: state.btime, running: running && turn === 'black' },
    syncedAt: now,
    present: true,
  };
}

/** Remaining milliseconds for `side`, extrapolated from `syncedAt`, floored at 0. */
export function readClock(clocks: Clocks, side: Color, now: number): number {
  const clockSide = side === 'white' ? clocks.white : clocks.black;
  if (!clockSide.running) return Math.max(0, clockSide.remainingMs);
  const elapsed = now - clocks.syncedAt;
  return Math.max(0, clockSide.remainingMs - elapsed);
}

/**
 * Formats a clock reading for a ~350px screen. Above (or at) 10 seconds,
 * "m:ss" (e.g. "10:00", "0:59"); below 10 seconds, "s.d" with a tenths
 * digit (e.g. "9.9", "0.3") — this is what Lichess's own clock does, since
 * whole seconds are too coarse to convey the last few seconds before
 * flagging. Never negative; floors rather than rounds so it never displays
 * a value the player hasn't actually reached yet.
 */
export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped >= 10_000) {
    const totalSeconds = Math.floor(clamped / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
  const tenths = Math.floor(clamped / 100);
  const wholeSeconds = Math.floor(tenths / 10);
  const remainderTenths = tenths % 10;
  return `${wholeSeconds}.${remainderTenths}`;
}
