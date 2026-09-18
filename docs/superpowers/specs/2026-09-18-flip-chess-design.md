# Flip Chess — design spec

Map: [Flip Chess: cover-screen Lichess board — design spec](https://github.com/timour77/flip-chess/issues/1)

## Problem

Lichess's own app/site squeezes its full interface into the Galaxy Z Flip 7's cover screen, which is unusable for actually playing — the cover screen only needs a board and a clock. This spec defines a purpose-built PWA that shows just that, live-synced to the user's real Lichess games.

## Architecture

A single static PWA, no backend:

```
┌─────────────────────────────────────────┐
│  Browser (cover screen, via MultiStar)   │
│                                           │
│  ┌─────────────┐   ┌──────────────────┐ │
│  │  UI layer   │   │  chess.js         │ │
│  │  (board,    │◄─►│  (legal moves,    │ │
│  │   clock,    │   │   check/mate      │ │
│  │   controls) │   │   detection)      │ │
│  └──────┬──────┘   └──────────────────┘ │
│         │                                │
│  ┌──────▼──────────────────────────────┐ │
│  │  Lichess client (fetch + ND-JSON)    │ │
│  └──────┬────────────────────────────┬─┘ │
└─────────┼────────────────────────────┼───┘
          │ HTTPS (Bearer token)        │
          ▼                             ▼
   lichess.org REST API      lichess.org stream endpoints
   (seek, move, resign,      (/api/stream/event,
    draw offer)               /api/board/game/stream/{id})
```

Everything runs client-side in the browser. The personal API token (`board:play` scope, `challenge:read` optional) is entered once by the user and kept in the browser's storage — there is no server to hold it. Deployed as static files to Vercel or GitHub Pages.

## Components

**Board + clock UI**
- Renders an 8x8 board sized to the viewport width, orientation fixed to the user's own color for the active game.
- Two clock readouts (own / opponent), formatted mm:ss, updating locally between server clock syncs (the stream sends authoritative clock values on every move; the UI ticks down locally in between).
- Minimal control row: resign, offer/accept draw, and (when idle) start-matchmaking.
- Optimized for ~300-400px wide, very tall viewports (see [Not yet specified](#not-yet-specified) — exact breakpoints are implementation detail, not locked here).

**Chess rules engine (chess.js)**
- Client-side legal-move computation: on selecting a piece, highlight its legal destination squares before any tap on a destination is accepted.
- Drives promotion-piece prompting when a pawn move reaches the back rank.
- Does not decide game outcome authoritatively — Lichess's server is the source of truth; chess.js only gates what the UI lets the user attempt, to avoid illegal-move round-trips on a fiddly touchscreen.

**Lichess client**
- Auth: `Authorization: Bearer <personal token>` on every request (see [Authentication](#authentication)).
- Game discovery: opens `GET /api/stream/event` on load to learn about the current/next game (`gameStart` events) and any ongoing game already in progress.
- Live game state: for the active game, opens `GET /api/board/game/stream/{gameId}`, consuming `gameFull` (initial state) then `gameState` (moves, clocks, status) events.
- Actions: `POST /api/board/game/{gameId}/move/{uci}` (make a move), `POST /api/board/game/{gameId}/resign`, `POST /api/board/game/{gameId}/draw/yes` (offer/accept draw).
- Matchmaking: `POST /api/board/seek` with the user-chosen time control and rated/casual flag.

  > **Correction (2026-09-18, found in implementation).** This spec originally
  > recorded "any value, including Blitz/Bullet — no restriction, per
  > [research](https://github.com/timour77/flip-chess/issues/3)". That is wrong,
  > and every Bullet and Blitz preset shipped on the strength of it failed on
  > tap. lila validates a board seek with `boardApiHook`, which rejects it with
  > "Invalid time control" unless the clock is **Rapid or slower** — that is,
  > `limit + 40 x increment >= 480` seconds (scalachess `Clock.estimateTotalSeconds`
  > and `Speed`). The published OpenAPI schema does not mention this; it documents
  > only `time` 0-180 and `increment` 0-180, so the rule is invisible until a
  > real seek comes back rejected. `src/config.ts` now encodes the floor and a
  > unit test holds every shipped preset to it.

**Notification**
- On receiving a `gameState` event where it becomes the player's turn, trigger the [Vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API) and, where supported, a screen-wake hint. No push notifications when the PWA isn't open — out of scope (see below).

## Data flow

1. App loads → reads token from storage → opens the global event stream.
2. No game in progress → UI shows an idle/start screen → user picks a time control → `POST /api/board/seek` → app waits on the seek (this call blocks until matched, or the user cancels) or watches the event stream for a `gameStart`.
3. Game starts → app opens the per-game stream → renders `gameFull` as the initial board/clock state.
4. Each `gameState` event → chess.js re-derives the board from the move list (or the UI applies the UCI move incrementally) → clocks reset to the pushed values → if it's now the player's turn, vibrate.
5. Player taps a piece → chess.js legal moves computed → destination tap → `POST .../move/{uci}` → UI optimistically shows the move, reconciled by the next `gameState` event.
6. Game ends (`gameState.status != started`) → UI shows result briefly → returns to idle screen.

## Authentication

- Personal access token, scope `board:play` (+ `challenge:read` to see incoming challenges, optional — out of scope for MVP since only self-initiated matchmaking is supported).
- Entered once via a simple settings/input screen on first load, stored in the browser (`localStorage`) on the device. No OAuth2/PKCE flow — this app is single-user by design ([decision](https://github.com/timour77/flip-chess/issues/10)).
- The token is never sent anywhere except `lichess.org` API calls.

## Cover-screen delivery

There is no native way for a browser/PWA to appear on the Z Flip 7's cover screen ([research](https://github.com/timour77/flip-chess/issues/2)). The shipped artifact is a normal installable PWA; getting it onto the cover screen is a **manual, one-time device setup** the spec documents as a short user guide:

1. Install **Good Lock** and its **MultiStar** module from the Galaxy Store.
2. In MultiStar → "I ♡ Galaxy Foldable" → Launcher Widget, add the browser app (Chrome/Samsung Internet) to the cover-screen widget carousel.
3. Open the PWA's URL in that browser instance; optionally use "Add to Home Screen" (behavior here is unverified — see Not yet specified) to pin it directly.

This is out of the app's control and cannot be automated from the web app itself.

## Error handling

- **Stream disconnects** (network drop, backgrounding): reconnect with backoff; on reconnect, re-fetch current game state via `GET /api/board/game/{gameId}` before resuming the stream, so a missed move isn't silently lost.
- **Illegal move rejected by server** (should be rare given local chess.js gating, but the server is authoritative): revert the optimistic UI update, re-sync from the next stream event.
- **No token / expired token**: API calls return 401 → UI falls back to the token-entry screen.
- **Seek never matches**: user can cancel and retry with a different time control; no automatic timeout beyond what Lichess's own pairing does.

## Testing

- Manual verification against the real Lichess API using the personal token created for this project (already in place, gitignored).
- Primary test device: the physical Z Flip 7, via the MultiStar cover-screen setup above — this is the only environment that validates the actual use case (viewport, touch precision, vibration).
- No automated end-to-end test against live Lichess matchmaking (it pairs against real humans); unit-test chess.js integration and UI state transitions in isolation instead.

## Out of scope (v1)

- Challenging a specific opponent by username — matchmaking/seek only.
- In-game chat, post-game analysis, puzzles, game history/list browsing.
- Push notifications when the PWA is closed.
- Multi-user support / OAuth2.
- Automating the Good Lock/MultiStar cover-screen setup.

## Not yet specified

Implementation-level details deliberately left open for the implementation plan:

- Exact PWA layout/breakpoints for the cover screen's narrow-tall viewport.
- Promotion piece picker UI on a very small touch target.
- Rate-limit handling specifics for the Lichess API.
- Resign/draw-offer confirmation UX (accidental-tap protection).
- PWA manifest details: icons, offline caching strategy, "Add to Home Screen" behavior specifically from the cover screen.
- Token storage hardening (expiry/rotation UX) beyond plain `localStorage`.
