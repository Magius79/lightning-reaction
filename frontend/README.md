# Lightning Reaction Tournament - Frontend

Skill-based Android game with Lightning payments.

## Tech Stack
- **React Native / Expo**
- **TypeScript**
- **Socket.io** (Real-time updates)
- **Lucide React Native** (Icons)
- **React Navigation**
- **React Native Reanimated** (Smooth animations)

## Features Built
- [x] **Nostr Login**: Simple pubkey entry (extensible to NIP-07)
- [x] **Home Dashboard**: View stats and leaderboard preview
- [x] **Payment Flow**: Modal with QR code and "Open in Wallet" (WebLN/Lightning intent)
- [x] **Game Room**: WebSocket-powered real-time reaction game
- [x] **Global Leaderboard**: Ranking system for wins and reaction times
- [x] **Haptic/Visual Feedback**: Green/Red flash states for reaction timing

## Setup & Running

1. **Install Dependencies**:
   ```bash
   cd lightning-reaction/frontend
   npm install
   ```

2. **Start Development Server**:
   ```bash
   npx expo start
   ```

3. **Run on Android**:
   - Install the **Expo Go** app on your Android device.
   - Scan the QR code shown in the terminal.
   - Or run `npm run android` if you have an emulator/device connected via ADB.

## Development Configuration

- **API URL**: `http://localhost:3000` (Edit in `src/constants/theme.ts`)
- **WebSocket**: `ws://localhost:3000`

## Project Structure
- `src/screens/`: Navigation screens (Login, Home, Game, Leaderboard)
- `src/components/`: Reusable UI components (PaymentModal)
- `src/services/`: API and WebSocket logic
- `src/constants/`: Theme and configuration

## Notes
- The Lightning payment is currently simulated for development. It expects the backend to provide a valid BOLT11 invoice.
- WebSocket events are mapped to the backend spec: `joinRoom`, `tap`, `roomUpdated`, `gameStart`, `showGreen`, `gameEnd`.
