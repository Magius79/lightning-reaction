# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lightning Reaction is a head-to-head reaction time game for Android where players compete for Bitcoin over the Lightning Network. Players pay a 100 sat entry fee, wait for the screen to turn green, and the fastest tap wins the pot (minus 10% house fee). Distributed via Zapstore (Nostr-based app store).

## Architecture

Three independent services communicate over REST and WebSocket:

- **backend/** (Express, port 4000) — REST API, auth (JWT), room/player management, SQLite database, LNbits Lightning payment integration
- **websocket/** (Socket.io, port 3001) — Real-time game engine, state machine (waiting→green→finished), anti-cheat, bot player, room lifecycle. Calls backend API for payouts
- **frontend/** (React Native / Expo) — Android app with game UI, payment modals (BOLT11 QR), leaderboard. Connects to both backend (REST) and websocket (Socket.io)

All three are TypeScript. Backend and websocket are Node.js (CommonJS). Frontend is Expo/React Native.

### Key data flows

1. **Join**: Frontend → `POST /api/rooms/join` → backend creates LNbits invoice → frontend shows QR → player pays → LNbits webhook confirms → player joins WebSocket room
2. **Game**: WebSocket countdown → random 2-8s delay → green signal emitted → first tap wins → payout triggered via backend LNbits API
3. **Freeplay**: Bot ("⚡ LR Bot") auto-joins after 30s if room empty. Bot reaction: 300-600ms (paid), 500-900ms (freeplay)

## Build & Run Commands

```bash
# All services at once (requires tmux)
./scripts/dev-all.sh
./scripts/stop-all.sh

# Individual services
cd backend && npm install && npm run dev      # Express on :4000
cd websocket && npm install && npm run dev    # Socket.io on :3001
cd frontend && npm install && npx expo start  # Expo dev server

# Production builds
cd backend && npm run build && npm start
cd websocket && npm run build && npm start

# Build Android APK
cd frontend && eas build --platform android --profile preview

# Linting (backend only)
cd backend && npm run lint

# Health checks
curl http://localhost:4000/healthz
curl http://localhost:3001/health
```

No test suites exist yet in any service.

## Environment

Backend requires `.env` with: `LNBITS_URL`, `LNBITS_INVOICE_KEY`, `LNBITS_ADMIN_KEY`, `JWT_SECRET`, `DB_PATH` (SQLite), `PORT`, `ENTRY_FEE`, `HOUSE_EDGE`. Env validated with Zod in `backend/src/config/env.ts`.

WebSocket requires: `PORT`, `BACKEND_API_URL`.

Frontend URLs are hardcoded in `frontend/src/constants/theme.ts` (API_URL, WS_URL).

## Database

SQLite with WAL mode. Schema auto-migrated on startup via `backend/src/config/migrate.ts`. Key tables: `players` (keyed by Nostr pubkey), `rooms`, `room_players` (tracks payment status), `games`, `game_players`, `transactions`.

## Key Files

- `websocket/src/game/GameEngine.ts` — Game state machine and round logic
- `websocket/src/rooms/RoomManager.ts` — Room lifecycle, WebSocket event handlers
- `websocket/src/rooms/Room.ts` — Room model and bot player logic
- `backend/src/services/lightning.ts` — LNbits API wrapper (invoices, payouts)
- `backend/src/routes/rooms.ts` — Room join and payment confirmation
- `backend/src/routes/webhook.ts` — LNbits payment webhook handler
- `backend/src/config/migrate.ts` — Database schema and migrations
- `frontend/src/screens/GameScreen.tsx` — Main game UI and tap handling
- `frontend/src/constants/theme.ts` — API/WS URLs, colors, config

## Important Considerations

- **Real money**: Payment logic, anti-cheat, and payout calculations must be correct. The anti-cheat system (`websocket/src/game/AntiCheat.ts`) disqualifies taps during WAIT phase and flags reaction times <50ms.
- **Identity**: Players are identified by Nostr pubkeys (no centralized accounts).
- **Deployed to production**: Live on Railway (backend + websocket) and Zapstore (frontend APK). Test thoroughly before deploying.
- **Rate limiting**: Backend has 120 req/min per IP via express-rate-limit.
