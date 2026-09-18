/**
 * A single clock readout, mounted into `#clock-own` or `#clock-opponent`
 * (index.html creates both elements; the app calls `createClock` once per
 * element). Purely presentational: it never computes remaining time itself —
 * the caller pushes already-computed milliseconds plus a formatter.
 */

export interface ClockOptions {
  /** Formats remaining milliseconds into the text shown, e.g. "3:24" or "0:09". */
  format: (ms: number) => string;
}

export interface ClockHandle {
  /**
   * @param ms milliseconds remaining, already computed by the caller.
   * @param running whether this side's clock is currently counting down.
   * @param lowTime whether to render the urgent/low-time treatment.
   */
  update(ms: number, running: boolean, lowTime: boolean): void;
  destroy(): void;
}

/** Mounts a clock readout into `root` and returns a handle to update it. */
export function createClock(root: HTMLElement, opts: ClockOptions): ClockHandle {
  root.textContent = '';

  const digits = document.createElement('span');
  digits.className = 'clock-digits';
  digits.textContent = opts.format(0);
  root.appendChild(digits);

  function update(ms: number, running: boolean, lowTime: boolean): void {
    digits.textContent = opts.format(ms);
    root.classList.toggle('clock-running', running);
    root.classList.toggle('clock-dim', !running);
    root.classList.toggle('clock-low', lowTime);
  }

  function destroy(): void {
    root.textContent = '';
    root.classList.remove('clock-running', 'clock-dim', 'clock-low');
  }

  return { update, destroy };
}
