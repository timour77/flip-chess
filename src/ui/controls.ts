/**
 * The in-game control row: resign, offer/accept draw.
 *
 * UX decision — hold-to-confirm instead of a confirm dialog:
 * The design spec explicitly leaves "resign/draw-offer confirmation UX
 * (accidental-tap protection)" open. A modal confirm dialog is a poor fit
 * for a ~350px folded-phone screen: it is itself two more small buttons to
 * hit, one of which ("Cancel") is a second misfire waiting to happen, and it
 * steals a whole extra tap-and-look cycle from a device you're glancing at.
 * Instead, resigning and offering a draw require a press-and-hold of
 * ~600ms on the button itself, with a visible fill animation that tracks
 * progress. A stray tap (the dominant failure mode on a small, imprecise
 * touch surface) can't hold for 600ms, and dragging/scrolling off the
 * button (pointerleave/pointercancel) aborts it — so there is no separate
 * "undo" surface to mis-tap. Accepting or declining an opponent's draw
 * offer is a plain tap: the user is responding deliberately to something
 * that appeared on screen, not fat-fingering a button that was always there.
 */

import type { GameView } from '../types';
import { iconElement } from './icons';
import type { IconName } from './icons';

const HOLD_MS = 600;

export interface ControlsHandlers {
  onResign(): void;
  onOfferDraw(): void;
  onAcceptDraw(): void;
  onDeclineDraw(): void;
}

export interface ControlsHandle {
  /** Reflects the current game state into the control row. */
  update(view: GameView): void;
  destroy(): void;
}

/** Wires a press-and-hold-to-confirm gesture onto `button`; see file header. */
function attachHoldToConfirm(button: HTMLButtonElement, onConfirm: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    button.classList.remove('holding');
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (button.disabled) return;
    event.preventDefault();
    button.classList.add('holding');
    timer = setTimeout(() => {
      timer = null;
      button.classList.remove('holding');
      onConfirm();
    }, HOLD_MS);
  };

  button.addEventListener('pointerdown', onPointerDown);
  button.addEventListener('pointerup', cancel);
  button.addEventListener('pointerleave', cancel);
  button.addEventListener('pointercancel', cancel);

  return () => {
    cancel();
    button.removeEventListener('pointerdown', onPointerDown);
    button.removeEventListener('pointerup', cancel);
    button.removeEventListener('pointerleave', cancel);
    button.removeEventListener('pointercancel', cancel);
  };
}

interface HoldButton {
  button: HTMLButtonElement;
  label: HTMLSpanElement;
}

function makeHoldButton(label: string, extraClass: string, icon: IconName): HoldButton {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `ctrl-btn hold-btn ${extraClass}`;

  const fill = document.createElement('span');
  fill.className = 'hold-fill';
  button.appendChild(fill);

  const text = document.createElement('span');
  text.className = 'ctrl-label';
  text.appendChild(iconElement(icon));
  button.appendChild(text);
  // The word lives here rather than on screen: the strip is too narrow for it.
  button.setAttribute('aria-label', label);
  button.title = label;

  return { button, label: text };
}

function makeTapButton(label: string, extraClass: string, icon: IconName): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `ctrl-btn ${extraClass}`;
  button.appendChild(iconElement(icon));
  button.setAttribute('aria-label', label);
  button.title = label;
  return button;
}

/** Mounts the control row into `root` (`#controls`). */
export function createControls(root: HTMLElement, handlers: ControlsHandlers): ControlsHandle {
  root.textContent = '';

  const row = document.createElement('div');
  row.className = 'controls-row';

  const resign = makeHoldButton('Resign', 'ctrl-resign', 'flag');
  const drawOffer = makeHoldButton('Offer draw', 'ctrl-draw-offer', 'scales');
  const resignBtn = resign.button;
  const drawOfferBtn = drawOffer.button;
  const acceptBtn = makeTapButton('Accept draw', 'ctrl-accept', 'check');
  const declineBtn = makeTapButton('Decline draw', 'ctrl-decline', 'cross');

  const cleanupResign = attachHoldToConfirm(resignBtn, handlers.onResign);
  const cleanupOffer = attachHoldToConfirm(drawOfferBtn, handlers.onOfferDraw);

  const onAcceptClick = (): void => {
    if (!acceptBtn.disabled) handlers.onAcceptDraw();
  };
  const onDeclineClick = (): void => {
    if (!declineBtn.disabled) handlers.onDeclineDraw();
  };
  acceptBtn.addEventListener('click', onAcceptClick);
  declineBtn.addEventListener('click', onDeclineClick);

  const drawGroup = document.createElement('div');
  drawGroup.className = 'draw-group';
  drawGroup.appendChild(drawOfferBtn);
  drawGroup.appendChild(acceptBtn);
  drawGroup.appendChild(declineBtn);

  row.appendChild(resignBtn);
  row.appendChild(drawGroup);
  root.appendChild(row);

  function setDisabled(disabled: boolean): void {
    resignBtn.disabled = disabled;
    drawOfferBtn.disabled = disabled;
    acceptBtn.disabled = disabled;
    declineBtn.disabled = disabled;
  }

  function update(view: GameView): void {
    if (view.finished) {
      setDisabled(true);
      resignBtn.hidden = false;
      drawOfferBtn.hidden = false;
      acceptBtn.hidden = true;
      declineBtn.hidden = true;
      return;
    }

    resignBtn.disabled = false;

    if (view.drawOfferFromOpponent) {
      // Three icon buttons fit the strip comfortably, so resigning stays
      // available while an offer is pending.
      resignBtn.hidden = false;
      drawOfferBtn.hidden = true;
      acceptBtn.hidden = false;
      declineBtn.hidden = false;
      acceptBtn.disabled = false;
      declineBtn.disabled = false;
      return;
    }

    resignBtn.hidden = false;
    drawOfferBtn.hidden = false;
    acceptBtn.hidden = true;
    declineBtn.hidden = true;

    if (view.drawOfferFromMe) {
      drawOfferBtn.disabled = true;
      drawOfferBtn.classList.add('pending');
      drawOfferBtn.setAttribute('aria-label', 'Draw offered');
      drawOfferBtn.title = 'Draw offered';
    } else {
      drawOfferBtn.disabled = false;
      drawOfferBtn.classList.remove('pending');
      drawOfferBtn.setAttribute('aria-label', 'Offer draw');
      drawOfferBtn.title = 'Offer draw';
    }
  }

  function destroy(): void {
    cleanupResign();
    cleanupOffer();
    acceptBtn.removeEventListener('click', onAcceptClick);
    declineBtn.removeEventListener('click', onDeclineClick);
    root.textContent = '';
  }

  return { update, destroy };
}
