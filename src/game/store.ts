/**
 * Reducer + observable store for the active game. Holds no DOM APIs — the
 * caller (UI layer) owns vibration, animation frames, etc. It derives a
 * fresh, immutable `GameView` on every change so consumers can diff by
 * object identity.
 */
import { checkedKingSquare, createPosition, parseUci, positionFen, positionTurn } from './chess';
import { syncClocks } from './clock';
import type { Clocks, Color, GameFullEvent, GameStateEvent, GameView, Store, Uci } from '../types';

/** Derives which color the local player is, by matching account id against the game's players. */
export function colorFor(event: GameFullEvent, myUserId: string): Color {
  return event.white.id === myUserId ? 'white' : 'black';
}

function splitMoves(moves: string): Uci[] {
  const trimmed = moves.trim();
  return trimmed.length === 0 ? [] : trimmed.split(/\s+/);
}

function isFinishedStatus(status: GameStateEvent['status']): boolean {
  return status !== 'created' && status !== 'started';
}

function opponentFromEvent(event: GameFullEvent, myColor: Color): { username: string; rating: number | null } {
  const opponentPlayer = myColor === 'white' ? event.black : event.white;
  return {
    username: opponentPlayer.name ?? opponentPlayer.id ?? 'Opponent',
    rating: opponentPlayer.rating ?? null,
  };
}

interface InternalState {
  gameId: string;
  myColor: Color;
  initialFen: string;
  confirmedMoves: Uci[];
  pendingMove: Uci | null;
  status: GameStateEvent['status'];
  winner: Color | null;
  wdraw: boolean;
  bdraw: boolean;
  /** Whether the game has a real clock at all (from gameFull.clock presence). */
  hasClock: boolean;
  clocks: Clocks;
  opponent: { username: string; rating: number | null };
  /** Whether it was the local player's turn as of the last authoritative event, for became-my-turn detection. */
  wasMyTurn: boolean;
}

function buildView(state: InternalState): GameView {
  const viewMoves = state.pendingMove === null ? state.confirmedMoves : [...state.confirmedMoves, state.pendingMove];
  const position = createPosition(state.initialFen, viewMoves);
  const turn = positionTurn(position);
  const finished = isFinishedStatus(state.status);
  const lastUci = viewMoves.length > 0 ? viewMoves[viewMoves.length - 1] : undefined;
  const lastMoveParsed = lastUci !== undefined ? parseUci(lastUci) : null;

  return {
    gameId: state.gameId,
    myColor: state.myColor,
    fen: positionFen(position),
    turn,
    myTurn: !finished && turn === state.myColor,
    moves: viewMoves,
    lastMove: lastMoveParsed ? { from: lastMoveParsed.from, to: lastMoveParsed.to } : null,
    checkSquare: checkedKingSquare(position),
    clocks: state.clocks,
    status: state.status,
    finished,
    winner: state.winner,
    drawOfferFromOpponent: state.myColor === 'white' ? state.bdraw : state.wdraw,
    drawOfferFromMe: state.myColor === 'white' ? state.wdraw : state.bdraw,
    opponent: state.opponent,
    pendingMove: state.pendingMove,
  };
}

export interface GameStore extends Store<GameView | null> {
  /** Loads the initial state of a game from its `gameFull` event. */
  applyGameFull(event: GameFullEvent, myColor: Color): void;
  /**
   * Re-derives the position from the stored initialFen + the event's move
   * list, resets clocks to the pushed values, updates status/winner/draw
   * offers, and clears `pendingMove` once the server's move list contains
   * it. Returns true exactly when this event just made it the local
   * player's turn (so the caller can vibrate), false otherwise.
   */
  applyGameState(event: GameStateEvent): boolean;
  /** Optimistically applies a move we just sent, before server confirmation. */
  setPendingMove(uci: Uci): void;
  /** Reverts a pending move the server rejected. */
  revertPendingMove(): void;
  /** Drops back to no game loaded. */
  clear(): void;
}

export function createGameStore(): GameStore {
  let state: InternalState | null = null;
  let cachedView: GameView | null = null;
  const listeners = new Set<(value: GameView | null) => void>();

  function emit(): void {
    cachedView = state ? buildView(state) : null;
    for (const listener of listeners) listener(cachedView);
  }

  return {
    get(): GameView | null {
      return cachedView;
    },

    subscribe(listener: (value: GameView | null) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    applyGameFull(event: GameFullEvent, myColor: Color): void {
      const now = performance.now();
      const confirmedMoves = splitMoves(event.state.moves);
      const position = createPosition(event.initialFen, confirmedMoves);
      const turn = positionTurn(position);
      const finished = isFinishedStatus(event.state.status);
      const clocks = syncClocks(event.state, turn, finished, now);
      clocks.present = Boolean(event.clock);

      state = {
        gameId: event.id,
        myColor,
        initialFen: event.initialFen,
        confirmedMoves,
        pendingMove: null,
        status: event.state.status,
        winner: event.state.winner ?? null,
        wdraw: event.state.wdraw ?? false,
        bdraw: event.state.bdraw ?? false,
        hasClock: Boolean(event.clock),
        clocks,
        opponent: opponentFromEvent(event, myColor),
        wasMyTurn: !finished && turn === myColor,
      };
      emit();
    },

    applyGameState(event: GameStateEvent): boolean {
      if (!state) return false;

      const now = performance.now();
      const newConfirmedMoves = splitMoves(event.moves);
      const previousCount = state.confirmedMoves.length;

      const nextPendingMove =
        state.pendingMove !== null && newConfirmedMoves[previousCount] === state.pendingMove
          ? null
          : state.pendingMove;

      const position = createPosition(state.initialFen, newConfirmedMoves);
      const turn = positionTurn(position);
      const finished = isFinishedStatus(event.status);
      const clocks = syncClocks(event, turn, finished, now);
      clocks.present = state.hasClock;

      const wasMyTurn = state.wasMyTurn;
      const isMyTurnNow = !finished && turn === state.myColor;

      state = {
        ...state,
        confirmedMoves: newConfirmedMoves,
        pendingMove: nextPendingMove,
        status: event.status,
        winner: event.winner ?? null,
        wdraw: event.wdraw ?? false,
        bdraw: event.bdraw ?? false,
        clocks,
        wasMyTurn: isMyTurnNow,
      };
      emit();

      return !wasMyTurn && isMyTurnNow;
    },

    setPendingMove(uci: Uci): void {
      if (!state) return;
      state = { ...state, pendingMove: uci };
      emit();
    },

    revertPendingMove(): void {
      if (!state || state.pendingMove === null) return;
      state = { ...state, pendingMove: null };
      emit();
    },

    clear(): void {
      if (!state) return;
      state = null;
      emit();
    },
  };
}
