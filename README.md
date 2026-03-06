# ⚡ Lightning Reaction Tournament

A fast-paced skill-based competitive game for Android (Zapstore) where players compete in reaction time tournaments with Lightning micropayments.

## 🎮 Game Concept

- Players pay 100 sats to enter a room (2-10 players)
- Screen shows "WAIT..." then suddenly turns green
- First player to tap wins the pot (minus 10% house fee)
- Rounds take 10-30 seconds
- Pure skill - no gambling mechanics

## 🏗️ Architecture

### Frontend (React Native)
- Native Android app for Zapstore
- Nostr identity integration
- Lightning payments (WebLN)
- Real-time gameplay via WebSockets

### Backend (Node.js)
- REST API for player management
- Lightning integration (LNbits/Alby)
- SQLite database
- Webhook payment handling

### Game Engine (Socket.io)
- Real-time room management
- Matchmaking system
- Game state machine
- Anti-cheat validation

## 📁 Project Structure

```
lightning-reaction/
├── docs/               # Architecture & design docs
├── specs/              # Detailed specs for each component
├── frontend/           # React Native app
├── backend/            # Express API server
├── websocket/          # Socket.io game engine
└── README.md
```

## 🚀 Deployment

### Backend (Railway)

Deploy the backend to Railway with automatic HTTPS and scaling:

```bash
cd backend
railway login
railway init
railway up
```

**Full deployment guide**: See [`docs/RAILWAY_DEPLOYMENT.md`](docs/RAILWAY_DEPLOYMENT.md) for:
- Environment variable setup
- LNbits integration
- Database persistence
- Custom domains
- WebSocket server deployment

### Frontend (Zapstore)

Build and sign the Android APK:

```bash
cd frontend
npx expo prebuild
cd android
./gradlew assembleRelease
```

Submit to Zapstore with NIP-78 event (instructions coming soon).

## 🛠️ Development

Each component is being built by a specialized AI agent:

- **Gemini 3 Flash**: Frontend (React Native)
- **ChatGPT 5.2**: Backend API & Lightning
- **Grok 3**: WebSocket game logic
- **Claude Sonnet 4.5**: Architecture & integration

## 📝 Status

- [x] Architecture designed
- [x] Component specs written
- [x] Frontend development (React Native/Expo)
- [x] Backend development (Express + LNbits)
- [x] WebSocket development (Socket.io game engine)
- [x] **Integration complete** ✨
- [ ] End-to-end testing with real Lightning
- [ ] Production deployment
- [ ] Zapstore submission

## 🚀 Quick Start

### Local Development
```bash
# One-command startup (requires tmux)
./START.sh

# Or manual startup (3 terminals):
cd backend && npm run dev      # Terminal 1
cd websocket && npm run dev    # Terminal 2
cd frontend && npx expo start  # Terminal 3
```

### Deploy to Production
```bash
# Quick deployment guide
cat DEPLOY-NOW.md

# Or full manual deployment
cat DEPLOYMENT.md
```

See [INTEGRATION.md](./INTEGRATION.md) for detailed setup instructions.

## 🚀 Deployment

**Backend:** Railway or VPS with SSL  
**Frontend:** APK built and signed for Zapstore  
**Distribution:** Nostr event (NIP-78) on Zapstore

## 📄 License

MIT

## 🤝 Contributing

This is a prototype being built as a proof-of-concept. Once MVP is complete, contributions welcome!
