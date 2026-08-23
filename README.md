# TypeSpeed

TypeSpeed is a local-first typing speed tester with granular typing diagnostics, targeted drills, and LAN multiplayer races hosted from the user's own laptop. The app runs as a small Node server and stores personal history in the browser.

## Requirements

- Node.js 22 or newer
- Windows PowerShell or another shell that can run `npm.cmd`

## Run Locally

Install dependencies once:

```powershell
npm.cmd install
```

Start the local server:

```powershell
npm.cmd start
```

Open the local URL printed by the server, usually `http://localhost:4173`.

## LAN Multiplayer

The host starts TypeSpeed on their laptop with `npm.cmd start`, then opens the app and chooses **Host Lobby**. TypeSpeed creates a room code and a share URL. Other players on the same LAN open the host laptop's LAN URL, enter the room code, and join the race. No public relay server is required.

Windows Firewall may ask for permission the first time Node listens on the network. Allow private-network access for the laptop to accept LAN players.

Room updates stream over Server-Sent Events from the host laptop for lower-latency races, with an automatic polling fallback when a browser or network blocks the stream.

Lobby preset messages and race reactions use the same authenticated room channel as progress updates, so every joined LAN player sees the same room activity without a public relay.

Room credentials are kept in browser session storage, so refreshing the tab resumes the same authenticated player in the same room instead of creating a duplicate racer. The token is still verified by the laptop server and is never included in public room rosters or event-stream payloads.

## Coaching Workflow

TypeSpeed saves local run history in the browser and uses it to build a Personal Coach Profile. The profile ranks recurring weak areas, detects speed or accuracy plateaus, recommends a next drill, and can generate adaptive practice text from the user's current weakness instead of generic random words. Users can export raw JSON history, merge it back later with **Import Logs**, or download a readable Markdown coach report.

## Verification

Run the full test suite:

```powershell
npm.cmd test
```

Run syntax checks:

```powershell
npm.cmd run check
```

Run the combined local verification:

```powershell
npm.cmd run verify
```

## Security Notes

- The server sends a strict Content Security Policy without inline script or style allowances.
- API requests are rate-limited and validate room input before updating in-memory state.
- Multiplayer start and progress updates require a private per-player token. Room and event-stream payloads omit these tokens so another LAN participant cannot spoof someone else's race progress from the public roster.
- Race progress is also capped server-side from elapsed time and challenge length, so a forged client cannot instantly claim impossible WPM or a finished race.
- The service worker only caches static shell assets. It deliberately skips `/api/` requests so multiplayer state is always read from the live laptop server.
