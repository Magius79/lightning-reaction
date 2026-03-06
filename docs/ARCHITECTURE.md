# Lightning Reaction Tournament - Architecture

## Overview
A skill-based competitive reaction game for Android (Zapstore), where players compete in quick-tap tournaments with Lightning micropayments.

## Target Platform
**Zapstore (Nostr-native Android app store)**
- Native Android app
- Nostr identity integration (NIP-07)
- Lightning payments
- APK distribution via Zapstore

## Core Components

### 1. Android Frontend (React Native)
**Why React Native:**
- Faster development than pure Android
- Can reuse web knowledge
- Good Lightning wallet integration
- Still produces native APK for Zapstore

**Key Features:**
- Nostr login (public key auth)
- Lightning wallet integration (WebLN on mobile)
- Real-time game UI
- Leaderboards
- Payment confirmation screens

### 2. Backend Server (Node.js)
**Responsibilities:**
- Room management & matchmaking
- WebSocket game state
- Lightning invoice generation
- Winner payouts
- Anti-cheat validation
- Leaderboard calculations

**Stack:**
- Node.js + Express
- Socket.io for WebSockets
- LNbits or Alby for Lightning
- SQLite for state
- Hosted on VPS (or Railway/Render)

### 3. Game Flow

```
Player A                Backend                 Player B
   |                       |                        |
   |-- Pay 100 sats ------>|                        |
   |<-- Enter room --------|                        |
   |                       |<----- Pay 100 sats ----|
   |                       |                        |
   |<----- Room ready -----|-----> Room ready ----->|
   |                       |                        |
   |<----- WAIT... --------|-----> WAIT... -------->|
   |                       |                        |
   |<----- GREEN! ---------|-----> GREEN! --------->|
   |                       |                        |
   |-- TAP! (120ms) ------>|                        |
   |                       |<----- TAP! (145ms) ----|
   |                       |                        |
   |<----- YOU WIN! -------|                        |
   |<----- 180 sats -------|                        |
   |                       |-----> You lost ------->|
```

### 4. Payment Flow

**Entry:**
1. Player requests to join room
2. Backend generates Lightning invoice (100 sats)
3. Player pays via wallet
4. Backend verifies payment
5. Player enters room

**Payout:**
1. Game ends, winner determined
2. Backend calculates payout (entry × players × 0.9)
3. Backend sends Lightning payment to winner
4. Winner sees balance update

### 5. Anti-Cheat Measures

**Client-side validation:**
- Detect premature taps (before green)
- Detect unrealistic reaction times (<50ms)
- Rate limiting on taps

**Server-side validation:**
- Verify timestamps server-side
- Check for multiple connections from same IP
- Flag suspicious patterns
- Manual review for reported users

### 6. Data Models

**Room:**
```javascript
{
  id: string,
  status: 'waiting' | 'starting' | 'active' | 'finished',
  players: [{ pubkey, paid, timestamp, tapTime }],
  entryFee: number,
  prizePool: number,
  startTime: timestamp,
  greenTime: timestamp,
  winner: pubkey
}
```

**Player:**
```javascript
{
  pubkey: string (Nostr),
  displayName: string,
  gamesPlayed: number,
  gamesWon: number,
  totalWinnings: number,
  avgReactionTime: number,
  created: timestamp
}
```

## Tech Stack Summary

| Component | Technology | Assigned Model |
|-----------|-----------|----------------|
| Frontend (Android) | React Native + WebLN | Gemini 3 Flash |
| Backend API | Node.js + Express | ChatGPT 5.2 |
| WebSocket/Game Logic | Socket.io + State Machine | Grok 3 |
| Lightning Integration | LNbits/Alby API | ChatGPT 5.2 |
| Architecture/Review | Documentation + Testing | Claude Sonnet 4.5 |

## Deployment

**Backend:**
- VPS or Railway
- Environment: Node 20+
- SSL required for Lightning

**Frontend:**
- Build APK with React Native
- Sign APK
- Submit to Zapstore
- Include Nostr metadata (NIP-78)

## Zapstore Requirements

1. **Nostr Event (NIP-78):**
```json
{
  "kind": 32267,
  "tags": [
    ["d", "lightning-reaction"],
    ["name", "Lightning Reaction"],
    ["picture", "https://...icon.png"],
    ["about", "Fast-paced skill game with Lightning stakes"],
    ["url", "https://...release.apk"],
    ["hash", "sha256:..."],
    ["license", "MIT"]
  ]
}
```

2. **APK Signing:** Need Android keystore
3. **Privacy Policy:** Required for payments
4. **Terms of Service:** Required for gambling-adjacent games

## Next Steps

1. ✅ Architecture defined
2. ⏳ Create detailed specs for each model
3. ⏳ Set up project structure
4. ⏳ Delegate work to sub-agents
5. ⏳ Build & integrate components
6. ⏳ Test with real Lightning payments
7. ⏳ Deploy backend
8. ⏳ Build & sign APK
9. ⏳ Submit to Zapstore

---

**Estimated Timeline:** 7-10 days with parallel development
**MVP Feature Set:** 2-player rooms, basic UI, Lightning payments, manual matchmaking
