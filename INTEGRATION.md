# Integration Guide

## Overview

Lightning Reaction Tournament consists of three interconnected services:

1. **Backend API** (Port 4000) - Express REST API + Lightning payments
2. **WebSocket Server** (Port 3001) - Real-time game engine
3. **Frontend App** (Expo) - React Native mobile app

## Architecture Flow

```
Frontend (Mobile)
    ↓
    ├──→ Backend API (REST)     → LNbits (Lightning)
    └──→ WebSocket Server       → Backend API (payment verification)
```

## Port Configuration

| Service | Port | Configurable |
|---------|------|--------------|
| Backend API | 4000 | Yes (`.env`) |
| WebSocket | 3001 | Yes (edit `websocket/src/index.ts`) |
| Frontend | N/A | Connects to above |

## Step-by-Step Integration

### 1. Configure Backend

```bash
cd lightning-reaction/backend
cp .env.example .env
```

Edit `.env`:
```env
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3001,http://localhost:19006
JWT_SECRET=your-secret-here-change-me
DB_PATH=./data/app.sqlite

# LNbits credentials (get from https://legend.lnbits.com)
LNBITS_URL=https://legend.lnbits.com
LNBITS_ADMIN_KEY=your_admin_key_here
LNBITS_INVOICE_KEY=your_invoice_key_here

ENTRY_FEE=100
HOUSE_EDGE=0.10
WEBHOOK_SECRET=your-webhook-secret
```

**Important:** 
- Add WebSocket port to `CORS_ORIGIN`
- Add Expo dev server (usually `http://localhost:19006`) to `CORS_ORIGIN`
- Get real LNbits keys from https://legend.lnbits.com

### 2. Configure WebSocket

The WebSocket server needs to know where the backend API is.

Edit `lightning-reaction/websocket/src/index.ts`:

```typescript
const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:4000';
```

Or create a `.env` file in `websocket/`:
```env
PORT=3001
BACKEND_API_URL=http://localhost:4000
```

### 3. Configure Frontend

Edit `lightning-reaction/frontend/src/constants/theme.ts`:

```typescript
// For iOS Simulator / Android Emulator development:
export const API_URL = 'http://10.0.2.2:4000'; // Android emulator
// export const API_URL = 'http://localhost:4000'; // iOS simulator
export const WS_URL = 'ws://10.0.2.2:3001';

// For physical device on same network:
// export const API_URL = 'http://192.168.1.X:4000'; // Your computer's IP
// export const WS_URL = 'ws://192.168.1.X:3001';
```

**Network Mapping:**
- `localhost` = iOS simulator only
- `10.0.2.2` = Android emulator → host machine
- `192.168.1.X` = Physical device → your computer's local IP

### 4. Start All Services

Open **three terminal windows**:

**Terminal 1 - Backend:**
```bash
cd lightning-reaction/backend
npm install
npm run dev
```

**Terminal 2 - WebSocket:**
```bash
cd lightning-reaction/websocket
npm install
npm run dev
```

**Terminal 3 - Frontend:**
```bash
cd lightning-reaction/frontend
npm install
npx expo start
```

### 5. Test the Integration

1. **Verify Backend:**
   ```bash
   curl http://localhost:4000/healthz
   # Should return: {"ok":true}
   ```

2. **Verify WebSocket:**
   - Check Terminal 2 logs: "Server listening on port 3001"

3. **Test Frontend:**
   - Scan QR code with Expo Go app
   - Enter any test pubkey (e.g., `npub1test...`)
   - Click "Play Now"
   - Verify payment modal appears

### 6. Test Payment Flow (End-to-End)

**With Real LNbits:**
1. Configure LNbits keys in backend `.env`
2. Click "Play Now" in app
3. Pay the Lightning invoice with a wallet
4. Backend webhook confirms payment
5. WebSocket adds you to game room
6. Game starts when 2+ players join

**Mock Testing (No LNbits):**
- Temporarily modify backend to auto-confirm payments for testing
- Or use LNbits testnet: https://testnet.lnbits.com

## WebSocket Events (Reference)

### Client → Server
- `joinRoom` - `{ pubkey, paymentHash }`
- `tap` - `{ timestamp }`
- `leaveRoom` - (no payload)

### Server → Client
- `roomUpdated` - `{ roomId, players, status }`
- `gameStart` - `{ countdown }`
- `showWait` - `{ message }`
- `showGreen` - `{ timestamp }`
- `gameEnd` - `{ winner, reactionTime, prizePool, results }`
- `error` - `{ message }`

## Troubleshooting

### Backend won't start
- Check `.env` file exists
- Verify `JWT_SECRET` is set
- Check port 4000 not already in use: `lsof -i :4000`

### WebSocket connection fails
- Verify WebSocket is running: `lsof -i :3001`
- Check CORS settings in `websocket/src/index.ts`
- Verify frontend has correct `WS_URL`

### Frontend can't reach backend
- Android emulator: Use `10.0.2.2` not `localhost`
- Physical device: Use your computer's local IP (e.g., `192.168.1.X`)
- Check firewall isn't blocking ports 4000/3001
- Verify both services are running: `lsof -i :4000,3001`

### Payment webhook not working
- Check `WEBHOOK_SECRET` matches between backend and LNbits
- Verify webhook URL in LNbits settings: `http://your-domain/api/webhook/payment`
- For local dev, use ngrok to expose backend: `ngrok http 4000`

## Production Deployment

### Backend
- Deploy to VPS, Railway, or Render
- Use HTTPS (required for Lightning)
- Set production `CORS_ORIGIN`
- Use strong `JWT_SECRET` and `WEBHOOK_SECRET`

### WebSocket
- Deploy alongside backend (same server)
- Configure nginx for WebSocket proxying
- Use WSS (secure WebSocket) in production

### Frontend
- Build APK: `npx expo build:android`
- Sign with keystore
- Update `API_URL` and `WS_URL` to production URLs
- Submit to Zapstore

## Next Steps

1. ✅ All services integrated
2. ⏳ Test with real Lightning payments
3. ⏳ Add error handling polish
4. ⏳ Build production APK
5. ⏳ Deploy backend + WebSocket
6. ⏳ Submit to Zapstore

---

**Status:** Integration complete, ready for testing
**Last Updated:** 2026-02-14
