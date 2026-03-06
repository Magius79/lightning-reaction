# Frontend Spec - React Native App (Gemini 3 Flash)

## Your Mission
Build the React Native mobile app for Lightning Reaction Tournament.

## Tech Stack
- React Native (Expo or bare workflow)
- TypeScript
- WebLN for Lightning payments
- Socket.io-client for real-time
- AsyncStorage for local data

## Components to Build

### 1. **Login Screen** (`screens/LoginScreen.tsx`)
```typescript
// Use Nostr login (NIP-07 compatible)
// Show "Connect Wallet" button
// Store pubkey in AsyncStorage
// Navigate to Home on success
```

### 2. **Home Screen** (`screens/HomeScreen.tsx`)
```typescript
// Show user stats (games played, won, avg reaction time)
// "Play Now" button (100 sats)
// Leaderboard preview (top 10)
// Settings button
```

### 3. **Game Screen** (`screens/GameScreen.tsx`)
```typescript
// States: Waiting, Countdown, Wait, Ready (green), Result
// Full-screen tap area
// Show other players in room (2-10)
// Real-time countdown timer
// Victory/defeat animation
// "Play Again" button
```

### 4. **Leaderboard Screen** (`screens/LeaderboardScreen.tsx`)
```typescript
// List of top players
// Show: rank, name, games won, avg reaction time
// Highlight current user
// Refresh button
```

### 5. **Payment Component** (`components/PaymentModal.tsx`)
```typescript
// Show Lightning invoice QR code
// "Open in Wallet" button (WebLN)
// Payment confirmation animation
// Timeout after 60 seconds
```

## WebSocket Events (client-side)

**Emit:**
- `joinRoom` - { pubkey, entryFee }
- `tap` - { timestamp }
- `leaveRoom`

**Listen:**
- `roomUpdated` - { players, status }
- `gameStart` - { countdown }
- `showGreen` - { timestamp }
- `gameEnd` - { winner, prizePool }
- `error` - { message }

## UI/UX Requirements

1. **Colors:**
   - Background: Dark (#1a1a1a)
   - Primary: Bitcoin Orange (#f7931a)
   - Success: Green (#00ff00)
   - Danger: Red (#ff0000)

2. **Animations:**
   - Smooth screen transitions
   - Pulse effect on "Wait..."
   - Flash effect on green signal
   - Confetti for winner

3. **Mobile-first:**
   - Large tap targets
   - Portrait mode only
   - No scrolling during game
   - Haptic feedback on tap

4. **Performance:**
   - Minimize re-renders during game
   - Preload all assets
   - <100ms tap-to-response latency

## File Structure

```
frontend/
├── App.tsx
├── src/
│   ├── screens/
│   │   ├── LoginScreen.tsx
│   │   ├── HomeScreen.tsx
│   │   ├── GameScreen.tsx
│   │   └── LeaderboardScreen.tsx
│   ├── components/
│   │   ├── PaymentModal.tsx
│   │   ├── PlayerAvatar.tsx
│   │   └── StatsCard.tsx
│   ├── services/
│   │   ├── websocket.ts
│   │   ├── lightning.ts
│   │   └── nostr.ts
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   └── useLightning.ts
│   └── utils/
│       └── formatting.ts
├── package.json
└── app.json
```

## Deliverables

1. Complete React Native app with all screens
2. WebSocket integration (connect to ws://localhost:3000 for dev)
3. Lightning payment flow (WebLN)
4. Basic Nostr auth (pubkey login)
5. Responsive animations
6. Build instructions in README

## Testing Checklist

- [ ] Can log in with Nostr pubkey
- [ ] Can pay Lightning invoice
- [ ] Can join game room
- [ ] Can see other players
- [ ] Can tap when green shows
- [ ] Can see winner result
- [ ] Can navigate all screens
- [ ] Animations smooth on Android

## Notes

- Don't worry about backend - it will be built separately
- Use mock data for initial testing
- Focus on polish and performance
- Make tap detection as responsive as possible

**Start with:** Login + Home screens, then move to Game screen once those are solid.
