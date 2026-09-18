import { describe, expect, it } from 'vitest';
import { formatClock, readClock, syncClocks } from '../src/game/clock';
import type { GameStateEvent } from '../src/types';

function stateEvent(overrides: Partial<GameStateEvent> = {}): GameStateEvent {
  return {
    type: 'gameState',
    moves: 'e2e4 e7e5',
    wtime: 60_000,
    btime: 55_000,
    winc: 0,
    binc: 0,
    status: 'started',
    ...overrides,
  };
}

describe('syncClocks', () => {
  it('marks only the side to move as running once both sides have moved', () => {
    const clocks = syncClocks(stateEvent(), 'white', false, 1000);
    expect(clocks.white.running).toBe(true);
    expect(clocks.black.running).toBe(false);
    expect(clocks.white.remainingMs).toBe(60_000);
    expect(clocks.black.remainingMs).toBe(55_000);
    expect(clocks.syncedAt).toBe(1000);
  });

  it('marks the other side running when it is their move', () => {
    const clocks = syncClocks(stateEvent(), 'black', false, 1000);
    expect(clocks.white.running).toBe(false);
    expect(clocks.black.running).toBe(true);
  });

  it('runs neither side before both players have moved (fewer than 2 half-moves)', () => {
    const noMoves = syncClocks(stateEvent({ moves: '' }), 'white', false, 1000);
    expect(noMoves.white.running).toBe(false);
    expect(noMoves.black.running).toBe(false);

    const oneMove = syncClocks(stateEvent({ moves: 'e2e4' }), 'black', false, 1000);
    expect(oneMove.white.running).toBe(false);
    expect(oneMove.black.running).toBe(false);
  });

  it('runs neither side once the game is finished', () => {
    const clocks = syncClocks(stateEvent({ status: 'mate' }), 'white', true, 1000);
    expect(clocks.white.running).toBe(false);
    expect(clocks.black.running).toBe(false);
  });
});

describe('readClock', () => {
  it('returns the raw remaining time for a side that is not running', () => {
    const clocks = syncClocks(stateEvent(), 'white', false, 1000);
    expect(readClock(clocks, 'black', 5000)).toBe(55_000);
  });

  it('extrapolates elapsed time for the running side', () => {
    const clocks = syncClocks(stateEvent(), 'white', false, 1000);
    expect(readClock(clocks, 'white', 1000)).toBe(60_000);
    expect(readClock(clocks, 'white', 4500)).toBe(56_500);
  });

  it('floors remaining time at 0 instead of going negative', () => {
    const clocks = syncClocks(stateEvent({ wtime: 500 }), 'white', false, 1000);
    expect(readClock(clocks, 'white', 1000 + 10_000)).toBe(0);
  });
});

describe('formatClock', () => {
  it('formats 10:00 as mm:ss', () => {
    expect(formatClock(10 * 60_000)).toBe('10:00');
  });

  it('formats 0:59 as mm:ss', () => {
    expect(formatClock(59_000)).toBe('0:59');
  });

  it('switches to tenths just under the 10 second boundary', () => {
    expect(formatClock(9_900)).toBe('9.9');
    expect(formatClock(9_999)).toBe('9.9');
  });

  it('formats exactly 10 seconds as mm:ss, not tenths', () => {
    expect(formatClock(10_000)).toBe('0:10');
  });

  it('formats 0 as 0.0', () => {
    expect(formatClock(0)).toBe('0.0');
  });

  it('never displays a negative value', () => {
    expect(formatClock(-500)).toBe('0.0');
  });
});
