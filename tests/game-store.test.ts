import { describe, expect, it, vi } from 'vitest';
import { colorFor, createGameStore } from '../src/game/store';
import { describeResult } from '../src/game/result';
import type { GameFullEvent, GameStateEvent, GameStatus } from '../src/types';

function fullEvent(overrides: Partial<GameFullEvent> = {}): GameFullEvent {
  return {
    type: 'gameFull',
    id: 'game1',
    rated: false,
    variant: { key: 'standard', name: 'Standard' },
    clock: { initial: 300, increment: 0 },
    white: { id: 'me', name: 'Me' },
    black: { id: 'opp', name: 'Opponent', rating: 1500 },
    initialFen: 'startpos',
    state: {
      type: 'gameState',
      moves: '',
      wtime: 300_000,
      btime: 300_000,
      winc: 0,
      binc: 0,
      status: 'started',
    },
    ...overrides,
  };
}

function stateEvent(overrides: Partial<GameStateEvent> = {}): GameStateEvent {
  return {
    type: 'gameState',
    moves: '',
    wtime: 300_000,
    btime: 300_000,
    winc: 0,
    binc: 0,
    status: 'started',
    ...overrides,
  };
}

describe('colorFor', () => {
  it('matches the local player against white.id', () => {
    const event = fullEvent();
    expect(colorFor(event, 'me')).toBe('white');
  });

  it('matches the local player against black.id', () => {
    const event = fullEvent({ white: { id: 'opp' }, black: { id: 'me' } });
    expect(colorFor(event, 'me')).toBe('black');
  });
});

describe('createGameStore: applyGameFull', () => {
  it('produces the initial GameView', () => {
    const store = createGameStore();
    store.applyGameFull(fullEvent(), 'white');
    const view = store.get();

    expect(view).not.toBeNull();
    expect(view?.gameId).toBe('game1');
    expect(view?.myColor).toBe('white');
    expect(view?.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(view?.turn).toBe('white');
    expect(view?.myTurn).toBe(true);
    expect(view?.moves).toEqual([]);
    expect(view?.lastMove).toBeNull();
    expect(view?.checkSquare).toBeNull();
    expect(view?.status).toBe('started');
    expect(view?.finished).toBe(false);
    expect(view?.winner).toBeNull();
    expect(view?.drawOfferFromMe).toBe(false);
    expect(view?.drawOfferFromOpponent).toBe(false);
    expect(view?.opponent).toEqual({ username: 'Opponent', rating: 1500 });
    expect(view?.pendingMove).toBeNull();
    // No moves yet: neither clock runs.
    expect(view?.clocks.white.running).toBe(false);
    expect(view?.clocks.black.running).toBe(false);
    expect(view?.clocks.present).toBe(true);
  });

  it('marks clocks absent when the game has no clock', () => {
    const store = createGameStore();
    store.applyGameFull(fullEvent({ clock: null }), 'white');
    expect(store.get()?.clocks.present).toBe(false);
  });

  it('derives opponent from the other color when the local player is black', () => {
    const store = createGameStore();
    store.applyGameFull(fullEvent(), 'black');
    expect(store.get()?.opponent).toEqual({ username: 'Me', rating: null });
  });
});

describe('createGameStore: applyGameState', () => {
  it('re-derives the position from initialFen + moves', () => {
    const store = createGameStore();
    store.applyGameFull(fullEvent(), 'white');
    store.applyGameState(stateEvent({ moves: 'e2e4 e7e5', wtime: 295_000, btime: 290_000 }));

    const view = store.get();
    expect(view?.moves).toEqual(['e2e4', 'e7e5']);
    expect(view?.fen).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    expect(view?.turn).toBe('white');
    expect(view?.lastMove).toEqual({ from: 'e7', to: 'e5' });
    expect(view?.clocks.white.remainingMs).toBe(295_000);
    expect(view?.clocks.black.remainingMs).toBe(290_000);
    expect(view?.clocks.white.running).toBe(true);
    expect(view?.clocks.black.running).toBe(false);
  });

  it('updates status, winner and finished on a terminal event', () => {
    const store = createGameStore();
    store.applyGameFull(fullEvent(), 'white');
    store.applyGameState(stateEvent({ moves: 'f2f3 e7e5 g2g4 d8h4', status: 'mate', winner: 'black' }));

    const view = store.get();
    expect(view?.status).toBe('mate');
    expect(view?.finished).toBe(true);
    expect(view?.winner).toBe('black');
    expect(view?.checkSquare).toBe('e1');
    expect(view?.clocks.white.running).toBe(false);
    expect(view?.clocks.black.running).toBe(false);
  });

  it('maps wdraw/bdraw to drawOfferFromMe/drawOfferFromOpponent depending on myColor', () => {
    const whiteStore = createGameStore();
    whiteStore.applyGameFull(fullEvent(), 'white');
    whiteStore.applyGameState(stateEvent({ wdraw: true }));
    expect(whiteStore.get()?.drawOfferFromMe).toBe(true);
    expect(whiteStore.get()?.drawOfferFromOpponent).toBe(false);

    const blackStore = createGameStore();
    blackStore.applyGameFull(fullEvent(), 'black');
    blackStore.applyGameState(stateEvent({ wdraw: true }));
    expect(blackStore.get()?.drawOfferFromMe).toBe(false);
    expect(blackStore.get()?.drawOfferFromOpponent).toBe(true);
  });

  it('is a no-op when no game has been loaded', () => {
    const store = createGameStore();
    expect(store.applyGameState(stateEvent())).toBe(false);
    expect(store.get()).toBeNull();
  });
});

describe('createGameStore: pending move lifecycle', () => {
  it('setPendingMove optimistically applies the move and marks it pending', () => {
    const store = createGameStore();
    store.applyGameFull(fullEvent(), 'white');
    store.setPendingMove('e2e4');

    const view = store.get();
    expect(view?.pendingMove).toBe('e2e4');
    expect(view?.moves).toEqual(['e2e4']);
    expect(view?.fen).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    expect(view?.turn).toBe('black');
    expect(view?.myTurn).toBe(false);
  });

  it('revertPendingMove drops the optimistic move', () => {
    const store = createGameStore();
    store.applyGameFull(fullEvent(), 'white');
    store.setPendingMove('e2e4');
    store.revertPendingMove();

    const view = store.get();
    expect(view?.pendingMove).toBeNull();
    expect(view?.moves).toEqual([]);
    expect(view?.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });

  it('applyGameState clears the pending move once the server move list confirms it', () => {
    const store = createGameStore();
    store.applyGameFull(fullEvent(), 'white');
    store.setPendingMove('e2e4');
    store.applyGameState(stateEvent({ moves: 'e2e4', wtime: 299_000 }));

    const view = store.get();
    expect(view?.pendingMove).toBeNull();
    expect(view?.moves).toEqual(['e2e4']);
  });

  it('leaves an unconfirmed pending move alone if the server event does not reflect it', () => {
    const store = createGameStore();
    store.applyGameFull(fullEvent(), 'white');
    store.setPendingMove('e2e4');
    // Server event with no new move (e.g. a draw-offer-only update).
    store.applyGameState(stateEvent({ moves: '' }));

    expect(store.get()?.pendingMove).toBe('e2e4');
  });
});

describe('createGameStore: became-my-turn signal', () => {
  it('fires exactly once per transition into my turn', () => {
    const store = createGameStore();
    store.applyGameFull(fullEvent(), 'white');

    // I move: turn passes to black. Not my turn -> not a "became my turn" event.
    expect(store.applyGameState(stateEvent({ moves: 'e2e4' }))).toBe(false);

    // Opponent responds: turn passes back to me. This is the transition.
    expect(store.applyGameState(stateEvent({ moves: 'e2e4 e7e5' }))).toBe(true);

    // Another event while it is still my turn (e.g. a clock-only update) must not refire.
    expect(store.applyGameState(stateEvent({ moves: 'e2e4 e7e5', wtime: 250_000 }))).toBe(false);

    // I move again, then opponent responds again: fires true exactly once more.
    expect(store.applyGameState(stateEvent({ moves: 'e2e4 e7e5 g1f3' }))).toBe(false);
    expect(store.applyGameState(stateEvent({ moves: 'e2e4 e7e5 g1f3 b8c6' }))).toBe(true);
  });

  it('never fires once the game is finished', () => {
    const store = createGameStore();
    store.applyGameFull(fullEvent(), 'white');
    store.applyGameState(stateEvent({ moves: 'e2e4' }));
    expect(
      store.applyGameState(stateEvent({ moves: 'e2e4 e7e5', status: 'resign', winner: 'white' })),
    ).toBe(false);
  });
});

describe('createGameStore: subscribe/clear', () => {
  it('notifies subscribers synchronously with a new object identity on every change', () => {
    const store = createGameStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.applyGameFull(fullEvent(), 'white');
    expect(listener).toHaveBeenCalledTimes(1);
    const first = listener.mock.calls[0]?.[0];

    store.applyGameState(stateEvent({ moves: 'e2e4' }));
    expect(listener).toHaveBeenCalledTimes(2);
    const second = listener.mock.calls[1]?.[0];

    expect(first).not.toBe(second);

    unsubscribe();
    store.applyGameState(stateEvent({ moves: 'e2e4 e7e5' }));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('clear() drops back to null', () => {
    const store = createGameStore();
    store.applyGameFull(fullEvent(), 'white');
    expect(store.get()).not.toBeNull();

    store.clear();
    expect(store.get()).toBeNull();
  });
});

describe('describeResult', () => {
  const cases: Array<{
    status: GameStatus;
    winner: 'white' | 'black' | null;
    myColor: 'white' | 'black';
    outcome: 'win' | 'loss' | 'draw' | 'aborted';
    reason: string;
  }> = [
    { status: 'mate', winner: 'white', myColor: 'white', outcome: 'win', reason: 'Checkmate' },
    { status: 'mate', winner: 'white', myColor: 'black', outcome: 'loss', reason: 'Checkmate' },
    { status: 'resign', winner: 'black', myColor: 'black', outcome: 'win', reason: 'Opponent resigned' },
    { status: 'resign', winner: 'black', myColor: 'white', outcome: 'loss', reason: 'You resigned' },
    { status: 'outoftime', winner: 'white', myColor: 'white', outcome: 'win', reason: 'Out of time' },
    { status: 'outoftime', winner: 'white', myColor: 'black', outcome: 'loss', reason: 'Out of time' },
    { status: 'timeout', winner: 'black', myColor: 'white', outcome: 'loss', reason: 'Out of time' },
    { status: 'stalemate', winner: null, myColor: 'white', outcome: 'draw', reason: 'Stalemate' },
    { status: 'stalemate', winner: null, myColor: 'black', outcome: 'draw', reason: 'Stalemate' },
    { status: 'draw', winner: null, myColor: 'white', outcome: 'draw', reason: 'Draw' },
    { status: 'aborted', winner: null, myColor: 'white', outcome: 'aborted', reason: 'Game aborted' },
    { status: 'aborted', winner: null, myColor: 'black', outcome: 'aborted', reason: 'Game aborted' },
    { status: 'noStart', winner: null, myColor: 'white', outcome: 'aborted', reason: 'Game did not start' },
  ];

  it.each(cases)('$status / winner=$winner / myColor=$myColor', ({ status, winner, myColor, outcome, reason }) => {
    const result = describeResult(status, winner, myColor);
    expect(result.outcome).toBe(outcome);
    expect(result.reason).toBe(reason);
  });

  it('treats a no-winner outoftime (insufficient mating material) as a draw', () => {
    expect(describeResult('outoftime', null, 'white')).toEqual({ outcome: 'draw', reason: 'Out of time' });
  });
});
