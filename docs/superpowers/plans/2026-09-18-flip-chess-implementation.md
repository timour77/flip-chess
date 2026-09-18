# Flip Chess — implementation plan

Spec: [docs/superpowers/specs/2026-09-18-flip-chess-design.md](../specs/2026-09-18-flip-chess-design.md)

## Stack

| Choice | Why |
| --- | --- |
| Vite + TypeScript, no UI framework | The whole UI is a board, two clocks and three buttons. A framework would cost more bytes and indirection than it saves on a cover screen. |
| `chess.js@1` as the only runtime dependency | The spec names it; it gates move input locally so a fiddly touchscreen never round-trips an illegal move. |
| `vite-plugin-pwa` | Manifest + service worker without hand-rolling either. API calls are never cached — only the shell is. |
| Vitest + jsdom | The spec rules out automated end-to-end tests against live matchmaking, so the coverage lives in unit tests of the stream parser, the state reducer and the UI's state transitions. |
| GitHub Pages | The repo is already on GitHub; the artifact is static files. `base` is `/flip-chess/`. |

## Module boundaries

`src/types.ts` is the single shared contract — wire-format types mirroring the Lichess
Board API, the `LichessApi` interface, and the derived `GameView` the UI renders. Every
other module imports from it and from nothing else across a boundary. That is what let
the five slices below be built in parallel without stepping on each other.

```
src/types.ts          shared contract (wire formats, LichessApi, GameView, AppState)
src/lichess/          ND-JSON parsing, backoff, HTTP + streaming client
src/game/             chess.js adapter, clock model, result mapping, game store
src/ui/               board, promotion picker, clocks, controls, screens  (DOM only)
src/app.ts            the wiring: streams -> store -> screens, and user input back out
src/main.ts           entry point
```

The direction of dependency is one-way: `ui` knows nothing about `lichess` or `game`,
`game` knows nothing about the DOM, and `lichess` knows nothing about either. `app.ts`
is the only module that sees all three.

## Work packages

Built in parallel by five agents against the frozen `src/types.ts`:

1. **Lichess client** — ND-JSON reader, exponential backoff, auth, rate-limit window, the
   auto-reconnecting event and game streams, and the action endpoints.
2. **Game state** — chess.js adapter, the local clock model, status-to-result mapping, and
   the observable store with optimistic-move support.
3. **Board UI** — 64-square grid, inline SVG pieces, tap-to-select/tap-to-move, promotion picker.
4. **Screens UI** — clocks, control row, banner, and the token/idle/seeking/result screens.
5. **Packaging** — icons, PWA manifest assets, CI and Pages workflows, README, setup guide.

Integration (`app.ts`, `storage.ts`, `notify.ts`) is done by the orchestrator once the
packages land.

## Decisions on the spec's open questions

The spec deliberately left six implementation-level details open. Resolved here:

- **Layout / breakpoints.** No breakpoints. One layout, driven by
  `--board-size: min(100vw, calc(100dvh - 9.5rem))`, so the board fills the width until
  the viewport gets too short, at which point it shrinks to keep the clocks and controls
  on screen. Nothing ever scrolls.
- **Promotion picker.** A full-width overlay with four targets at least 64px tall, not a
  row of small squares. Backdrop tap cancels.
- **Rate-limit handling.** A 429 opens a client-side block window (honouring `Retry-After`,
  defaulting to Lichess's documented 60s penalty); requests inside the window fail fast
  instead of hammering the API. Streams reconnect with jittered exponential backoff
  capped at 30s.
- **Resign / draw confirmation.** Press-and-hold for ~600ms with a visible fill, not a
  confirm dialog. A stray tap cannot trigger it, and it costs no screen space — both of
  which matter more than usual at 350px. Accepting an opponent's draw offer is a normal
  tap, since that action is already deliberate.
- **PWA manifest.** Standalone, portrait, dark theme, generated 192/512/maskable icons.
  The service worker precaches the app shell only; `lichess.org` is never cached, because
  a stale board is worse than no board.
- **Token storage.** Plain `localStorage`, as the spec allows, with a 401 from any call
  clearing it and falling back to the token screen. No rotation UX in v1 — personal
  tokens do not expire unless revoked.

## Verification

- `npm run typecheck`, `npm test`, `npm run build` in CI on every push.
- Unit coverage where it is worth having: stream parsing against chunk-split input and
  keep-alive lines, backoff, error mapping, position re-derivation, clock extrapolation,
  result mapping, store transitions, and each UI interaction.
- Everything beyond that is manual, against the real API with the personal token and on
  the physical device — per the spec's testing section, that is the only environment that
  validates the actual use case.
