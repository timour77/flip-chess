import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClock } from '../src/ui/clock';
import { createControls } from '../src/ui/controls';
import type { ControlsHandlers } from '../src/ui/controls';
import type { GameView } from '../src/types';

function baseView(overrides: Partial<GameView> = {}): GameView {
  return {
    gameId: 'g1',
    myColor: 'white',
    fen: 'startpos',
    turn: 'white',
    myTurn: true,
    moves: [],
    lastMove: null,
    checkSquare: null,
    clocks: {
      white: { remainingMs: 60_000, running: true },
      black: { remainingMs: 60_000, running: false },
      syncedAt: 0,
      present: true,
    },
    status: 'started',
    finished: false,
    winner: null,
    drawOfferFromOpponent: false,
    drawOfferFromMe: false,
    opponent: { username: 'opp', rating: 1500 },
    pendingMove: null,
    ...overrides,
  };
}

function fireHold(button: HTMLElement, type: string): void {
  button.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true }));
}

describe('createClock', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
  });

  it('renders formatted text via the injected formatter', () => {
    const format = vi.fn((ms: number) => `F:${ms}`);
    const clock = createClock(root, { format });
    clock.update(12_345, true, false);
    expect(root.textContent).toBe('F:12345');
    expect(format).toHaveBeenLastCalledWith(12_345);
  });

  it('dims when not running', () => {
    const clock = createClock(root, { format: (ms) => String(ms) });
    clock.update(30_000, false, false);
    expect(root.classList.contains('clock-dim')).toBe(true);
    expect(root.classList.contains('clock-running')).toBe(false);
  });

  it('shows running state when running', () => {
    const clock = createClock(root, { format: (ms) => String(ms) });
    clock.update(30_000, true, false);
    expect(root.classList.contains('clock-running')).toBe(true);
    expect(root.classList.contains('clock-dim')).toBe(false);
  });

  it('applies the urgent/low-time treatment', () => {
    const clock = createClock(root, { format: (ms) => String(ms) });
    clock.update(9_000, true, true);
    expect(root.classList.contains('clock-low')).toBe(true);
  });

  it('does not apply low-time treatment when not flagged', () => {
    const clock = createClock(root, { format: (ms) => String(ms) });
    clock.update(9_000, true, false);
    expect(root.classList.contains('clock-low')).toBe(false);
  });
});

describe('createControls', () => {
  let root: HTMLElement;
  let handlers: ControlsHandlers;

  beforeEach(() => {
    vi.useFakeTimers();
    root = document.createElement('div');
    handlers = {
      onResign: vi.fn<() => void>(),
      onOfferDraw: vi.fn<() => void>(),
      onAcceptDraw: vi.fn<() => void>(),
      onDeclineDraw: vi.fn<() => void>(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires resign only after holding the full duration', () => {
    const controls = createControls(root, handlers);
    controls.update(baseView());
    const resignBtn = root.querySelector('.ctrl-resign') as HTMLButtonElement;

    fireHold(resignBtn, 'pointerdown');
    vi.advanceTimersByTime(599);
    expect(handlers.onResign).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(handlers.onResign).toHaveBeenCalledTimes(1);
  });

  it('does not fire resign on a quick tap', () => {
    const controls = createControls(root, handlers);
    controls.update(baseView());
    const resignBtn = root.querySelector('.ctrl-resign') as HTMLButtonElement;

    fireHold(resignBtn, 'pointerdown');
    vi.advanceTimersByTime(100);
    fireHold(resignBtn, 'pointerup');
    vi.advanceTimersByTime(1000);
    expect(handlers.onResign).not.toHaveBeenCalled();
  });

  it('does not fire resign when the pointer leaves the button', () => {
    const controls = createControls(root, handlers);
    controls.update(baseView());
    const resignBtn = root.querySelector('.ctrl-resign') as HTMLButtonElement;

    fireHold(resignBtn, 'pointerdown');
    vi.advanceTimersByTime(200);
    fireHold(resignBtn, 'pointerleave');
    vi.advanceTimersByTime(1000);
    expect(handlers.onResign).not.toHaveBeenCalled();
  });

  it('does not fire resign when the pointer is cancelled', () => {
    const controls = createControls(root, handlers);
    controls.update(baseView());
    const resignBtn = root.querySelector('.ctrl-resign') as HTMLButtonElement;

    fireHold(resignBtn, 'pointerdown');
    vi.advanceTimersByTime(200);
    fireHold(resignBtn, 'pointercancel');
    vi.advanceTimersByTime(1000);
    expect(handlers.onResign).not.toHaveBeenCalled();
  });

  it('fires offer-draw only after the full hold duration', () => {
    const controls = createControls(root, handlers);
    controls.update(baseView());
    const offerBtn = root.querySelector('.ctrl-draw-offer') as HTMLButtonElement;

    fireHold(offerBtn, 'pointerdown');
    vi.advanceTimersByTime(600);
    expect(handlers.onOfferDraw).toHaveBeenCalledTimes(1);
  });

  it('shows resign and offer-draw by default', () => {
    const controls = createControls(root, handlers);
    controls.update(baseView());
    const offerBtn = root.querySelector('.ctrl-draw-offer') as HTMLButtonElement;
    const acceptBtn = root.querySelector('.ctrl-accept') as HTMLButtonElement;
    const declineBtn = root.querySelector('.ctrl-decline') as HTMLButtonElement;

    expect(offerBtn.hidden).toBe(false);
    expect(acceptBtn.hidden).toBe(true);
    expect(declineBtn.hidden).toBe(true);
  });

  it('shows accept/decline as plain-tap buttons when the opponent offers a draw', () => {
    const controls = createControls(root, handlers);
    controls.update(baseView({ drawOfferFromOpponent: true }));
    const offerBtn = root.querySelector('.ctrl-draw-offer') as HTMLButtonElement;
    const acceptBtn = root.querySelector('.ctrl-accept') as HTMLButtonElement;
    const declineBtn = root.querySelector('.ctrl-decline') as HTMLButtonElement;

    expect(offerBtn.hidden).toBe(true);
    expect(acceptBtn.hidden).toBe(false);
    expect(declineBtn.hidden).toBe(false);

    acceptBtn.dispatchEvent(new Event('click', { bubbles: true }));
    expect(handlers.onAcceptDraw).toHaveBeenCalledTimes(1);

    declineBtn.dispatchEvent(new Event('click', { bubbles: true }));
    expect(handlers.onDeclineDraw).toHaveBeenCalledTimes(1);
  });

  it('disables the offer-draw button while our own offer stands', () => {
    const controls = createControls(root, handlers);
    controls.update(baseView({ drawOfferFromMe: true }));
    const offerBtn = root.querySelector('.ctrl-draw-offer') as HTMLButtonElement;
    expect(offerBtn.disabled).toBe(true);
  });

  it('disables everything when the game is finished', () => {
    const controls = createControls(root, handlers);
    controls.update(baseView({ finished: true }));
    const resignBtn = root.querySelector('.ctrl-resign') as HTMLButtonElement;
    const offerBtn = root.querySelector('.ctrl-draw-offer') as HTMLButtonElement;

    expect(resignBtn.disabled).toBe(true);
    expect(offerBtn.disabled).toBe(true);

    fireHold(resignBtn, 'pointerdown');
    vi.advanceTimersByTime(1000);
    expect(handlers.onResign).not.toHaveBeenCalled();
  });

  it('does not throw after destroy', () => {
    const controls = createControls(root, handlers);
    controls.update(baseView());
    controls.destroy();
    expect(root.textContent).toBe('');
  });
});
