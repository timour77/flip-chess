/**
 * End-of-game result screen. Renders into `#screen-result`.
 *
 * Per the design spec this shows briefly then returns to idle; the app
 * drives that timing (this module only renders and wires the button).
 */

import type { GameResult } from '../../types';

export interface ResultScreenHandlers {
  onDone(): void;
}

export interface ResultScreenHandle {
  show(result: GameResult): void;
  destroy(): void;
}

const OUTCOME_WORD: Record<GameResult['outcome'], string> = {
  win: 'Won',
  loss: 'Lost',
  draw: 'Draw',
  aborted: 'Aborted',
};

/** Mounts the result screen into `root` (`#screen-result`). */
export function createResultScreen(root: HTMLElement, handlers: ResultScreenHandlers): ResultScreenHandle {
  root.textContent = '';

  const wrap = document.createElement('div');
  wrap.className = 'result-screen';

  const outcome = document.createElement('h1');
  outcome.className = 'result-outcome';

  const reason = document.createElement('p');
  reason.className = 'result-reason';

  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'result-done';
  doneBtn.textContent = 'New game';
  const onDone = (): void => handlers.onDone();
  doneBtn.addEventListener('click', onDone);

  wrap.appendChild(outcome);
  wrap.appendChild(reason);
  wrap.appendChild(doneBtn);
  root.appendChild(wrap);

  function show(result: GameResult): void {
    outcome.textContent = OUTCOME_WORD[result.outcome];
    outcome.dataset['outcome'] = result.outcome;
    reason.textContent = result.reason;
  }

  function destroy(): void {
    doneBtn.removeEventListener('click', onDone);
    root.textContent = '';
  }

  return { show, destroy };
}
