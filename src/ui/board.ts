/**
 * Board renderer: an 8x8 grid of squares mounted once into `root`, mutated
 * in place on every `render()`. Purely presentational — legal-move
 * computation is handed in via `BoardHandlers`, wired by the caller to
 * chess.js. This module never imports the game/chess engine.
 *
 * Interaction is tap-to-select / tap-to-move (no drag), matching a cover
 * screen where dragging is unreliable:
 *   1. Tap an own piece -> select it, highlight `legalDestinations`.
 *   2. Tap a highlighted destination -> `onMove` (via the promotion picker
 *      first when `needsPromotion` says so).
 *   3. Tap another own piece -> re-select.
 *   4. Tap anything else -> clear selection.
 * All input is ignored when it isn't the player's turn, the game is
 * finished, or `setInteractive(false)` was called.
 */

import type { Color, GameView, PieceType, PromotionPiece, Square } from '../types';
import { pieceElement } from './pieces';

/** Handlers the app wires to the chess engine and the promotion picker. */
export interface BoardHandlers {
  /** Legal destination squares for the piece on `square` (empty if none/not selectable). */
  legalDestinations(square: Square): Square[];
  /** Whether the from -> to move requires a promotion choice. */
  needsPromotion(from: Square, to: Square): boolean;
  /** Prompts for a promotion piece (typically backed by `createPromotionPicker`). Resolves `null` on cancel. */
  askPromotion(color: Color): Promise<PromotionPiece | null>;
  /** A legal (and, if needed, promotion-resolved) move the player chose. */
  onMove(from: Square, to: Square, promotion?: PromotionPiece): void;
}

export interface BoardHandle {
  /** Draws the given position, orientation and highlights. Clears any in-progress selection. */
  render(view: GameView): void;
  /** Enables/disables tap handling without touching what's drawn. */
  setInteractive(enabled: boolean): void;
  /** Clears the current selection/destination highlights, if any. */
  clearSelection(): void;
}

interface SquareRefs {
  el: HTMLDivElement;
  underlay: HTMLDivElement;
  marker: HTMLDivElement;
  pieceKey: string;
}

type BoardMap = Map<Square, { type: PieceType; color: Color }>;

function fileIndexOf(square: Square): number {
  return square.charCodeAt(0) - 97;
}

function rankOf(square: Square): number {
  return Number(square.charAt(1));
}

/** Parses the piece-placement field of a FEN into a square -> piece map. */
function parseFen(fen: string): BoardMap {
  const map: BoardMap = new Map();
  const placement = fen.split(' ')[0] ?? '';
  const ranks = placement.split('/');
  for (let r = 0; r < ranks.length && r < 8; r++) {
    const rankStr = ranks[r] ?? '';
    const rank = 8 - r;
    let file = 0;
    for (const ch of rankStr) {
      if (ch >= '1' && ch <= '8') {
        file += Number(ch);
        continue;
      }
      const color: Color = ch === ch.toUpperCase() ? 'white' : 'black';
      const type = ch.toLowerCase() as PieceType;
      const square = `${String.fromCharCode(97 + file)}${rank}`;
      map.set(square, { type, color });
      file += 1;
    }
  }
  return map;
}

function createSquareEls(square: Square): SquareRefs {
  const el = document.createElement('div');
  el.className = 'square';
  el.classList.add((fileIndexOf(square) + rankOf(square)) % 2 === 0 ? 'light' : 'dark');
  el.dataset.square = square;

  const underlay = document.createElement('div');
  underlay.className = 'sq-underlay';
  const marker = document.createElement('div');
  marker.className = 'sq-marker';
  el.append(underlay, marker);

  return { el, underlay, marker, pieceKey: '' };
}

export function createBoard(root: HTMLElement, handlers: BoardHandlers): BoardHandle {
  root.classList.add('board');
  root.innerHTML = '';

  const squares = new Map<Square, SquareRefs>();
  for (let rank = 1; rank <= 8; rank++) {
    for (let fileIdx = 0; fileIdx < 8; fileIdx++) {
      const square = `${String.fromCharCode(97 + fileIdx)}${rank}`;
      const refs = createSquareEls(square);
      squares.set(square, refs);
      root.appendChild(refs.el);
    }
  }

  let currentView: GameView | null = null;
  let boardMap: BoardMap = new Map();
  let interactive = true;
  let selected: Square | null = null;
  /** Destination square -> true if it's a capture (ring marker) vs a quiet move (dot marker). */
  let destinations = new Map<Square, boolean>();

  function isActive(): boolean {
    return interactive && currentView !== null && currentView.myTurn && !currentView.finished;
  }

  function layoutSquare(square: Square, orientation: Color): void {
    const refs = squares.get(square);
    if (!refs) return;
    const fileIdx = fileIndexOf(square);
    const rank = rankOf(square);
    const col = orientation === 'white' ? fileIdx + 1 : 8 - fileIdx;
    const row = orientation === 'white' ? 9 - rank : rank;
    refs.el.style.gridColumnStart = String(col);
    refs.el.style.gridRowStart = String(row);
  }

  function updatePiece(square: Square): void {
    const refs = squares.get(square);
    if (!refs) return;
    const piece = boardMap.get(square) ?? null;
    const key = piece ? `${piece.color}-${piece.type}` : '';
    if (key === refs.pieceKey) return;
    refs.pieceKey = key;
    const existing = refs.el.querySelector('svg.piece-svg');
    if (existing) existing.remove();
    if (piece) {
      refs.el.appendChild(pieceElement(piece.type, piece.color));
    }
  }

  function applyHighlights(): void {
    const lastMove = currentView?.lastMove ?? null;
    const checkSquare = currentView?.checkSquare ?? null;
    for (const [square, refs] of squares) {
      let underlayClass = '';
      if (checkSquare === square) {
        underlayClass = 'is-check';
      } else if (selected === square) {
        underlayClass = 'is-selected';
      } else if (lastMove && (lastMove.from === square || lastMove.to === square)) {
        underlayClass = 'is-last-move';
      }
      refs.underlay.className = underlayClass ? `sq-underlay ${underlayClass}` : 'sq-underlay';

      const dest = destinations.get(square);
      let markerClass = '';
      if (dest === true) {
        markerClass = 'is-capture';
      } else if (dest === false) {
        markerClass = 'is-move';
      }
      refs.marker.className = markerClass ? `sq-marker ${markerClass}` : 'sq-marker';
    }
  }

  function clearSelectionInternal(): void {
    selected = null;
    destinations = new Map();
    applyHighlights();
  }

  function select(square: Square): void {
    selected = square;
    const next = new Map<Square, boolean>();
    for (const dest of handlers.legalDestinations(square)) {
      next.set(dest, boardMap.has(dest));
    }
    destinations = next;
    applyHighlights();
  }

  function attemptMove(from: Square, to: Square): void {
    clearSelectionInternal();
    if (handlers.needsPromotion(from, to)) {
      const color = currentView?.myColor ?? 'white';
      void handlers.askPromotion(color).then((promotion) => {
        if (promotion) {
          handlers.onMove(from, to, promotion);
        }
      });
    } else {
      handlers.onMove(from, to);
    }
  }

  function handleTap(square: Square): void {
    if (!isActive()) return;
    const view = currentView;
    if (!view) return;

    if (selected && destinations.has(square)) {
      attemptMove(selected, square);
      return;
    }

    const piece = boardMap.get(square);
    if (piece && piece.color === view.myColor) {
      select(square);
    } else {
      clearSelectionInternal();
    }
  }

  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const squareEl = target.closest<HTMLElement>('.square');
    if (!squareEl) return; // tap landed between squares (or outside any) — ignore
    const square = squareEl.dataset.square;
    if (!square) return;
    handleTap(square);
  });

  function render(view: GameView): void {
    currentView = view;
    boardMap = parseFen(view.fen);
    selected = null;
    destinations = new Map();
    for (const square of squares.keys()) {
      layoutSquare(square, view.myColor);
      updatePiece(square);
    }
    applyHighlights();
  }

  function setInteractive(enabled: boolean): void {
    interactive = enabled;
    root.classList.toggle('board--disabled', !enabled);
    if (!enabled) {
      clearSelectionInternal();
    }
  }

  function clearSelection(): void {
    clearSelectionInternal();
  }

  return { render, setInteractive, clearSelection };
}
