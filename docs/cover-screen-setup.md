# Setting up flip-chess on the Galaxy Z Flip 7 Cover Screen

This guide walks you through installing and running flip-chess on your Galaxy Z Flip 7's cover screen using the MultiStar launcher widget.

## Prerequisites

You'll need:
- A Galaxy Z Flip 7 with the cover screen
- A Lichess account (https://lichess.org)
- About 10 minutes for the initial setup

## Step 1: Install Good Lock and MultiStar

1. Open the **Galaxy Store** app on your phone
2. Search for **Good Lock** and install it
3. Once installed, open Good Lock
4. Search for **MultiStar** and install the module from within Good Lock
5. Return to the home screen

## Step 2: Enable the Browser App in the Cover-Screen Widget

1. Open **Settings** → **Advanced features** → **Good Lock** (or open Good Lock directly)
2. Tap **MultiStar**
3. Select **I ♡ Galaxy Foldable**
4. Find **Launcher Widget** and enable it
5. Tap into the widget configuration and add your browser app (Chrome, Samsung Internet, or similar) to the carousel of shortcuts
6. Position the browser on the cover-screen widget carousel

The browser app will now be accessible directly from the cover screen.

## Step 3: Open flip-chess and Save Your Lichess Token

1. Use the browser app from the cover-screen widget to navigate to `https://timour77.github.io/flip-chess/` (or the deployment URL)
2. flip-chess will prompt you for a Lichess API token on first load
3. **Create a personal access token:**
   - Go to https://lichess.org/account/oauth/token/create
   - Give it a name (e.g., "flip-chess cover screen")
   - Select the `board:play` scope (this grants permission to play moves and resign)
   - Optionally select `challenge:read` if you want to see incoming challenges (not required for v1)
   - Click **Create** and copy the token
4. Paste the token into the flip-chess token input and save
5. The token is stored in **your browser's localStorage on this device only** — it is never sent anywhere except Lichess.org

## About "Add to Home Screen"

The spec notes that using "Add to Home Screen" from the cover-screen browser has **not been verified yet**. This means:
- The behavior is currently untested with flip-chess specifically
- You can try it if you'd like (browser menu → "Add to Home Screen"), but don't rely on it yet for pinning the app to the cover screen
- The MultiStar launcher widget approach (Step 2 above) is the tested and reliable way to access the app from the cover screen

## Playing a Game

1. Open flip-chess from the cover-screen widget
2. Click the **Start Matchmaking** button and select a time control (Bullet, Blitz, Rapid, etc.)
3. Wait for an opponent to be found
4. Play your moves directly on the board
5. The clock counts down in real time; your move notifies you with a vibration

## Troubleshooting

- **Token expired:** If the app shows a token entry screen again, you'll need to create a new token at https://lichess.org/account/oauth/token/create and paste it in. The old token can be revoked under "Personal access tokens" in your Lichess settings.
- **Board not responsive:** Tap and hold briefly on a piece before dragging it to move it.
- **Clock not updating:** If the clock seems stuck, close and reopen the app to re-sync with Lichess.

## Security Note

Your Lichess token is stored only in this browser's `localStorage` on this device. It is sent **only** to Lichess.org's API endpoints, never to any other server or service. If you lose access to the device, invalidate the token at https://lichess.org/account/oauth/token/create under "Personal access tokens" to prevent unauthorized access.
