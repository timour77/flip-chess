/**
 * "Waiting for an opponent…" screen shown while a seek is open.
 * Renders into `#screen-seeking`.
 */

import type { TimeControlPreset } from '../../types';

export interface SeekingScreenHandlers {
  onCancel(): void;
}

export interface SeekingScreenHandle {
  /** Displays the time control being sought. Call each time a seek starts. */
  render(preset: TimeControlPreset, rated: boolean): void;
  destroy(): void;
}

/** Mounts the seeking screen into `root` (`#screen-seeking`). */
export function createSeekingScreen(root: HTMLElement, handlers: SeekingScreenHandlers): SeekingScreenHandle {
  root.textContent = '';

  const wrap = document.createElement('div');
  wrap.className = 'seeking-screen';

  const indicator = document.createElement('div');
  indicator.className = 'seeking-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'seeking-dot';
    indicator.appendChild(dot);
  }

  const status = document.createElement('p');
  status.className = 'seeking-status';
  status.textContent = 'Waiting for an opponent…';

  const detail = document.createElement('p');
  detail.className = 'seeking-detail';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'seeking-cancel';
  cancelBtn.textContent = 'Cancel';
  const onCancel = (): void => handlers.onCancel();
  cancelBtn.addEventListener('click', onCancel);

  wrap.appendChild(indicator);
  wrap.appendChild(status);
  wrap.appendChild(detail);
  wrap.appendChild(cancelBtn);
  root.appendChild(wrap);

  function render(preset: TimeControlPreset, rated: boolean): void {
    detail.textContent = `${preset.label} · ${rated ? 'Rated' : 'Casual'}`;
  }

  function destroy(): void {
    cancelBtn.removeEventListener('click', onCancel);
    root.textContent = '';
  }

  return { render, destroy };
}
