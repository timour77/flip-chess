/**
 * Turn notification: vibrate when it becomes the player's turn, and keep the
 * screen awake while a game is live.
 *
 * Both APIs are best-effort. The Vibration API is unavailable on iOS and is
 * gated behind a prior user gesture in Chrome; the Screen Wake Lock API is
 * unavailable in some browsers and its lock is dropped whenever the page is
 * hidden. Neither failure is worth surfacing to the user — the game still
 * works, it just nags less.
 */

/** Short double-buzz: distinct from a notification, cheap on battery. */
const TURN_PATTERN = [120, 60, 120];

export function vibrateTurn(): void {
  try {
    navigator.vibrate?.(TURN_PATTERN);
  } catch {
    /* unsupported or blocked */
  }
}

export function vibrateGameOver(): void {
  try {
    navigator.vibrate?.([250]);
  } catch {
    /* unsupported or blocked */
  }
}

interface WakeLockLike {
  release(): Promise<void>;
  released: boolean;
}

let wakeLock: WakeLockLike | null = null;
let wakeLockWanted = false;

async function acquire(): Promise<void> {
  const wl = (navigator as Navigator & {
    wakeLock?: { request(type: 'screen'): Promise<WakeLockLike> };
  }).wakeLock;
  if (!wl || wakeLock) return;
  try {
    wakeLock = await wl.request('screen');
  } catch {
    wakeLock = null;
  }
}

/**
 * Hold a screen wake lock for the duration of a game. The browser releases the
 * lock whenever the page is hidden, so re-acquire on visibility change for as
 * long as the lock is still wanted.
 */
export function keepScreenAwake(enabled: boolean): void {
  wakeLockWanted = enabled;
  if (enabled) {
    void acquire();
  } else if (wakeLock) {
    void wakeLock.release().catch(() => undefined);
    wakeLock = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeLockWanted) {
    wakeLock = null;
    void acquire();
  }
});
