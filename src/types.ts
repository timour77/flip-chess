/**
 * Shared contract for the whole app. Every module imports its types from here
 * so that the Lichess client, the game store and the UI can be developed and
 * tested independently of each other.
 *
 * Wire-format types mirror the Lichess Board API:
 * https://lichess.org/api#tag/Board
 */

/* ------------------------------------------------------------------ *
 * Wire format: lichess.org
 * ------------------------------------------------------------------ */

export type Color = 'white' | 'black';

/** Long algebraic move, e.g. "e2e4" or "e7e8q". */
export type Uci = string;

/** Square name, e.g. "e4". */
export type Square = string;

/** Piece letters as chess.js reports them. */
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

/**
 * Game status as sent by Lichess. Anything other than `created` / `started`
 * means the game is over.
 */
export type GameStatus =
  | 'created'
  | 'started'
  | 'aborted'
  | 'mate'
  | 'resign'
  | 'stalemate'
  | 'timeout'
  | 'draw'
  | 'outoftime'
  | 'cheat'
  | 'noStart'
  | 'unknownFinish'
  | 'variantEnd';

export interface LichessPlayer {
  id?: string;
  name?: string;
  title?: string | null;
  rating?: number;
  provisional?: boolean;
  aiLevel?: number;
}

/** `gameState` event on /api/board/game/stream/{id}. */
export interface GameStateEvent {
  type: 'gameState';
  /** Space-separated UCI moves from the initial position, e.g. "e2e4 e7e5". */
  moves: string;
  /** Milliseconds left on each clock, authoritative. */
  wtime: number;
  btime: number;
  /** Increment in milliseconds. */
  winc: number;
  binc: number;
  status: GameStatus;
  winner?: Color;
  wdraw?: boolean;
  bdraw?: boolean;
  wtakeback?: boolean;
  btakeback?: boolean;
}

/** `gameFull` event: the first message on a game stream. */
export interface GameFullEvent {
  type: 'gameFull';
  id: string;
  rated: boolean;
  variant: { key: string; name: string; short?: string };
  clock?: { initial: number; increment: number } | null;
  speed?: string;
  perf?: { name?: string };
  createdAt?: number;
  white: LichessPlayer;
  black: LichessPlayer;
  /** "startpos" or a FEN string. */
  initialFen: string;
  state: GameStateEvent;
}

export interface ChatLineEvent {
  type: 'chatLine';
  room: string;
  username: string;
  text: string;
}

export interface OpponentGoneEvent {
  type: 'opponentGone';
  gone: boolean;
  claimWinInSeconds?: number;
}

export type BoardStreamEvent =
  | GameFullEvent
  | GameStateEvent
  | ChatLineEvent
  | OpponentGoneEvent;

/** Game descriptor carried by gameStart / gameFinish on /api/stream/event. */
export interface EventStreamGame {
  gameId: string;
  fullId?: string;
  color: Color;
  fen?: string;
  hasMoved?: boolean;
  isMyTurn?: boolean;
  lastMove?: string;
  opponent?: { id?: string; username?: string; rating?: number };
  perf?: string;
  rated?: boolean;
  secondsLeft?: number;
  source?: string;
  speed?: string;
  status?: { id: number; name: GameStatus };
  variant?: { key: string; name: string };
}

export type EventStreamEvent =
  | { type: 'gameStart'; game: EventStreamGame }
  | { type: 'gameFinish'; game: EventStreamGame }
  | { type: 'challenge'; challenge: unknown }
  | { type: 'challengeCanceled'; challenge: unknown }
  | { type: 'challengeDeclined'; challenge: unknown };

/** An in-progress game as returned by GET /api/account/playing. */
export interface OngoingGame {
  gameId: string;
  fullId: string;
  color: Color;
  fen: string;
  hasMoved: boolean;
  isMyTurn: boolean;
  lastMove?: string;
  opponent: { id?: string; username?: string; rating?: number };
  perf?: string;
  rated: boolean;
  secondsLeft?: number;
  speed?: string;
  variant?: { key: string; name: string };
}

export interface LichessAccount {
  id: string;
  username: string;
  title?: string;
}

/* ------------------------------------------------------------------ *
 * Lichess client
 * ------------------------------------------------------------------ */

export type SeekVariant = 'bullet' | 'blitz' | 'rapid' | 'classical';

/** Parameters for POST /api/board/seek. */
export interface SeekParams {
  /** Clock initial time in minutes (Lichess accepts 0, 0.25, 0.5, 0.75, 1, 1.5, then integers). */
  time: number;
  /** Increment in seconds. */
  increment: number;
  rated: boolean;
  /** Optional rating delta window, e.g. "-200,+200". */
  ratingRange?: string;
}

/** A named preset shown on the idle screen. */
export interface TimeControlPreset {
  id: string;
  label: string;
  time: number;
  increment: number;
}

export type LichessErrorKind =
  /** 401: token missing, revoked or lacking board:play. */
  | 'unauthorized'
  /** 429: rate limited; `retryAfterMs` says how long to wait. */
  | 'rate-limited'
  /** Server rejected the request (4xx other than the above). */
  | 'rejected'
  /** 5xx or transport failure. */
  | 'network';

export class LichessError extends Error {
  readonly kind: LichessErrorKind;
  readonly status: number;
  readonly retryAfterMs: number | undefined;

  constructor(
    kind: LichessErrorKind,
    message: string,
    status = 0,
    retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'LichessError';
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Handle returned by every streaming call; `close()` is idempotent. */
export interface StreamHandle {
  close(): void;
  /** Resolves when the stream is closed for good (never rejects). */
  readonly done: Promise<void>;
}

export interface StreamCallbacks<T> {
  onEvent(event: T): void;
  /** Called on every disconnect, before a reconnect is attempted. */
  onError?(error: unknown): void;
  /** Called when the transport is (re)connected. */
  onOpen?(): void;
  /**
   * Called when a reconnect is scheduled, so the UI can show "reconnecting".
   * `attempt` starts at 1.
   */
  onReconnect?(attempt: number, delayMs: number): void;
}

/** Everything the app needs from lichess.org. Implemented by `LichessHttpClient`. */
export interface LichessApi {
  /** GET /api/account — also doubles as a token validity check. */
  getAccount(): Promise<LichessAccount>;
  /** GET /api/account/playing */
  getOngoingGames(): Promise<OngoingGame[]>;
  /** GET /api/board/game/stream/{id} — one-shot snapshot via the stream's first event. */
  fetchGameSnapshot(gameId: string): Promise<GameFullEvent>;
  /** GET /api/stream/event — long-lived, auto-reconnecting. */
  streamEvents(callbacks: StreamCallbacks<EventStreamEvent>): StreamHandle;
  /** GET /api/board/game/stream/{id} — long-lived, auto-reconnecting. */
  streamGame(gameId: string, callbacks: StreamCallbacks<BoardStreamEvent>): StreamHandle;
  /** POST /api/board/game/{id}/move/{uci} */
  move(gameId: string, uci: Uci): Promise<void>;
  /** POST /api/board/game/{id}/resign */
  resign(gameId: string): Promise<void>;
  /** POST /api/board/game/{id}/draw/{yes|no} */
  draw(gameId: string, accept: boolean): Promise<void>;
  /** POST /api/board/game/{id}/abort */
  abort(gameId: string): Promise<void>;
  /**
   * POST /api/board/seek. The request stays open until a game is found or
   * the returned handle is closed; resolves when the seek ends either way.
   */
  seek(params: SeekParams, signal: AbortSignal): Promise<void>;
}

/* ------------------------------------------------------------------ *
 * Derived app state (what the UI renders)
 * ------------------------------------------------------------------ */

export interface ClockSide {
  /** Milliseconds remaining as last pushed by the server. */
  remainingMs: number;
  /** Whether this side's clock is currently counting down. */
  running: boolean;
}

export interface Clocks {
  white: ClockSide;
  black: ClockSide;
  /** Performance.now() timestamp of the last authoritative sync. */
  syncedAt: number;
  /** Absent for correspondence/unlimited games. */
  present: boolean;
}

/** A single square of the rendered board, from the player's point of view. */
export interface BoardSquare {
  square: Square;
  piece: { type: PieceType; color: Color } | null;
}

export type ScreenName = 'token' | 'idle' | 'seeking' | 'game' | 'result';

/** The immutable snapshot the UI renders. Produced by the game store. */
export interface GameView {
  gameId: string;
  /** The side the local user plays; the board is oriented to it. */
  myColor: Color;
  /** FEN of the current position. */
  fen: string;
  /** Side to move. */
  turn: Color;
  myTurn: boolean;
  /** Full move list in UCI, oldest first. */
  moves: Uci[];
  /** The move to highlight on the board, if any. */
  lastMove: { from: Square; to: Square } | null;
  /** Square of the king in check, if any. */
  checkSquare: Square | null;
  clocks: Clocks;
  status: GameStatus;
  finished: boolean;
  winner: Color | null;
  /** True when the opponent has a draw offer standing against us. */
  drawOfferFromOpponent: boolean;
  /** True when our own draw offer is standing. */
  drawOfferFromMe: boolean;
  opponent: { username: string; rating: number | null };
  /** Set while a move we sent has not yet been confirmed by the server. */
  pendingMove: Uci | null;
}

/** Result text for the end-of-game screen. */
export interface GameResult {
  /** 'win' | 'loss' | 'draw' | 'aborted' from the local player's perspective. */
  outcome: 'win' | 'loss' | 'draw' | 'aborted';
  /** Short human-readable reason, e.g. "Checkmate", "Opponent resigned". */
  reason: string;
}

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */

export type Unsubscribe = () => void;

export interface Store<T> {
  get(): T;
  subscribe(listener: (value: T) => void): Unsubscribe;
}

export interface AppState {
  screen: ScreenName;
  /** Non-null once a token is stored and validated. */
  account: LichessAccount | null;
  /** Connection state of the global event stream. */
  connection: 'offline' | 'connecting' | 'online';
  game: GameView | null;
  result: GameResult | null;
  /** Transient, user-facing error banner text. */
  error: string | null;
}
