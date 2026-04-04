# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lightning Reaction is a head-to-head reaction time game for Android where players compete for Bitcoin over the Lightning Network. Players pay 100 sats to enter, wait for the screen to turn green, and the fastest tap wins 180 sats (90% of the pool). The app also supports freeplay mode (practice against a bot). Distributed via Zapstore (Nostr-based app store). Live in production with real money at stake.

**GitHub:** `Magius79/lightning-reaction`

## Architecture

Three independent TypeScript services communicate over REST and WebSocket:

```
┌──────────────────────┐
│  Frontend (Expo/RN)  │
│  Android APK via     │
│  Zapstore            │
└───┬──────────┬───────┘
    │ REST     │ Socket.io
    ▼          ▼
┌────────┐  ┌───────────┐
│Backend │◄─│ WebSocket │
│:4000   │  │ :8080     │
│Express │  │ Game      │
│SQLite  │  │ Engine    │
│LNbits  │  │ Anti-Cheat│
└────────┘  └───────────┘
```

- **backend/** (Express, port 4000) — REST API, room/player management, SQLite database, LNbits Lightning payment integration, leaderboard, credit system
- **websocket/** (Socket.io, port 8080 on Railway) — Real-time game engine, anti-cheat, bot player, room lifecycle, payout orchestration. Calls backend API for payments/stats
- **frontend/** (React Native / Expo) — Android app with game UI, payment modals (BOLT11 QR), leaderboard, Nostr profile resolution

All three are TypeScript. Backend and websocket are Node.js (CommonJS). Frontend is Expo/React Native.

## Key Data Flows

1. **Join paid game**: Frontend → `POST /api/rooms/join` → backend creates LNbits invoice → frontend polls `/api/rooms/confirm` → payment confirmed → frontend connects WebSocket → `emit('joinRoom', { pubkey, paymentHash })`
2. **Game**: WebSocket countdown → random 2-8s delay → green signal emitted → first tap wins → winner submits BOLT11 invoice → payout via LNbits
3. **Bot match (paid)**: After 20s waiting, player gets a warning notification ("Bot joining in 10s...") with option to cancel and get a credit. Bot joins at 30s if no opponent.
4. **Freeplay**: Bot joins immediately. No payment required. Stats tracked but no sats paid out.
5. **Payout**: Winner's client generates a BOLT11 invoice → submits via `submitPayoutInvoice` → WebSocket calls backend `/payout` → backend pays via LNbits with 3-attempt retry and backoff

## Bot Behavior

- **Paid games**: 300-600ms reaction time (competitive — player wins ~50-60%)
- **Freeplay**: 500-900ms reaction time (easier for newcomers)
- Bot auto-joins after 30s if no opponent (paid) or immediately (freeplay)
- Bot is identified by pubkey `bot_lightning_reaction` and socket ID prefix `bot_`

## Anti-Cheat System

Located in `websocket/src/game/AntiCheat.ts`:
- **150ms reaction time floor** — taps under 150ms are rejected (human minimum ~180ms)
- **Variance detection** — tracks last 10 reaction times per pubkey, flags stddev < 15ms (strong bot indicator)
- **IP connection limiting** — max 2 concurrent connections per IP
- **Duplicate tap guard** — one tap per player per game
- **Payment hash consumption** — each payment hash can only be used for one room join
- **Client-side tap guard** — taps during WAIT state ignored (GameScreen.tsx)

## Auth

Simple pubkey validation on WebSocket connection. Client sends `{ pubkey }` in Socket.io handshake auth. Server validates it's a 64-char hex string and attaches to `socket.data.pubkey`.

**Note:** Schnorr signature auth was built but reverted due to ESM compatibility issues with `@noble/secp256k1` on Railway and crypto polyfill requirements in React Native. Planned for v1.2.0.

## Build & Run Commands

```bash
# Individual services (local dev)
cd backend && npm install && npm run dev      # Express on :4000
cd websocket && npm install && npm run dev    # Socket.io on :3001
cd frontend && npm install && npx expo start  # Expo dev server

# Production builds
cd backend && npm run build && npm start
cd websocket && npm run build && npm start

# Build Android APK
cd frontend && eas build --platform android --profile preview

# Health checks
curl http://localhost:4000/healthz
curl http://localhost:3001/health
```

No test suites exist yet.

## Deploy Workflow

**IMPORTANT:** Railway auto-deploy from GitHub is disabled. Always use `railway up` from the service subdirectory.

```bash
# Backend + WebSocket
cd lightning-reaction-main
git add . && git commit -m "description" && git push

cd backend && railway up
cd ../websocket && railway up

# Frontend — build APK, upload to GitHub release, publish to Zapstore
cd frontend
eas build --platform android --profile preview
# Download APK from EAS, upload to GitHub release
rm -rf ~/.cache/zsp
SIGN_WITH=nsec1yourkey zsp publish -r github.com/Magius79/lightning-reaction -m github --overwrite-release
```

Use `--overwrite-release` when republishing the same version tag. Clear `~/.cache/zsp` if zsp uses a cached APK.

## Environment

**Backend** requires `.env` with: `LNBITS_URL`, `LNBITS_INVOICE_KEY`, `LNBITS_ADMIN_KEY`, `JWT_SECRET`, `DB_PATH` (SQLite), `PORT`, `ENTRY_FEE`, `HOUSE_EDGE`. Env validated with Zod in `backend/src/config/env.ts`.

**WebSocket** requires: `PORT`, `BACKEND_API_URL`.

**Frontend** URLs are hardcoded in `frontend/src/constants/theme.ts` (API_URL, WS_URL).

## Database

SQLite with WAL mode. Schema auto-migrated on startup via `backend/src/config/migrate.ts`. Migrations run sequentially and are idempotent.

Key tables: `players` (keyed by hex pubkey), `rooms`, `room_players`, `games`, `game_players`, `transactions`.

Migration 003 converts legacy npub pubkeys to hex format with stats merging.

## Key Files

### WebSocket
- `websocket/src/game/GameEngine.ts` — Game state machine, round logic, bot tap scheduling, stats reporting
- `websocket/src/game/AntiCheat.ts` — Reaction time validation, variance tracking, IP limiting
- `websocket/src/rooms/RoomManager.ts` — Room lifecycle, WebSocket event handlers, payout orchestration, bot timers, cancel/refund
- `websocket/src/rooms/Room.ts` — Room model, player management, bot player, prize pool
- `websocket/src/middleware/auth.ts` — Socket.io auth middleware (pubkey validation)
- `websocket/src/index.ts` — Server setup, Socket.io event wiring

### Backend
- `backend/src/services/lightning.ts` — LNbits API wrapper (invoices, payouts)
- `backend/src/services/player.ts` — Player CRUD, stats updates (including satsWon), leaderboard query, credit system
- `backend/src/routes/rooms.ts` — Room join, payment confirmation, stats updates, credits
- `backend/src/routes/webhook.ts` — LNbits payment webhook handler
- `backend/src/config/migrate.ts` — Database schema and migrations

### Frontend
- `frontend/src/screens/GameScreen.tsx` — Main game UI, tap handling, bot warning UI, payout flow
- `frontend/src/screens/HomeScreen.tsx` — Home screen, Nostr profile resolution
- `frontend/src/screens/LeaderboardScreen.tsx` — Global rankings, Nostr name resolution
- `frontend/src/screens/LoginScreen.tsx` — npub/hex pubkey login
- `frontend/src/services/websocket.ts` — Socket.io client wrapper
- `frontend/src/services/auth.ts` — Pubkey storage
- `frontend/src/constants/theme.ts` — API/WS URLs, colors, config

## Infrastructure

- **Railway** — Backend and WebSocket hosting (separate services in one project)
- **Start9** — Self-hosted LNbits node (home server)
- **WireGuard** — VPN tunnel between VPS and Start9
- **Cloudflare / cloudflared** — Public tunnel from VPS to LNbits (`lnbits.lrtgame.cloud`)
- **Expo EAS Build** — Android APK cloud builds
- **Zapstore** — App distribution (`zsp` CLI)
- **Nostr** — Player identity (pubkeys, profile resolution from relays)
- **LND** — Lightning node underlying LNbits on Start9

### Payment Path
Railway → Cloudflare tunnel → VPS → WireGuard → Start9 LNbits → LND

Transient 502 errors on this path are expected. Payout retry logic (3 attempts, 3s/6s backoff) handles this.

## Important Considerations

- **Real money at stake**: Payment logic, anti-cheat, and payout calculations must be correct. Test thoroughly before deploying.
- **CommonJS project**: Backend and websocket use `require()`. ESM-only npm packages will crash at runtime. Use CommonJS-compatible versions or dynamic `import()` with `.default` fallback.
- **Verify multi-file changes with grep** before deploying to catch missed propagation across schema, service, and route layers.
- **`prebuild: rm -rf dist`** in websocket package.json ensures clean TypeScript builds.
- **Leaderboard**: Sorted by wins DESC, avg_reaction_time ASC. Only players with wins > 0 shown.
- **Profile resolution**: `npubToHex()` calls must handle both npub1 and raw hex formats.
- **Socket race condition**: GameScreen's main useEffect must `await wsService.connect()` before registering listeners or emitting events.

## Known Issues & Future Work

- **Routing fees**: 50 sat fees on 180 sat payouts due to single Megalith LSP channel. Opening additional channels would reduce this.
- **White rabbit**: Suspicious player (94 wins, 506ms avg). Likely a scripted client. Current anti-cheat raises the bar but doesn't definitively block sophisticated bots.
- **Schnorr auth (v1.2.0)**: Nostr key signature verification on WebSocket connection. Built but reverted — needs ESM fix for `@noble/secp256k1` and React Native crypto polyfill.
- **Adaptive bot difficulty (v1.2.0)**: Track player's rolling average reaction time, set bot difficulty relative to their skill level.
- **Network latency**: Reaction time is server-side only. Players closer to Railway servers have an inherent advantage.
- **No test suites**: All three services lack automated tests.
- **Remaining audit bugs**: Credit race condition (#5), listener cleanup (#6), payment polling loop (#12) from the security audit.
