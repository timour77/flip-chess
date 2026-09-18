/**
 * Thin adapter over chess.js so the rest of the app never has to import
 * chess.js directly or deal with its `'w'|'b'` color convention, its
 * `Square` literal union, or the fact that `.move()` throws on illegal
 * input. Everything here speaks the shared wire types from `../types`.
 */
import { Chess } from 'chess.js';
import type { Square as ChessSquare } from 'chess.js';
import type { BoardSquare, Color, PieceType, PromotionPiece, Square, Uci } from '../types';

/** Opaque immutable-ish position handle. Only this module constructs one. */
export interface Position {
  readonly chess: Chess;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

function toChessColor(color: Color): 'w' | 'b' {
  return color === 'white' ? 'w' : 'b';
}

function fromChessColor(color: 'w' | 'b'): Color {
  return color === 'w' ? 'white' : 'black';
}

function isPromotionPiece(value: string): value is PromotionPiece {
  return value === 'q' || value === 'r' || value === 'b' || value === 'n';
}

/** Parses a UCI move like "e2e4" or "e7e8q" into its parts, or null if malformed. */
export function parseUci(uci: Uci): { from: Square; to: Square; promotion?: PromotionPiece } | null {
  if (uci.length !== 4 && uci.length !== 5) return null;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  if (from.length !== 2 || to.length !== 2) return null;
  if (uci.length === 5) {
    const promo = uci.slice(4, 5);
    if (!isPromotionPiece(promo)) return null;
    return { from, to, promotion: promo };
  }
  return { from, to };
}

/** Builds the UCI string for a move, appending the promotion suffix if given. */
export function toUci(from: Square, to: Square, promotion?: PromotionPiece): Uci {
  return promotion ? `${from}${to}${promotion}` : `${from}${to}`;
}

/**
 * Rebuilds a position from Lichess's `initialFen` (the literal string
 * "startpos" for a standard game) plus a UCI move list. This is the
 * authoritative re-derivation path used on every `gameState` event.
 * Malformed or illegal entries in `moves` are silently skipped rather than
 * thrown, since this is meant to never blow up across the module boundary.
 */
export function createPosition(initialFen: string, moves: Uci[]): Position {
  const chess = initialFen === 'startpos' ? new Chess() : new Chess(initialFen);
  for (const uci of moves) {
    const parsed = parseUci(uci);
    if (!parsed) continue;
    try {
      chess.move({
        from: parsed.from as ChessSquare,
        to: parsed.to as ChessSquare,
        promotion: parsed.promotion,
      });
    } catch {
      // Ignore an illegal/malformed entry in a trusted history; the position
      // simply stops advancing at that point rather than throwing.
    }
  }
  return { chess };
}

/** Current position FEN. */
export function positionFen(position: Position): string {
  return position.chess.fen();
}

/** Side to move. */
export function positionTurn(position: Position): Color {
  return fromChessColor(position.chess.turn());
}

/** Legal destination squares for the piece on `from`, or [] if none/empty/invalid. */
export function legalDestinations(position: Position, from: Square): Square[] {
  try {
    const moves = position.chess.moves({ square: from as ChessSquare, verbose: true });
    return moves.map((m) => m.to);
  } catch {
    return [];
  }
}

/** Whether from->to is a legal move in this position (ignoring promotion choice). */
export function isLegal(position: Position, from: Square, to: Square): boolean {
  return legalDestinations(position, from).includes(to);
}

/** True only when from->to is a pawn move reaching the last rank. */
export function needsPromotion(position: Position, from: Square, to: Square): boolean {
  try {
    const moves = position.chess.moves({ square: from as ChessSquare, verbose: true });
    return moves.some((m) => m.to === to && m.isPromotion());
  } catch {
    return false;
  }
}

/**
 * Applies a single UCI move to a position, returning a new Position.
 * Never throws: an illegal or malformed move returns null.
 */
export function applyUci(position: Position, uci: Uci): Position | null {
  const parsed = parseUci(uci);
  if (!parsed) return null;
  const next = new Chess(position.chess.fen());
  try {
    next.move({
      from: parsed.from as ChessSquare,
      to: parsed.to as ChessSquare,
      promotion: parsed.promotion,
    });
  } catch {
    return null;
  }
  return { chess: next };
}

/** Square of the king currently in check, or null if no one is in check. */
export function checkedKingSquare(position: Position): Square | null {
  if (!position.chess.isCheck()) return null;
  const sideToMove = position.chess.turn();
  const squares = position.chess.findPiece({ type: 'k', color: sideToMove });
  return squares[0] ?? null;
}

/**
 * 64 squares in render order (top-left first) for the given orientation:
 * white orientation starts at a8 and reads rank 8->1, file a->h (matching
 * a standard board diagram); black orientation starts at h1 and reads
 * rank 1->8, file h->a (the board rotated 180 degrees).
 */
export function boardSquares(position: Position, orientation: Color): BoardSquare[] {
  const ranks = orientation === 'white' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === 'white' ? FILES : [...FILES].reverse();
  const squares: BoardSquare[] = [];
  for (const rank of ranks) {
    for (const file of files) {
      const square: Square = `${file}${rank}`;
      const piece = position.chess.get(square as ChessSquare);
      squares.push({
        square,
        piece: piece ? { type: piece.type as PieceType, color: fromChessColor(piece.color) } : null,
      });
    }
  }
  return squares;
}

export { toChessColor };
