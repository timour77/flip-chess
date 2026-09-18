/**
 * Idle/start screen: pick a time control and go looking for a game.
 * Renders into `#screen-idle`.
 */

import type { TimeControlPreset } from '../../types';

export interface IdleScreenOptions {
  presets: TimeControlPreset[];
  username: string;
  /** Initial state of the rated/casual toggle; defaults to false (casual). */
  initialRated?: boolean;
  onSeek(preset: TimeControlPreset, rated: boolean): void;
  /** Called whenever the rated/casual toggle changes, so the app can persist it. */
  onRatedChange?(rated: boolean): void;
  onChangeToken?(): void;
}

export interface IdleScreenHandle {
  /** Updates the displayed username (e.g. after re-validating a new token). */
  setUsername(username: string): void;
  destroy(): void;
}

/** Mounts the idle/start screen into `root` (`#screen-idle`). */
export function createIdleScreen(root: HTMLElement, opts: IdleScreenOptions): IdleScreenHandle {
  root.textContent = '';

  let rated = opts.initialRated ?? false;

  const wrap = document.createElement('div');
  wrap.className = 'idle-screen';

  const header = document.createElement('div');
  header.className = 'idle-header';

  const userLine = document.createElement('span');
  userLine.className = 'idle-username';
  userLine.textContent = opts.username;
  header.appendChild(userLine);

  const changeTokenBtn = document.createElement('button');
  changeTokenBtn.type = 'button';
  changeTokenBtn.className = 'idle-change-token';
  changeTokenBtn.textContent = 'Change token';
  const onChangeToken = (): void => opts.onChangeToken?.();
  changeTokenBtn.addEventListener('click', onChangeToken);
  header.appendChild(changeTokenBtn);

  const toggle = document.createElement('div');
  toggle.className = 'rated-toggle';
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', 'Rated or casual');

  const casualBtn = document.createElement('button');
  casualBtn.type = 'button';
  casualBtn.className = 'rated-toggle-btn';
  casualBtn.textContent = 'Casual';

  const ratedBtn = document.createElement('button');
  ratedBtn.type = 'button';
  ratedBtn.className = 'rated-toggle-btn';
  ratedBtn.textContent = 'Rated';

  function syncToggle(): void {
    casualBtn.classList.toggle('active', !rated);
    ratedBtn.classList.toggle('active', rated);
    casualBtn.setAttribute('aria-pressed', String(!rated));
    ratedBtn.setAttribute('aria-pressed', String(rated));
  }

  const onCasualClick = (): void => {
    if (rated) {
      rated = false;
      syncToggle();
      opts.onRatedChange?.(rated);
    }
  };
  const onRatedClick = (): void => {
    if (!rated) {
      rated = true;
      syncToggle();
      opts.onRatedChange?.(rated);
    }
  };
  casualBtn.addEventListener('click', onCasualClick);
  ratedBtn.addEventListener('click', onRatedClick);
  syncToggle();

  toggle.appendChild(casualBtn);
  toggle.appendChild(ratedBtn);

  const grid = document.createElement('div');
  grid.className = 'preset-grid';

  const tileCleanups: Array<() => void> = [];
  for (const preset of opts.presets) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'preset-tile';
    tile.textContent = preset.label;
    const onClick = (): void => opts.onSeek(preset, rated);
    tile.addEventListener('click', onClick);
    tileCleanups.push(() => tile.removeEventListener('click', onClick));
    grid.appendChild(tile);
  }

  wrap.appendChild(header);
  wrap.appendChild(toggle);
  wrap.appendChild(grid);
  root.appendChild(wrap);

  function setUsername(username: string): void {
    userLine.textContent = username;
  }

  function destroy(): void {
    changeTokenBtn.removeEventListener('click', onChangeToken);
    casualBtn.removeEventListener('click', onCasualClick);
    ratedBtn.removeEventListener('click', onRatedClick);
    for (const cleanup of tileCleanups) cleanup();
    root.textContent = '';
  }

  return { setUsername, destroy };
}
