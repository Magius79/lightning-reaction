# Getting Started

Quick start guide for Lightning Reaction Tournament development and deployment.

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js 20+ ([nodejs.org](https://nodejs.org))
- Git
- Android device or emulator (for frontend testing)
- LNbits account ([legend.lnbits.com](https://legend.lnbits.com))

### One-Command Startup

From project root:

```bash
./scripts/dev-all.sh
```

This will:
1. Install dependencies for all three services
2. Create `.env` files from examples
3. Start backend (port 4000), WebSocket (port 3001), and frontend (Expo)

**Stop all services**:
```bash
./scripts/stop-all.sh
```

### Manual Setup

#### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your LNbits keys
npm run dev
```

Required environment variables:
- `JWT_SECRET` - Generate with `openssl rand -base64 32`
- `LNBITS_URL` - Your LNbits instance URL
- `LNBITS_ADMIN_KEY` - From LNbits dashboard
- `LNBITS_INVOICE_KEY` - From LNbits dashboard

#### 2. WebSocket Server

```bash
cd websocket
npm install
cp .env.example .env
# Set BACKEND_URL=http://localhost:4000
npm run dev
```

#### 3. Frontend

```bash
cd frontend
npm install
npx expo start
```

Update `src/constants/theme.ts` with your local IP:
```typescript
export const API_URL = 'http://192.168.1.x:4000';  // Your local IP
export const WS_URL = 'ws://192.168.1.x:3001';
```

Scan the QR code with Expo Go app on your Android device.

### Verify Services

```bash
# Backend health
curl http://localhost:4000/healthz
# Response: {"ok":true}

# WebSocket health
curl http://localhost:3001/health
# Response: {"ok":true,"timestamp":...}
```

## 🌐 Production Deployment

### Deploy to Railway

**Backend**:
```bash
cd backend
railway login
railway init
railway up
```

**WebSocket** (separate service):
```bash
cd websocket
railway login
railway init
railway up
```

**Full guide**: See [`docs/RAILWAY_DEPLOYMENT.md`](docs/RAILWAY_DEPLOYMENT.md)

### Build Android APK

```bash
cd frontend
npx expo prebuild
cd android
./gradlew assembleRelease
```

Output: `frontend/android/app/build/outputs/apk/release/app-release.apk`

### Submit to Zapstore

1. Sign APK with your keystore
2. Upload to public URL
3. Create NIP-78 Nostr event with app metadata
4. Broadcast to Nostr relays

## 📚 Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - System design and component overview
- [`docs/INTEGRATION.md`](docs/INTEGRATION.md) - How components communicate
- [`docs/RAILWAY_DEPLOYMENT.md`](docs/RAILWAY_DEPLOYMENT.md) - Railway deployment guide
- [`docs/DEPLOYMENT_CHECKLIST.md`](docs/DEPLOYMENT_CHECKLIST.md) - Pre-launch checklist
- [`specs/*.md`](specs/) - Detailed component specifications

## 🧪 Testing

### Local Testing Flow

1. Start all services with `./scripts/dev-all.sh`
2. Open Expo app on your phone
3. Login with Nostr (you'll need a keypair)
4. Navigate to "Find Room"
5. Create a room → generates Lightning invoice
6. Pay with test wallet or real sats
7. Wait for payment confirmation
8. Room status changes to "Ready to Join"
9. Tap "Join" → connects via WebSocket
10. When 2+ players join, game starts automatically
11. Screen shows "WAIT..." then turns green
12. First to tap wins the pot!

### Payment Testing

**Option 1**: Use real Lightning wallet with small amounts (100 sats = ~$0.10)

**Option 2**: Test mode (requires LNbits setup):
- Set `ENTRY_FEE=1` (minimum 1 sat)
- Use LNbits test wallet with fake balance

**Option 3**: Mock payments (dev only):
- In backend, add development bypass in webhook handler
- **Remove before production!**

## 🛠️ Development Tools

### Logs

**Backend**:
```bash
cd backend
npm run dev
# Or: tail -f logs/backend.log
```

**WebSocket**:
```bash
cd websocket
npm run dev
# Or: tail -f logs/websocket.log
```

**Frontend**:
```bash
cd frontend
npx expo start
# Press 'l' to show logs in terminal
```

### Database Inspection

```bash
cd backend
sqlite3 data/app.sqlite

# Useful queries:
sqlite> .tables
sqlite> SELECT * FROM rooms;
sqlite> SELECT * FROM players;
sqlite> SELECT * FROM games ORDER BY created_at DESC LIMIT 10;
```

### WebSocket Testing

Use `wscat` to test WebSocket connection:

```bash
npm install -g wscat
wscat -c ws://localhost:3001

# Send events:
> {"event":"joinRoom","data":{"roomId":"abc123","token":"..."}}
```

## 🐛 Troubleshooting

### "Cannot connect to backend"
- Check backend is running: `curl http://localhost:4000/healthz`
- Verify frontend `API_URL` uses your local IP (not `localhost`)
- Check firewall allows port 4000

### "WebSocket connection failed"
- Check WebSocket is running: `curl http://localhost:3001/health`
- Verify frontend `WS_URL` uses your local IP
- Android emulator: use `10.0.2.2` instead of `localhost`

### "Invoice generation failed"
- Check LNbits credentials in backend `.env`
- Test LNbits API: `curl -H "X-Api-Key: YOUR_KEY" https://legend.lnbits.com/api/v1/wallet`
- Verify LNbits URL is correct

### "Payment confirmed but can't join"
- Check backend logs for webhook errors
- Verify webhook URL in LNbits matches your backend
- Check database: `SELECT * FROM rooms WHERE id='...'` → `paid` should be 1

### Expo/React Native Issues
- Clear cache: `npx expo start --clear`
- Reinstall: `rm -rf node_modules && npm install`
- Check Expo Go app is up to date

## 📊 Project Structure

```
lightning-reaction/
├── backend/              # REST API (Express + SQLite)
│   ├── src/
│   │   ├── routes/       # API endpoints
│   │   ├── config/       # DB, env, logger
│   │   └── index.ts      # Entry point
│   ├── .env.example
│   └── railway.json      # Railway config
│
├── websocket/            # Game engine (Socket.io)
│   ├── src/
│   │   ├── rooms/        # Room management
│   │   └── index.ts      # WebSocket server
│   └── railway.json
│
├── frontend/             # Android app (React Native)
│   ├── src/
│   │   ├── screens/      # UI screens
│   │   ├── services/     # API/WS clients
│   │   └── constants/    # Config
│   └── app.json          # Expo config
│
├── docs/                 # Documentation
├── specs/                # Component specs
└── scripts/              # Utility scripts
    ├── dev-all.sh        # Start all services
    └── stop-all.sh       # Stop all services
```

## 🎯 Next Steps

1. ✅ Set up local development environment
2. ✅ Get LNbits account and API keys
3. ✅ Test full flow locally
4. 🚀 Deploy to Railway
5. 📱 Build Android APK
6. 🎉 Submit to Zapstore
7. 📣 Launch and market!

## 🤝 Contributing

This is an AI-built project. Each component was designed and implemented by specialized AI models:

- **Architecture**: Claude Sonnet 4.5
- **Frontend**: Gemini 3 Flash Preview
- **Backend**: ChatGPT 5.2
- **WebSocket**: Grok 3

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for design decisions.

## 📄 License

MIT License - See LICENSE file for details.

## 🆘 Support

- **Issues**: Open a GitHub issue
- **Discussions**: GitHub Discussions
- **Nostr**: Follow updates on Nostr (npub coming soon)
- **Zapstore**: [zapstore.dev](https://zapstore.dev)

---

⚡ **Lightning Reaction Tournament** - May the fastest tapper win!
