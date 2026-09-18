import { describe, expect, it } from 'vitest';
import {
  applyUci,
  boardSquares,
  checkedKingSquare,
  createPosition,
  isLegal,
  legalDestinations,
  needsPromotion,
  parseUci,
  positionFen,
  positionTurn,
  toUci,
} from '../src/game/chess';

describe('createPosition', () => {
  it('rebuilds the standard start position from "startpos" with no moves', () => {
    const position = createPosition('startpos', []);
    expect(positionFen(position)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(positionTurn(position)).toBe('white');
  });

  it('rebuilds a position from "startpos" plus a UCI move list', () => {
    const position = createPosition('startpos', ['e2e4', 'e7e5', 'g1f3']);
    expect(positionFen(position)).toBe(
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
    );
    expect(positionTurn(position)).toBe('black');
  });

  it('rebuilds a position from an explicit FEN plus moves', () => {
    // White king and pawn vs black king; advance the pawn one square.
    const position = createPosition('8/8/8/8/8/8/P6k/K7 w - - 0 1', ['a2a3']);
    expect(positionFen(position)).toBe('8/8/8/8/8/P7/7k/K7 b - - 0 1');
  });

  it('silently skips an illegal move embedded in the list rather than throwing', () => {
    expect(() => createPosition('startpos', ['e2e4', 'e2e4' /* illegal: not black's move source */])).not.toThrow();
  });
});

describe('checkmate scenario (fool\'s mate)', () => {
  const position = createPosition('startpos', ['f2f3', 'e7e5', 'g2g4', 'd8h4']);

  it('reaches the expected mating position', () => {
    expect(positionFen(position)).toBe(
      'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
    );
  });

  it('reports the checked king square', () => {
    expect(checkedKingSquare(position)).toBe('e1');
  });

  it('reports no check for a quiet position', () => {
    const quiet = createPosition('startpos', ['e2e4']);
    expect(checkedKingSquare(quiet)).toBeNull();
  });
});

describe('promotion', () => {
  const position = createPosition('8/P7/8/8/8/8/8/k6K w - - 0 1', []);

  it('detects a promoting pawn move', () => {
    expect(needsPromotion(position, 'a7', 'a8')).toBe(true);
  });

  it('does not flag a non-promoting move', () => {
    const quiet = createPosition('startpos', []);
    expect(needsPromotion(quiet, 'e2', 'e4')).toBe(false);
  });

  it('builds a UCI string with a promotion suffix', () => {
    expect(toUci('a7', 'a8', 'q')).toBe('a7a8q');
    expect(toUci('e2', 'e4')).toBe('e2e4');
  });

  it('parses a UCI move with a promotion suffix', () => {
    expect(parseUci('a7a8q')).toEqual({ from: 'a7', to: 'a8', promotion: 'q' });
    expect(parseUci('e2e4')).toEqual({ from: 'e2', to: 'e4' });
  });

  it('returns null for a malformed UCI string', () => {
    expect(parseUci('')).toBeNull();
    expect(parseUci('e2')).toBeNull();
    expect(parseUci('e2e4z')).toBeNull();
  });

  it('actually applies a promotion move and produces the promoted piece', () => {
    const next = applyUci(position, 'a7a8q');
    expect(next).not.toBeNull();
    expect(positionFen(next!)).toContain('Q7');
  });
});

describe('illegal move handling', () => {
  it('legalDestinations returns [] for an empty square', () => {
    const position = createPosition('startpos', []);
    expect(legalDestinations(position, 'e4')).toEqual([]);
  });

  it('legalDestinations returns [] for a garbage square instead of throwing', () => {
    const position = createPosition('startpos', []);
    expect(() => legalDestinations(position, 'z9')).not.toThrow();
    expect(legalDestinations(position, 'z9')).toEqual([]);
  });

  it('isLegal is false for an illegal move', () => {
    const position = createPosition('startpos', []);
    expect(isLegal(position, 'e2', 'e5')).toBe(false);
    expect(isLegal(position, 'e2', 'e4')).toBe(true);
  });

  it('applyUci returns null (never throws) for an illegal move', () => {
    const position = createPosition('startpos', []);
    expect(() => applyUci(position, 'e2e5')).not.toThrow();
    expect(applyUci(position, 'e2e5')).toBeNull();
  });

  it('applyUci returns null for a malformed UCI string', () => {
    const position = createPosition('startpos', []);
    expect(applyUci(position, 'nope')).toBeNull();
  });
});

describe('boardSquares orientation', () => {
  it('starts at a8 for white orientation, ending at h1', () => {
    const position = createPosition('startpos', []);
    const squares = boardSquares(position, 'white');
    expect(squares).toHaveLength(64);
    expect(squares[0]?.square).toBe('a8');
    expect(squares[63]?.square).toBe('h1');
    expect(squares[0]?.piece).toEqual({ type: 'r', color: 'black' });
    expect(squares[63]?.piece).toEqual({ type: 'r', color: 'white' });
  });

  it('starts at h1 for black orientation, ending at a8', () => {
    const position = createPosition('startpos', []);
    const squares = boardSquares(position, 'black');
    expect(squares).toHaveLength(64);
    expect(squares[0]?.square).toBe('h1');
    expect(squares[63]?.square).toBe('a8');
    expect(squares[0]?.piece).toEqual({ type: 'r', color: 'white' });
    expect(squares[63]?.piece).toEqual({ type: 'r', color: 'black' });
  });

  it('reports empty squares as null pieces', () => {
    const position = createPosition('startpos', []);
    const squares = boardSquares(position, 'white');
    const e4 = squares.find((s) => s.square === 'e4');
    expect(e4?.piece).toBeNull();
  });
});
