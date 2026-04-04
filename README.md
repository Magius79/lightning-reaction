# ⚡ Lightning Reaction

A fast-paced reaction time game for Android where players compete head-to-head for Bitcoin over the Lightning Network. Available on [Zapstore](https://zapstore.dev).

## How It Works

1. Pay **100 sats** to enter a room
2. Wait for an opponent (or a bot joins after 30 seconds)
3. Screen shows **"WAIT..."** then turns **GREEN**
4. First player to tap wins **180 sats** (90% of the pool)
5. Pure skill, no luck

Freeplay mode available for practice — no sats required.

## Features

- **Head-to-head reaction time battles** with real Bitcoin stakes
- **Freeplay mode** — practice against a bot for free
- **Global leaderboard** ranked by wins and reaction time
- **Nostr identity** — your pubkey is your player ID, profile pulled from relays
- **Anti-cheat** — 150ms reaction time floor, variance detection, IP limiting
- **Bot matches** — transparent notification when matched against a bot, with cancel/refund option
- **Instant payouts** via Lightning Network (LNbits)

## Stack

| Layer | Technology |
|---|---|
| Frontend | React Native (Expo) — Android APK via Zapstore |
| Backend | Node.js / Express — hosted on Railway |
| Game Engine | Socket.io WebSocket server — real-time gameplay |
| Payments | LNbits (self-hosted on Start9) via Lightning Network |
| Identity | Nostr pubkeys for player identity |
| Database | SQLite with WAL mode |

## Project Structure

```
lightning-reaction/
├── frontend/       # React Native (Expo) Android app
├── backend/        # Express REST API server
├── websocket/      # Socket.io game engine
├── docs/           # Architecture & design docs
├── specs/          # Component specifications
├── ops/            # Operational configs
└── scripts/        # Helper scripts
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- [EAS CLI](https://docs.expo.dev/eas/) (`npm install -g eas-cli`)
- An LNbits instance with LND funding source

### Local Development

```bash
# Run each service in a separate terminal:
cd backend && npm install && npm run dev      # Express on :4000
cd websocket && npm install && npm run dev    # Socket.io on :3001
cd frontend && npm install && npx expo start  # Expo dev server
```

### Environment Variables

**Backend** (`.env`):

| Variable | Description |
|---|---|
| `LNBITS_URL` | URL to your LNbits instance |
| `LNBITS_INVOICE_KEY` | LNbits invoice/read key |
| `LNBITS_ADMIN_KEY` | LNbits admin key (for payouts) |
| `JWT_SECRET` | JWT signing secret |
| `DB_PATH` | SQLite database path |
| `PORT` | Server port (default: 4000) |
| `ENTRY_FEE` | Entry fee in sats (default: 100) |
| `HOUSE_EDGE` | House fee percentage (default: 0.1) |

**WebSocket** (`.env`):

| Variable | Description |
|---|---|
| `PORT` | Server port (default: 3001) |
| `BACKEND_API_URL` | Backend API URL |

**Frontend**: API and WebSocket URLs are configured in `frontend/src/constants/theme.ts`.

### Building the APK

```bash
cd frontend
eas build --platform android --profile preview
```

### Deploying

Backend and WebSocket are hosted on Railway. Auto-deploy from GitHub is disabled — use the Railway CLI:

```bash
cd backend && railway up
cd websocket && railway up
```

## Distribution

The app is distributed via [Zapstore](https://zapstore.dev), a permissionless Android app store built on Nostr. Releases are signed with a Nostr key and published using [`zsp`](https://github.com/zapstore/zsp):

```bash
rm -rf ~/.cache/zsp
SIGN_WITH=nsec1... zsp publish -r github.com/Magius79/lightning-reaction -m github --overwrite-release
```

## Game Architecture

```
Player joins → Pays Lightning invoice → Enters WebSocket room
    → Countdown (3-2-1) → Random 2-8s wait → GREEN signal
    → First tap wins → Winner submits BOLT11 invoice → Payout via LNbits
```

**Bot behavior:**
- Paid games: 300-600ms reaction time (competitive)
- Freeplay: 500-900ms reaction time (easier)
- Bot joins after 30s if no opponent (paid) or immediately (freeplay)
- Players are notified 10 seconds before bot joins with option to cancel

## Security

- 150ms minimum reaction time (sub-human speeds rejected)
- Reaction time variance analysis (detects scripted clients)
- IP-based connection limiting
- Payment hash consumption (prevents replay attacks)
- Server-side reaction time computation (client timestamps can't be spoofed)
- Payout retry with exponential backoff for transient failures

## License

MIT

## Contributing

Contributions welcome! Open an issue or submit a PR.
