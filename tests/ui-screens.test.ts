import { describe, it, expect, vi } from 'vitest';
import { createTokenScreen } from '../src/ui/screens/token';
import { createIdleScreen } from '../src/ui/screens/idle';
import { TIME_CONTROLS } from '../src/config';
import { createSeekingScreen } from '../src/ui/screens/seeking';
import { createResultScreen } from '../src/ui/screens/result';
import type { GameResult, TimeControlPreset } from '../src/types';

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createTokenScreen', () => {
  it('submits the entered token and shows the error string onSubmit resolves with', async () => {
    const root = document.createElement('div');
    const onSubmit = vi.fn().mockResolvedValue('Invalid token');
    createTokenScreen(root, { onSubmit });

    const input = root.querySelector('.token-input') as HTMLInputElement;
    const form = root.querySelector('.token-form') as HTMLFormElement;
    input.value = 'lip_abc123';

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushMicrotasks();

    expect(onSubmit).toHaveBeenCalledWith('lip_abc123');
    const error = root.querySelector('.token-error') as HTMLElement;
    expect(error.hidden).toBe(false);
    expect(error.textContent).toBe('Invalid token');
  });

  it('shows no error and re-enables the form on success', async () => {
    const root = document.createElement('div');
    const onSubmit = vi.fn().mockResolvedValue(null);
    createTokenScreen(root, { onSubmit });

    const input = root.querySelector('.token-input') as HTMLInputElement;
    const form = root.querySelector('.token-form') as HTMLFormElement;
    input.value = 'lip_good';

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushMicrotasks();

    const error = root.querySelector('.token-error') as HTMLElement;
    expect(error.hidden).toBe(true);
    const submit = root.querySelector('.token-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it('disables input and button while validating', async () => {
    const root = document.createElement('div');
    let resolveSubmit: (v: string | null) => void = () => {};
    const onSubmit = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    createTokenScreen(root, { onSubmit });

    const input = root.querySelector('.token-input') as HTMLInputElement;
    const form = root.querySelector('.token-form') as HTMLFormElement;
    input.value = 'lip_pending';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushMicrotasks();

    const submit = root.querySelector('.token-submit') as HTMLButtonElement;
    expect(input.disabled).toBe(true);
    expect(submit.disabled).toBe(true);

    resolveSubmit(null);
    await flushMicrotasks();
    expect(input.disabled).toBe(false);
  });

  it('rejects an empty token without calling onSubmit', () => {
    const root = document.createElement('div');
    const onSubmit = vi.fn().mockResolvedValue(null);
    createTokenScreen(root, { onSubmit });

    const form = root.querySelector('.token-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(onSubmit).not.toHaveBeenCalled();
    const error = root.querySelector('.token-error') as HTMLElement;
    expect(error.hidden).toBe(false);
  });
});

describe('createIdleScreen', () => {
  it('invokes onSeek with the tapped preset and the current rated flag', () => {
    const root = document.createElement('div');
    const onSeek = vi.fn();
    createIdleScreen(root, {
      presets: TIME_CONTROLS,
      username: 'tester',
      onSeek,
    });

    const tiles = root.querySelectorAll('.preset-tile');
    expect(tiles.length).toBe(TIME_CONTROLS.length);

    const blitzTile = tiles[2] as HTMLButtonElement; // 3+2 Blitz
    blitzTile.dispatchEvent(new Event('click', { bubbles: true }));

    expect(onSeek).toHaveBeenCalledTimes(1);
    const [preset, rated] = onSeek.mock.calls[0] as [TimeControlPreset, boolean];
    expect(preset).toEqual(TIME_CONTROLS[2]);
    expect(rated).toBe(false);
  });

  it('passes the toggled rated flag to onSeek and reports the change', () => {
    const root = document.createElement('div');
    const onSeek = vi.fn();
    const onRatedChange = vi.fn();
    createIdleScreen(root, {
      presets: TIME_CONTROLS,
      username: 'tester',
      onSeek,
      onRatedChange,
    });

    const ratedBtn = root.querySelectorAll('.rated-toggle-btn')[1] as HTMLButtonElement;
    ratedBtn.dispatchEvent(new Event('click', { bubbles: true }));
    expect(onRatedChange).toHaveBeenCalledWith(true);

    const firstTile = root.querySelector('.preset-tile') as HTMLButtonElement;
    firstTile.dispatchEvent(new Event('click', { bubbles: true }));
    const [, rated] = onSeek.mock.calls[0] as [TimeControlPreset, boolean];
    expect(rated).toBe(true);
  });

  it('shows the username and calls onChangeToken', () => {
    const root = document.createElement('div');
    const onChangeToken = vi.fn();
    createIdleScreen(root, {
      presets: TIME_CONTROLS,
      username: 'tester',
      onSeek: vi.fn(),
      onChangeToken,
    });

    expect(root.querySelector('.idle-username')?.textContent).toBe('tester');
    const changeBtn = root.querySelector('.idle-change-token') as HTMLButtonElement;
    changeBtn.dispatchEvent(new Event('click', { bubbles: true }));
    expect(onChangeToken).toHaveBeenCalledTimes(1);
  });
});

describe('createSeekingScreen', () => {
  it('calls onCancel when the cancel button is tapped', () => {
    const root = document.createElement('div');
    const onCancel = vi.fn();
    const screen = createSeekingScreen(root, { onCancel });

    const preset = TIME_CONTROLS[0] as TimeControlPreset;
    screen.render(preset, true);
    expect(root.querySelector('.seeking-detail')?.textContent).toContain(preset.label);
    expect(root.querySelector('.seeking-detail')?.textContent).toContain('Rated');

    const cancelBtn = root.querySelector('.seeking-cancel') as HTMLButtonElement;
    cancelBtn.dispatchEvent(new Event('click', { bubbles: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('createResultScreen', () => {
  function result(outcome: GameResult['outcome'], reason: string): GameResult {
    return { outcome, reason };
  }

  it('renders a win', () => {
    const root = document.createElement('div');
    const screen = createResultScreen(root, { onDone: vi.fn() });
    screen.show(result('win', 'Opponent resigned'));
    expect(root.querySelector('.result-outcome')?.textContent).toBe('Won');
    expect(root.querySelector('.result-reason')?.textContent).toBe('Opponent resigned');
  });

  it('renders a loss', () => {
    const root = document.createElement('div');
    const screen = createResultScreen(root, { onDone: vi.fn() });
    screen.show(result('loss', 'Checkmate'));
    expect(root.querySelector('.result-outcome')?.textContent).toBe('Lost');
  });

  it('renders a draw', () => {
    const root = document.createElement('div');
    const screen = createResultScreen(root, { onDone: vi.fn() });
    screen.show(result('draw', 'Agreed draw'));
    expect(root.querySelector('.result-outcome')?.textContent).toBe('Draw');
  });

  it('renders an aborted game and wires the New game button', () => {
    const root = document.createElement('div');
    const onDone = vi.fn();
    const screen = createResultScreen(root, { onDone });
    screen.show(result('aborted', 'Game aborted'));
    expect(root.querySelector('.result-outcome')?.textContent).toBe('Aborted');

    const doneBtn = root.querySelector('.result-done') as HTMLButtonElement;
    doneBtn.dispatchEvent(new Event('click', { bubbles: true }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
