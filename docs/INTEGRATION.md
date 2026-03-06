# Integration Guide

How the three components (Backend API, WebSocket Server, Frontend) work together.

## Architecture Overview

```
┌─────────────┐
│   Frontend  │ (React Native / Expo)
│  (Android)  │
└──────┬──────┘
       │
       ├─── HTTPS ───────┐
       │                 │
       │            ┌────▼────┐
       │            │ Backend │ (REST API)
       │            │  API    │ Port 4000
       │            └────┬────┘
       │                 │
       └─── WSS ───┐     │
                   │     │
              ┌────▼─────▼─────┐
              │   WebSocket    │
              │     Server     │ Port 3001
              └────────────────┘
                       │
                       │
                  ┌────▼────┐
                  │ LNbits  │
                  │   API   │
                  └─────────┘
```

## Component Responsibilities

### Backend API (Port 4000)
- **Authentication**: Nostr pubkey → JWT token
- **Player Management**: Profile, stats, history
- **Lightning Payments**: Invoice generation, webhook handling
- **Database**: SQLite with room/player/game data
- **Endpoints**:
  - `POST /api/auth/login` - Login with Nostr
  - `GET /api/rooms` - List active rooms
  - `POST /api/rooms/:id/invoice` - Generate payment invoice
  - `POST /api/webhook` - LNbits payment webhook
  - `GET /api/leaderboard` - Global rankings
  - `GET /api/players/:pubkey` - Player profile

### WebSocket Server (Port 3001)
- **Real-time Game Logic**: State machine, countdown, winner detection
- **Room Management**: Create, join, matchmaking queue
- **Anti-cheat**: Premature tap detection, unrealistic reaction times
- **Events**:
  - Client → Server: `joinRoom`, `tap`, `leaveRoom`
  - Server → Client: `roomJoined`, `playerJoined`, `gameState`, `gameFinished`
- **Backend Integration**: Calls backend API for payment verification and payouts

### Frontend (Android App)
- **UI/UX**: Login, home, game screen, leaderboard
- **WebSocket Client**: Real-time game updates via Socket.io
- **REST Client**: Authentication, room list, player data
- **Payment Flow**: Display invoice QR code, wait for confirmation

## Data Flow Diagrams

### 1. Player Login

```
Frontend                Backend
   │                       │
   │─── POST /api/auth ───>│
   │    { pubkey, sig }    │
   │                       │
   │<──── { token } ───────│
   │                       │
   │ (Store JWT token)     │
```

### 2. Join Room & Pay

```
Frontend              Backend              WebSocket           LNbits
   │                     │                     │                 │
   │─ GET /api/rooms ───>│                     │                 │
   │<─── [rooms] ────────│                     │                 │
   │                     │                     │                 │
   │─ POST /rooms/:id/invoice ──>│             │                 │
   │<─── { invoice, hash } ───────│            │                 │
   │                     │                     │                 │
   │ (Show QR code)      │                     │                 │
   │                     │                     │                 │
   │─────────────────────────── pay ─────────────────────────────>│
   │                     │                     │                 │
   │                     │<──── POST /webhook ─┬─────────────────│
   │                     │  { hash, paid: true }│                 │
   │                     │                     │                 │
   │                     │ (Mark room paid)    │                 │
   │                     │                     │                 │
   │─────────────────────┬─ WS: joinRoom ─────>│                 │
   │                     │  { roomId, token }  │                 │
   │                     │                     │                 │
   │                     │                     │─ Verify payment ─>│
   │                     │<────────────────────│  (Backend API)  │
   │                     │                     │                 │
   │<────────────────────┴─ roomJoined ────────│                 │
```

### 3. Game Play

```
Frontend                                WebSocket
   │                                       │
   │<────── gameState: WAITING ───────────│
   │  { state, players: [p1, p2] }        │
   │                                       │
   │<────── gameState: STARTING ──────────│
   │  { state, countdown: 3 }             │
   │                                       │
   │<────── gameState: COUNTDOWN ─────────│
   │  { state, secondsLeft: 2 }           │
   │                                       │
   │<────── gameState: READY ─────────────│
   │  { state, greenLightTime }           │
   │                                       │
   │─────── tap ─────────────────────────>│
   │  { tapTime: 1234567890 }             │
   │                                       │
   │<────── gameFinished ──────────────────│
   │  { winner, reactionTime, pot }       │
```

### 4. Payout

```
WebSocket           Backend              LNbits
   │                   │                   │
   │─ POST /payout ───>│                   │
   │  { roomId, winner }                   │
   │                   │                   │
   │                   │─ Send payment ───>│
   │                   │  (winner address) │
   │                   │                   │
   │                   │<─ { paid: true } ─│
   │<─ { success } ────│                   │
```

## Configuration

### Backend Environment Variables

```bash
# Railway deployment
LNBITS_URL=https://legend.lnbits.com
LNBITS_ADMIN_KEY=xxx
LNBITS_INVOICE_KEY=xxx
JWT_SECRET=xxx
ENTRY_FEE=100
HOUSE_EDGE=0.1
DB_PATH=/app/data/app.sqlite
CORS_ORIGIN=https://your-websocket.railway.app
```

### WebSocket Environment Variables

```bash
# Railway deployment
PORT=3001
BACKEND_URL=https://your-backend.railway.app
CORS_ORIGIN=*
```

### Frontend Configuration

```typescript
// frontend/src/constants/theme.ts
export const API_URL = 'https://your-backend.railway.app';
export const WS_URL = 'wss://your-websocket.railway.app';
```

## Service Communication

### WebSocket → Backend API Calls

The WebSocket server makes these calls to the backend:

1. **Verify Payment** (before allowing room join):
   ```typescript
   GET /api/rooms/:roomId
   Authorization: Bearer <internal-token>
   
   Response: { paid: true, players: [...] }
   ```

2. **Trigger Payout** (after game finishes):
   ```typescript
   POST /api/rooms/:roomId/payout
   Authorization: Bearer <internal-token>
   {
     "winner": "npub1...",
     "reactionTime": 234,
     "pot": 900
   }
   
   Response: { success: true, txId: "..." }
   ```

### Backend → WebSocket Events

The backend can notify the WebSocket server via:

1. **Payment Confirmed** (webhook handler):
   - Backend stores `room.paid = true`
   - WebSocket polls or backend pushes event
   - Alternative: WebSocket subscribes to backend events

2. **Implementation Options**:
   - **Option A** (current): WebSocket polls backend before accepting join
   - **Option B**: Backend publishes to Redis, WebSocket subscribes
   - **Option C**: Backend calls WebSocket webhook endpoint

## Error Handling

### Network Errors

**Frontend → Backend**:
```typescript
try {
  const res = await fetch(`${API_URL}/api/rooms`);
  if (!res.ok) throw new Error('API error');
  const data = await res.json();
} catch (err) {
  // Show error toast
  Alert.alert('Error', 'Could not connect to server');
}
```

**Frontend → WebSocket**:
```typescript
socket.on('connect_error', (err) => {
  console.error('WebSocket connection failed:', err);
  // Retry logic or show error
});

socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') {
    // Server kicked us out
    socket.connect();
  }
});
```

### Payment Errors

1. **Invoice Generation Fails**:
   - Backend returns 500
   - Frontend shows error, allows retry

2. **Payment Webhook Never Arrives**:
   - Frontend polls `GET /api/rooms/:id` to check payment status
   - Timeout after 5 minutes (invoice expiry)

3. **Double Payment**:
   - Backend idempotency: check `room.paid` before accepting
   - WebSocket: reject join if already paid

### Game Errors

1. **Premature Tap**:
   - WebSocket detects tap before green light
   - Send `{ error: 'TOO_EARLY' }` event
   - Frontend shows penalty message

2. **Unrealistic Reaction Time**:
   - WebSocket validates `<50ms` or `>1000ms`
   - Mark as suspicious, log for review
   - Continue game but flag player

3. **Player Disconnect Mid-Game**:
   - WebSocket handles `disconnect` event
   - If 1 player left, award them the pot
   - If 0 players, cancel game and refund

## Testing Integration

### Local Testing (All Services)

1. **Start Backend**:
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit .env with your LNbits keys
   npm run dev  # Port 4000
   ```

2. **Start WebSocket**:
   ```bash
   cd websocket
   npm install
   cp .env.example .env
   # Set BACKEND_URL=http://localhost:4000
   npm run dev  # Port 3001
   ```

3. **Start Frontend**:
   ```bash
   cd frontend
   npm install
   npx expo start
   # Edit theme.ts:
   #   API_URL = 'http://192.168.x.x:4000'
   #   WS_URL = 'ws://192.168.x.x:3001'
   # (Use your local IP, not localhost)
   ```

### Production Testing (Railway)

1. **Deploy Backend** → `https://backend-xxx.railway.app`
2. **Deploy WebSocket** → `wss://websocket-xxx.railway.app`
3. **Update Frontend** with production URLs
4. **Test Flow**:
   - Login with Nostr keypair
   - Create room → get invoice
   - Pay with real Lightning wallet (or test wallet)
   - Wait for confirmation
   - Join room via WebSocket
   - Play game
   - Verify payout

## Monitoring

### Backend Logs (Railway)
```bash
railway logs --service backend
```
Look for:
- `POST /api/webhook` - Payment confirmations
- `POST /api/rooms/:id/payout` - Payouts sent
- Errors: `status >= 500`

### WebSocket Logs (Railway)
```bash
railway logs --service websocket
```
Look for:
- `New connection: <socketId>`
- `Room created: <roomId>`
- `Game finished: <winner>`
- Errors: Anti-cheat triggers, disconnects

### Frontend Logs (Expo)
```bash
npx expo start
# Press 'l' to show logs
```
Look for:
- API request failures
- WebSocket connection errors
- Payment flow issues

## Security Checklist

- [ ] Backend validates JWT on protected routes
- [ ] WebSocket verifies payment before accepting join
- [ ] Frontend never exposes LNbits keys (only backend has them)
- [ ] CORS restricted to known origins in production
- [ ] Rate limiting active (120 req/min on backend)
- [ ] Database volume encrypted (Railway default)
- [ ] Payment webhooks use HTTPS (required for LNbits)
- [ ] Anti-cheat thresholds tuned (50ms min, 1000ms max)

## Troubleshooting

### "Cannot connect to backend"
- Check `API_URL` in frontend matches Railway URL
- Verify backend health: `curl https://backend.railway.app/healthz`
- Check Railway logs for crashes

### "WebSocket connection failed"
- Check `WS_URL` in frontend (use `wss://` not `ws://`)
- Verify WebSocket health: `curl https://websocket.railway.app/health`
- Check CORS_ORIGIN allows frontend domain

### "Payment confirmed but can't join room"
- Backend webhook may have failed
- Check backend logs for `POST /api/webhook`
- Manually verify: `curl https://backend.railway.app/api/rooms/:id`

### "Game stuck in WAITING state"
- WebSocket requires 2+ players to start
- Check if other player disconnected
- Implement timeout: auto-cancel after 5 minutes

---

**Next Steps**:
1. Deploy backend to Railway
2. Deploy WebSocket to Railway
3. Update frontend with production URLs
4. Test end-to-end flow
5. Build Android APK
6. Submit to Zapstore
