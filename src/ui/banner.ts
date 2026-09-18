/**
 * Drives the transient status/error banner (`#banner` in index.html), used
 * for things like "Reconnecting…", "Rate limited", "Move rejected".
 */

export type BannerTone = 'error' | 'info';

export interface BannerHandle {
  /** Shows `text` with the given tone; auto-hides after `timeoutMs` if given. */
  show(text: string, tone: BannerTone, timeoutMs?: number): void;
  hide(): void;
  destroy(): void;
}

/** Wires up the existing `root` banner element (already in the DOM, `hidden`). */
export function createBanner(root: HTMLElement): BannerHandle {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function show(text: string, tone: BannerTone, timeoutMs?: number): void {
    clearTimer();
    root.textContent = text;
    root.dataset['tone'] = tone;
    root.hidden = false;

    if (timeoutMs !== undefined) {
      timer = setTimeout(() => {
        timer = null;
        hide();
      }, timeoutMs);
    }
  }

  function hide(): void {
    clearTimer();
    root.hidden = true;
    root.textContent = '';
  }

  function destroy(): void {
    clearTimer();
    root.hidden = true;
    root.textContent = '';
    delete root.dataset['tone'];
  }

  return { show, hide, destroy };
}
