# flip-chess

A purpose-built PWA for playing Lichess games on the Galaxy Z Flip 7's cover screen. The cover screen's small, tall viewport is ideal for showing just a board and clock — this app does exactly that, live-synced to your real Lichess games.

## Stack

- **Vite** + **TypeScript** for development and building
- **chess.js** for legal move validation
- **Vitest** for testing
- **vite-plugin-pwa** for manifest and service worker support
- Deployed to **GitHub Pages** as static files

## Getting Started

### Development

```bash
npm install
npm run dev          # Start the dev server at http://localhost:5173
npm test             # Run the test suite
npm run test:watch   # Run tests in watch mode
npm run typecheck    # Type-check with TypeScript
```

### Build and Deployment

```bash
npm run build        # Build to dist/ (runs typecheck first)
node scripts/generate-icons.mjs  # Regenerate the PWA icons (already committed)
```

The app is deployed to GitHub Pages as a static site. See the [deploy workflow](.github/workflows/deploy.yml) for details.

## Project Layout

```
flip-chess/
├── src/
│   ├── lichess/      # Lichess API client: ND-JSON streams, seek, moves, resign/draw
│   ├── game/         # chess.js adapter, clock model, game state store (no DOM)
│   ├── ui/           # DOM rendering: board, clocks, controls, screens (no API access)
│   ├── types.ts      # The shared contract every other module builds against
│   ├── app.ts        # Wiring: streams -> store -> screens, and input back out
│   └── main.ts       # Entry point
├── scripts/
│   └── generate-icons.mjs  # Regenerates the PNG icons in public/icons
├── public/
│   ├── icons/        # Generated app icons (192px, 512px, maskable)
│   └── robots.txt    # Disallow crawlers (single-user app)
├── tests/            # Vitest tests
├── .github/workflows/
│   ├── ci.yml        # Test on push and PR
│   └── deploy.yml    # Deploy to GitHub Pages on push to master
├── index.html        # HTML entry point (PWA manifest link)
├── vite.config.ts    # Vite config with PWA plugin, base: /flip-chess/
└── README.md         # This file
```

## Lichess Token Setup

On first load, flip-chess will prompt you for a personal Lichess API token:

1. Go to https://lichess.org/account/oauth/token/create
2. Create a token with the `board:play` scope (required to play moves). This is a
   personal access token, not an OAuth flow — the app is single-user by design and has
   no backend to hold a client secret.
3. Paste the token into the app — it's stored in your browser's localStorage and sent **only** to lichess.org
4. See [Cover-Screen Setup](docs/cover-screen-setup.md) for device-specific instructions

## Cover Screen Installation

To run flip-chess on a Galaxy Z Flip 7's cover screen, you'll need to use the MultiStar launcher widget from the Good Lock system app. Full instructions are in [Cover-Screen Setup](docs/cover-screen-setup.md).

**Note:** This is currently a manual, one-time device setup. There is no native way for a browser to appear on the cover screen directly; see the [design spec](docs/superpowers/specs/2026-09-18-flip-chess-design.md#cover-screen-delivery) for research and rationale.

## Playing

1. Open flip-chess on the cover-screen browser
2. Pick a time control and whether the game is rated — this opens a Lichess seek
3. Wait for Lichess to pair you with an opponent
4. Play moves on the board; the clock ticks down in real time
5. The phone vibrates when it becomes your turn

Resign and draw offers are press-and-hold rather than tap, so a stray touch on a
folded phone cannot end a game by accident.

### Not in v1

Challenging a specific player, chat, analysis, game history, and push notifications
while the app is closed are all out of scope — see the design spec.

## Security & Privacy

- Your Lichess token is stored only in this browser's localStorage on this device
- The token is sent **only** to lichess.org API endpoints, never to any other server
- This is a single-user app — no accounts, logins, or multi-user support
- See [robots.txt](public/robots.txt) — crawlers are disallowed (this is a personal app)

## Design & Architecture

For a detailed explanation of the app's architecture, data flow, and authentication model, see the [design spec](docs/superpowers/specs/2026-09-18-flip-chess-design.md) and the
[implementation plan](docs/superpowers/plans/2026-09-18-flip-chess-implementation.md),
which records the decisions the spec deliberately left open.

## Third-party assets

The chess piece artwork (`src/ui/pieces.ts`) is the Cburnett set by Colin M.L. Burnett, used here under the BSD-3-Clause license; see [docs/licenses/cburnett-pieces.md](docs/licenses/cburnett-pieces.md) for full attribution and license text.

## License

MIT
