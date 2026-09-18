/**
 * Promotion piece picker, mounted into `#promotion` (starts `hidden` in
 * index.html). Decides the open design question from the spec ("promotion
 * piece picker UI on a very small touch target") as a full-width bottom
 * sheet with four large (>=64px tall) labelled targets, rather than a
 * cramped 4-in-a-row of tiny squares.
 *
 * Resolves `null` on backdrop tap or Escape, so the caller can treat a
 * cancelled promotion the same as an abandoned move.
 */

import type { Color, PromotionPiece } from '../types';
import { pieceElement } from './pieces';

export interface PromotionPicker {
  /** Shows the picker for `color`; resolves the chosen piece, or `null` if cancelled. */
  ask(color: Color): Promise<PromotionPiece | null>;
}

const CHOICES: PromotionPiece[] = ['q', 'r', 'b', 'n'];
const LABELS: Record<PromotionPiece, string> = {
  q: 'Queen',
  r: 'Rook',
  b: 'Bishop',
  n: 'Knight',
};

function isPromotionPiece(value: string | undefined): value is PromotionPiece {
  return value === 'q' || value === 'r' || value === 'b' || value === 'n';
}

export function createPromotionPicker(root: HTMLElement): PromotionPicker {
  root.classList.add('promotion');
  root.innerHTML = '';

  const sheet = document.createElement('div');
  sheet.className = 'promotion__sheet';
  root.appendChild(sheet);

  const icons = new Map<PromotionPiece, HTMLElement>();
  for (const piece of CHOICES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'promotion__option';
    btn.dataset.piece = piece;

    const icon = document.createElement('span');
    icon.className = 'promotion__icon';
    btn.appendChild(icon);
    icons.set(piece, icon);

    const label = document.createElement('span');
    label.className = 'promotion__label';
    label.textContent = LABELS[piece];
    btn.appendChild(label);

    sheet.appendChild(btn);
  }

  let pending: ((choice: PromotionPiece | null) => void) | null = null;

  function close(choice: PromotionPiece | null): void {
    if (!pending) return;
    const resolve = pending;
    pending = null;
    root.hidden = true;
    document.removeEventListener('keydown', onKeydown);
    resolve(choice);
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') close(null);
  }

  root.addEventListener('click', (event) => {
    // Backdrop tap: only fires when the click target is the overlay itself,
    // not a descendant (the sheet and its buttons stop being "the backdrop").
    if (event.target === root) close(null);
  });

  sheet.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest('button[data-piece]');
    if (!(btn instanceof HTMLButtonElement)) return;
    if (isPromotionPiece(btn.dataset.piece)) {
      close(btn.dataset.piece);
    }
  });

  function ask(color: Color): Promise<PromotionPiece | null> {
    if (pending) close(null);
    for (const piece of CHOICES) {
      const icon = icons.get(piece);
      if (icon) icon.replaceChildren(pieceElement(piece, color));
    }
    root.hidden = false;
    document.addEventListener('keydown', onKeydown);
    return new Promise((resolve) => {
      pending = resolve;
    });
  }

  return { ask };
}
