import { describe, expect, it, vi } from 'vitest';
import { createBoard } from '../src/ui/board';
import type { BoardHandlers } from '../src/ui/board';
import type { Color, GameView, PromotionPiece, Square } from '../src/types';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function makeView(overrides: Partial<GameView> = {}): GameView {
  return {
    gameId: 'g1',
    myColor: 'white',
    fen: START_FEN,
    turn: 'white',
    myTurn: true,
    moves: [],
    lastMove: null,
    checkSquare: null,
    clocks: {
      white: { remainingMs: 60_000, running: false },
      black: { remainingMs: 60_000, running: false },
      syncedAt: 0,
      present: true,
    },
    status: 'started',
    finished: false,
    winner: null,
    drawOfferFromOpponent: false,
    drawOfferFromMe: false,
    opponent: { username: 'opp', rating: 1500 },
    pendingMove: null,
    ...overrides,
  };
}

function makeHandlers(overrides: Partial<BoardHandlers> = {}): BoardHandlers {
  return {
    legalDestinations: vi.fn((): Square[] => []),
    needsPromotion: vi.fn((): boolean => false),
    askPromotion: vi.fn((): Promise<PromotionPiece | null> => Promise.resolve(null)),
    onMove: vi.fn(),
    ...overrides,
  };
}

function squareEl(root: HTMLElement, square: Square): HTMLElement {
  const el = root.querySelector<HTMLElement>(`[data-square="${square}"]`);
  if (!el) throw new Error(`square ${square} not found`);
  return el;
}

function tap(root: HTMLElement, square: Square): void {
  squareEl(root, square).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('createBoard', () => {
  it('renders exactly 64 squares, built once', () => {
    const root = document.createElement('div');
    const handlers = makeHandlers();
    const board = createBoard(root, handlers);
    board.render(makeView());

    expect(root.querySelectorAll('.square').length).toBe(64);

    const firstSquareEl = squareEl(root, 'a1');
    board.render(makeView({ fen: START_FEN, lastMove: { from: 'e2', to: 'e4' } }));
    expect(root.querySelectorAll('.square').length).toBe(64);
    // Same node instance reused across renders, not rebuilt.
    expect(squareEl(root, 'a1')).toBe(firstSquareEl);
  });

  it('orients the board to myColor', () => {
    const root = document.createElement('div');
    const board = createBoard(root, makeHandlers());

    board.render(makeView({ myColor: 'white' }));
    const a1White = squareEl(root, 'a1');
    expect(a1White.style.gridColumnStart).toBe('1');
    expect(a1White.style.gridRowStart).toBe('8');

    board.render(makeView({ myColor: 'black' }));
    const a1Black = squareEl(root, 'a1');
    expect(a1Black.style.gridColumnStart).toBe('8');
    expect(a1Black.style.gridRowStart).toBe('1');
  });

  it('selects an own piece on tap and marks its legal destinations', () => {
    const root = document.createElement('div');
    const legalDestinations = vi.fn((square: Square): Square[] => (square === 'e2' ? ['e3', 'e4'] : []));
    const handlers = makeHandlers({ legalDestinations });
    const board = createBoard(root, handlers);
    board.render(makeView());

    tap(root, 'e2');

    expect(legalDestinations).toHaveBeenCalledWith('e2');
    const e4Marker = squareEl(root, 'e4').querySelector('.sq-marker');
    expect(e4Marker?.classList.contains('is-move')).toBe(true);
    const e2Underlay = squareEl(root, 'e2').querySelector('.sq-underlay');
    expect(e2Underlay?.classList.contains('is-selected')).toBe(true);
  });

  it('marks an occupied legal destination as a capture', () => {
    const root = document.createElement('div');
    // White pawn on d5, black knight on e7 — treat e7 as a capturable destination.
    const fen = '4k3/4n3/8/3P4/8/8/8/4K3 w - - 0 1';
    const legalDestinations = vi.fn((square: Square): Square[] => (square === 'd5' ? ['d6', 'e7'] : []));
    const handlers = makeHandlers({ legalDestinations });
    const board = createBoard(root, handlers);
    board.render(makeView({ fen, myColor: 'white' }));

    tap(root, 'd5');

    expect(squareEl(root, 'd6').querySelector('.sq-marker')?.classList.contains('is-move')).toBe(true);
    expect(squareEl(root, 'e7').querySelector('.sq-marker')?.classList.contains('is-capture')).toBe(true);
  });

  it('calls onMove when tapping a marked destination', () => {
    const root = document.createElement('div');
    const legalDestinations = vi.fn((square: Square): Square[] => (square === 'e2' ? ['e3', 'e4'] : []));
    const handlers = makeHandlers({ legalDestinations });
    const board = createBoard(root, handlers);
    board.render(makeView());

    tap(root, 'e2');
    tap(root, 'e4');

    expect(handlers.onMove).toHaveBeenCalledWith('e2', 'e4');
  });

  it('re-selects when tapping another own piece, and clears selection on an unrelated tap', () => {
    const root = document.createElement('div');
    const legalDestinations = vi.fn((square: Square): Square[] => {
      if (square === 'e2') return ['e3', 'e4'];
      if (square === 'd2') return ['d3', 'd4'];
      return [];
    });
    const handlers = makeHandlers({ legalDestinations });
    const board = createBoard(root, handlers);
    board.render(makeView());

    tap(root, 'e2');
    tap(root, 'd2');
    expect(legalDestinations).toHaveBeenCalledWith('d2');
    expect(squareEl(root, 'd2').querySelector('.sq-underlay')?.classList.contains('is-selected')).toBe(true);
    expect(squareEl(root, 'd4').querySelector('.sq-marker')?.classList.contains('is-move')).toBe(true);
    // e2's old markers are gone.
    expect(squareEl(root, 'e4').querySelector('.sq-marker')?.classList.contains('is-move')).toBe(false);

    tap(root, 'a6'); // empty square, not a legal destination of d2
    expect(squareEl(root, 'd2').querySelector('.sq-underlay')?.classList.contains('is-selected')).toBe(false);
    expect(squareEl(root, 'd4').querySelector('.sq-marker')?.classList.contains('is-move')).toBe(false);
  });

  it('ignores taps when it is not the player\'s turn or the game is finished', () => {
    const root = document.createElement('div');
    const legalDestinations = vi.fn((): Square[] => ['e4']);
    const handlers = makeHandlers({ legalDestinations });
    const board = createBoard(root, handlers);

    board.render(makeView({ myTurn: false }));
    tap(root, 'e2');
    expect(legalDestinations).not.toHaveBeenCalled();

    board.render(makeView({ myTurn: true, finished: true }));
    tap(root, 'e2');
    expect(legalDestinations).not.toHaveBeenCalled();
  });

  it('ignores taps once setInteractive(false) is called', () => {
    const root = document.createElement('div');
    const legalDestinations = vi.fn((): Square[] => ['e4']);
    const handlers = makeHandlers({ legalDestinations });
    const board = createBoard(root, handlers);
    board.render(makeView());
    board.setInteractive(false);

    tap(root, 'e2');
    expect(legalDestinations).not.toHaveBeenCalled();
  });

  it('places the last-move and check highlights on the right squares', () => {
    const root = document.createElement('div');
    const board = createBoard(root, makeHandlers());
    board.render(makeView({ lastMove: { from: 'e2', to: 'e4' }, checkSquare: 'e8' }));

    expect(squareEl(root, 'e2').querySelector('.sq-underlay')?.classList.contains('is-last-move')).toBe(true);
    expect(squareEl(root, 'e4').querySelector('.sq-underlay')?.classList.contains('is-last-move')).toBe(true);
    expect(squareEl(root, 'e8').querySelector('.sq-underlay')?.classList.contains('is-check')).toBe(true);
    expect(squareEl(root, 'd2').querySelector('.sq-underlay')?.classList.contains('is-last-move')).toBe(false);
  });

  it('routes a promotion move through the picker before calling onMove', async () => {
    const root = document.createElement('div');
    const fen = 'k7/4P3/8/8/8/8/8/K7 w - - 0 1'; // white pawn one step from promoting on e8
    const legalDestinations = vi.fn((square: Square): Square[] => (square === 'e7' ? ['e8'] : []));
    const needsPromotion = vi.fn(
      (from: Square, to: Square): boolean => from === 'e7' && to === 'e8',
    );
    const askPromotion = vi.fn((): Promise<PromotionPiece | null> => Promise.resolve('q'));
    const handlers = makeHandlers({ legalDestinations, needsPromotion, askPromotion });
    const board = createBoard(root, handlers);
    board.render(makeView({ fen, myColor: 'white' }));

    tap(root, 'e7');
    tap(root, 'e8');

    expect(needsPromotion).toHaveBeenCalledWith('e7', 'e8');
    expect(handlers.onMove).not.toHaveBeenCalled();

    await Promise.resolve();
    await Promise.resolve();

    expect(askPromotion).toHaveBeenCalledWith('white' satisfies Color);
    expect(handlers.onMove).toHaveBeenCalledWith('e7', 'e8', 'q');
  });

  it('does not call onMove when the promotion picker is cancelled', async () => {
    const root = document.createElement('div');
    const fen = 'k7/4P3/8/8/8/8/8/K7 w - - 0 1';
    const legalDestinations = vi.fn((square: Square): Square[] => (square === 'e7' ? ['e8'] : []));
    const needsPromotion = vi.fn((): boolean => true);
    const askPromotion = vi.fn((): Promise<PromotionPiece | null> => Promise.resolve(null));
    const handlers = makeHandlers({ legalDestinations, needsPromotion, askPromotion });
    const board = createBoard(root, handlers);
    board.render(makeView({ fen, myColor: 'white' }));

    tap(root, 'e7');
    tap(root, 'e8');
    await Promise.resolve();
    await Promise.resolve();

    expect(askPromotion).toHaveBeenCalled();
    expect(handlers.onMove).not.toHaveBeenCalled();
  });
});
