/**
 * Application wiring.
 *
 * This is the only module that sees all three layers: it pulls events off the
 * Lichess streams, feeds them to the game store, and renders the store's
 * snapshots through the UI. `ui/` never talks to `lichess/`, and `game/` never
 * touches the DOM — the traffic between them all passes through here.
 */

import { LichessHttpClient } from './lichess';
import {
  colorFor,
  createGameStore,
  createPosition,
  describeResult,
  formatClock,
  legalDestinations as legalDestinationsFor,
  needsPromotion as needsPromotionFor,
  readClock,
  toUci,
} from './game';
import { createBoard } from './ui/board';
import { createPromotionPicker } from './ui/promotion';
import { createClock } from './ui/clock';
import { createControls } from './ui/controls';
import { createBanner } from './ui/banner';
import { createTokenScreen } from './ui/screens/token';
import { createIdleScreen } from './ui/screens/idle';
import { createSeekingScreen } from './ui/screens/seeking';
import { createResultScreen } from './ui/screens/result';
import { clearToken, loadRated, loadToken, saveRated, saveToken } from './storage';
import { keepScreenAwake, vibrateGameOver, vibrateTurn } from './notify';
import {
  LOW_TIME_MS,
  RESULT_SCREEN_MS,
  TIME_CONTROLS,
  isSeekableOnBoardApi,
} from './config';
import { LichessError } from './types';
import type {
  Color,
  GameStatus,
  LichessAccount,
  ScreenName,
  StreamHandle,
  TimeControlPreset,
} from './types';

/** How often the clocks repaint between server syncs: fine enough for tenths. */
const CLOCK_TICK_MS = 100;

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
}

export function startApp(): void {
  const screens: Record<ScreenName, HTMLElement> = {
    token: el('screen-token'),
    idle: el('screen-idle'),
    seeking: el('screen-seeking'),
    game: el('screen-game'),
    result: el('screen-result'),
  };

  const banner = createBanner(el('banner'));
  const store = createGameStore();

  let client: LichessHttpClient | null = null;
  let account: LichessAccount | null = null;
  let eventStream: StreamHandle | null = null;
  let gameStream: StreamHandle | null = null;
  let seekAbort: AbortController | null = null;
  let clockTimer: ReturnType<typeof setInterval> | null = null;
  let resultTimer: ReturnType<typeof setTimeout> | null = null;
  let activeGameId: string | null = null;
  let rated = loadRated();

  function show(screen: ScreenName): void {
    for (const [name, node] of Object.entries(screens)) {
      if (name === screen) node.setAttribute('data-active', '');
      else node.removeAttribute('data-active');
    }
  }

  /* ---------------------------------------------------------------- *
   * Board + in-game chrome
   * ---------------------------------------------------------------- */

  const promotion = createPromotionPicker(el('promotion'));

  const board = createBoard(el('board'), {
    legalDestinations(square) {
      const view = store.get();
      if (!view) return [];
      return legalDestinationsFor(createPosition(view.fen, []), square);
    },
    needsPromotion(from, to) {
      const view = store.get();
      if (!view) return false;
      return needsPromotionFor(createPosition(view.fen, []), from, to);
    },
    async onMove(from, to, piece) {
      const view = store.get();
      if (!view || !client || !activeGameId) return;
      const uci = toUci(from, to, piece);
      // Optimistic: show the move immediately, then let the server confirm it.
      // On a cover screen the round-trip is long enough to feel broken.
      store.setPendingMove(uci);
      render();
      try {
        await client.move(activeGameId, uci);
      } catch (error) {
        store.revertPendingMove();
        render();
        reportError(error, 'Move rejected');
      }
    },
    askPromotion: (color: Color) => promotion.ask(color),
  });

  const ownClock = createClock(el('clock-own'), { format: formatClock });
  const opponentClock = createClock(el('clock-opponent'), { format: formatClock });

  const controls = createControls(el('controls'), {
    onResign: () => act((c, id) => c.resign(id), 'Could not resign'),
    onOfferDraw: () => act((c, id) => c.draw(id, true), 'Could not offer a draw'),
    onAcceptDraw: () => act((c, id) => c.draw(id, true), 'Could not accept the draw'),
    onDeclineDraw: () => act((c, id) => c.draw(id, false), 'Could not decline the draw'),
  });

  function act(
    run: (client: LichessHttpClient, gameId: string) => Promise<void>,
    failure: string,
  ): void {
    if (!client || !activeGameId) return;
    run(client, activeGameId).catch((error) => reportError(error, failure));
  }

  /* ---------------------------------------------------------------- *
   * Screens
   * ---------------------------------------------------------------- */

  const tokenScreen = createTokenScreen(screens.token, {
    async onSubmit(token) {
      const probe = new LichessHttpClient(token);
      try {
        const who = await probe.getAccount();
        saveToken(token);
        await signIn(token, who);
        return null;
      } catch (error) {
        if (error instanceof LichessError && error.kind === 'unauthorized') {
          return 'Lichess rejected that token. Check it has the board:play scope.';
        }
        return 'Could not reach Lichess. Check your connection and try again.';
      }
    },
  });

  const idleScreen = createIdleScreen(screens.idle, {
    presets: TIME_CONTROLS,
    username: '',
    initialRated: rated,
    onSeek: (preset, isRated) => void startSeek(preset, isRated),
    onRatedChange(next) {
      rated = next;
      saveRated(next);
    },
    onChangeToken: () => signOut(),
  });

  const seekingScreen = createSeekingScreen(screens.seeking, {
    onCancel() {
      seekAbort?.abort();
      seekAbort = null;
      show('idle');
    },
  });

  const resultScreen = createResultScreen(screens.result, { onDone: () => toIdle() });

  /* ---------------------------------------------------------------- *
   * Rendering
   * ---------------------------------------------------------------- */

  function render(): void {
    const view = store.get();
    if (!view) return;
    board.render(view);
    controls.update(view);
    tickClocks();
  }

  function tickClocks(): void {
    const view = store.get();
    if (!view) return;
    const now = performance.now();
    const opponentColor: Color = view.myColor === 'white' ? 'black' : 'white';
    const mine = readClock(view.clocks, view.myColor, now);
    const theirs = readClock(view.clocks, opponentColor, now);
    ownClock.update(mine, view.clocks[view.myColor].running, mine < LOW_TIME_MS);
    opponentClock.update(theirs, view.clocks[opponentColor].running, theirs < LOW_TIME_MS);
  }

  function startClockLoop(): void {
    stopClockLoop();
    clockTimer = setInterval(tickClocks, CLOCK_TICK_MS);
  }

  function stopClockLoop(): void {
    if (clockTimer !== null) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  }

  /* ---------------------------------------------------------------- *
   * Errors
   * ---------------------------------------------------------------- */

  function reportError(error: unknown, fallback: string): void {
    if (error instanceof LichessError) {
      if (error.kind === 'unauthorized') {
        signOut();
        return;
      }
      if (error.kind === 'rate-limited') {
        const seconds = Math.ceil((error.retryAfterMs ?? 60000) / 1000);
        banner.show(`Lichess is rate limiting us. Retry in ${seconds}s.`, 'error', 5000);
        return;
      }
      // Lichess explains its own refusals ("Invalid time control", ...). The
      // generic fallback hid that and left the user guessing.
      if (error.kind === 'rejected' && error.message) {
        banner.show(`${fallback}: ${error.message}`, 'error', 6000);
        return;
      }
    }
    banner.show(fallback, 'error', 4000);
  }

  /* ---------------------------------------------------------------- *
   * Session
   * ---------------------------------------------------------------- */

  async function signIn(token: string, who: LichessAccount): Promise<void> {
    client = new LichessHttpClient(token);
    account = who;
    idleScreen.setUsername(who.username);
    openEventStream();
    await resumeOngoingGame();
  }

  function signOut(): void {
    clearToken();
    closeGame();
    eventStream?.close();
    eventStream = null;
    seekAbort?.abort();
    seekAbort = null;
    client = null;
    account = null;
    store.clear();
    tokenScreen.reset();
    show('token');
  }

  function openEventStream(): void {
    if (!client) return;
    eventStream?.close();
    eventStream = client.streamEvents({
      onEvent(event) {
        if (event.type === 'gameStart') {
          seekAbort?.abort();
          seekAbort = null;
          void openGame(event.game.gameId);
        }
      },
      onOpen: () => banner.hide(),
      onError: (error) => {
        if (error instanceof LichessError && error.kind === 'unauthorized') signOut();
      },
      onReconnect: () => banner.show('Reconnecting…', 'info'),
    });
  }

  /** Pick up a game that was already running when the app opened. */
  async function resumeOngoingGame(): Promise<void> {
    if (!client) return;
    try {
      const games = await client.getOngoingGames();
      const first = games[0];
      if (first) {
        await openGame(first.gameId);
        return;
      }
    } catch (error) {
      reportError(error, 'Could not load your games');
    }
    toIdle();
  }

  /* ---------------------------------------------------------------- *
   * Game lifecycle
   * ---------------------------------------------------------------- */

  async function openGame(gameId: string): Promise<void> {
    if (!client || activeGameId === gameId) return;
    closeGame();
    activeGameId = gameId;
    keepScreenAwake(true);

    gameStream = client.streamGame(gameId, {
      onEvent(event) {
        if (event.type === 'gameFull') {
          const myColor = account ? colorFor(event, account.id) : 'white';
          store.applyGameFull(event, myColor);
          show('game');
          startClockLoop();
          render();
          if (isOver(event.state.status)) finishGame();
        } else if (event.type === 'gameState') {
          const becameMyTurn = store.applyGameState(event);
          render();
          if (becameMyTurn) vibrateTurn();
          if (isOver(event.status)) finishGame();
        }
      },
      onOpen: () => banner.hide(),
      onError: (error) => {
        if (error instanceof LichessError && error.kind === 'unauthorized') signOut();
      },
      onReconnect: () => banner.show('Reconnecting…', 'info'),
    });
  }

  function isOver(status: GameStatus): boolean {
    return status !== 'created' && status !== 'started';
  }

  function finishGame(): void {
    const view = store.get();
    stopClockLoop();
    keepScreenAwake(false);
    gameStream?.close();
    gameStream = null;
    activeGameId = null;
    vibrateGameOver();
    if (view) {
      resultScreen.show(describeResult(view.status, view.winner, view.myColor));
      show('result');
      if (resultTimer !== null) clearTimeout(resultTimer);
      resultTimer = setTimeout(() => toIdle(), RESULT_SCREEN_MS);
    } else {
      toIdle();
    }
  }

  function closeGame(): void {
    gameStream?.close();
    gameStream = null;
    activeGameId = null;
    stopClockLoop();
    keepScreenAwake(false);
  }

  function toIdle(): void {
    if (resultTimer !== null) {
      clearTimeout(resultTimer);
      resultTimer = null;
    }
    store.clear();
    show('idle');
  }

  /* ---------------------------------------------------------------- *
   * Matchmaking
   * ---------------------------------------------------------------- */

  async function startSeek(preset: TimeControlPreset, isRated: boolean): Promise<void> {
    if (!client) return;
    if (!isSeekableOnBoardApi(preset)) {
      // Lichess would reject this anyway; say so without burning a request.
      banner.show('Lichess only pairs Rapid or slower here.', 'error', 5000);
      show('idle');
      return;
    }
    rated = isRated;
    saveRated(isRated);
    seekingScreen.render(preset, isRated);
    show('seeking');

    seekAbort?.abort();
    const abort = new AbortController();
    seekAbort = abort;
    try {
      // The seek request stays open until Lichess pairs us. The gameStart on
      // the event stream is what actually starts the game.
      await client.seek(
        { time: preset.time, increment: preset.increment, rated: isRated },
        abort.signal,
      );
    } catch (error) {
      reportError(error, 'Matchmaking failed');
      if (seekAbort === abort) show('idle');
    } finally {
      if (seekAbort === abort) seekAbort = null;
    }
  }

  /* ---------------------------------------------------------------- *
   * Boot
   * ---------------------------------------------------------------- */

  void (async () => {
    const token = loadToken();
    if (!token) {
      show('token');
      return;
    }
    const probe = new LichessHttpClient(token);
    try {
      const who = await probe.getAccount();
      await signIn(token, who);
    } catch (error) {
      if (error instanceof LichessError && error.kind === 'unauthorized') {
        signOut();
      } else {
        reportError(error, 'Could not reach Lichess');
        show('token');
      }
    }
  })();
}
