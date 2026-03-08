# ⚡ Lightning Reaction

A fast-paced reaction time game for Android where players compete head-to-head for Bitcoin over the Lightning Network. Available on [Zapstore](https://zapstore.dev).

## How It Works

Players pay a 100 sat entry fee to join a room. When the room fills (2+ players), a countdown begins. The screen shows "WAIT..." then suddenly turns green — the first player to tap wins the pot minus a small house fee. Rounds take 10–30 seconds. Pure skill, no luck.

## Stack

- **Frontend:** React Native (Expo) — Android APK distributed via Zapstore
- **Backend:** Node.js / Express — hosted on Railway
- **Game Engine:** Socket.io WebSocket server — real-time room management and gameplay
- **Payments:** LNbits (self-hosted on Start9) for Lightning invoices and payouts
- **Identity:** Nostr keypairs for player identity

## Project Structure

```
lightning-reaction/
├── frontend/       # React Native (Expo) app
├── backend/        # Express API server
├── websocket/      # Socket.io game engine
├── docs/           # Architecture & design docs
├── specs/          # Component specifications
├── ops/            # Operational configs
└── scripts/        # Helper scripts
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- [EAS CLI](https://docs.expo.dev/eas/) (`npm install -g eas-cli`)
- An LNbits instance with LND funding source

### Local Development

```bash
# Start all three services (requires tmux)
./START.sh

# Or run manually in separate terminals:
cd backend && npm run dev
cd websocket && npm run dev
cd frontend && npx expo start
```

### Environment Variables

The backend requires the following environment variables:

| Variable | Description |
|---|---|
| `LNBITS_URL` | URL to your LNbits instance |
| `LNBITS_INVOICE_KEY` | LNbits invoice/read key |
| `LNBITS_ADMIN_KEY` | LNbits admin key (for payouts) |
| `DATABASE_URL` | SQLite database path |
| `PORT` | Server port (default: 8080) |

### Building the APK

```bash
cd frontend
eas build --platform android --profile preview
```

This produces an `.apk` via Expo's cloud build service.

### Deploying the Backend

```bash
cd backend
railway login
railway up
```

See `docs/RAILWAY_DEPLOYMENT.md` for full deployment details including database persistence and custom domains.

## Distribution

The app is distributed via [Zapstore](https://zapstore.dev), a permissionless Android app store built on Nostr. Releases are signed with a Nostr key and published using [`zsp`](https://github.com/zapstore/zsp):

```bash
SIGN_WITH=nsec1... zsp publish -r github.com/Magius79/lightning-reaction -m github
```

## License

MIT

## Contributing

Contributions welcome! Open an issue or submit a PR.
