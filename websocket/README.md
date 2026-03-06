# Lightning Reaction Tournament - WebSocket Server

This is the WebSocket server for the Lightning Reaction Tournament, a real-time reaction game integrated with Lightning payments.

## Overview

The server handles real-time game logic using Socket.io, manages game rooms, implements a state machine for game progression, and includes anti-cheat mechanisms to ensure fair play.

## Tech Stack
- **Socket.io**: For real-time WebSocket communication
- **Node.js**: Runtime environment
- **TypeScript**: For type-safe development
- **Axios**: For HTTP requests to the backend API

## Setup Instructions

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Backend API running at `http://localhost:3000`

### Installation
1. Clone the repository (if not already done):
   ```bash
   git clone <repository-url>
   cd lightning-reaction/websocket
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the TypeScript code:
   ```bash
   npm run build
   ```
4. Start the server:
   ```bash
   npm start
   ```
   Alternatively, for development mode with live reload:
   ```bash
   npm run dev
   ```

### Configuration
- The server runs on port `3001` by default. You can change this by setting the `PORT` environment variable:
  ```bash
  export PORT=4000
  npm start
  ```
- Ensure the backend API URL in `RoomManager.ts` and `GameEngine.ts` matches your setup (default: `http://localhost:3000`).

## Game Flow
1. **Player Joins**: Connects via WebSocket, payment verified with backend.
2. **Room Assignment**: Player added to an available room or a new one is created.
3. **Game Start**: When 2+ players are ready, a 3-second countdown begins.
4. **Wait Phase**: Random delay (2-8s) before showing the green signal.
5. **Tap Phase**: First player to tap after green wins.
6. **Game End**: Winner determined, payout triggered via backend, room cleaned up.

## WebSocket Events
- **Client to Server**:
  - `joinRoom`: `{ pubkey, paymentHash }`
  - `tap`: `{ timestamp }`
  - `leaveRoom`: No payload
- **Server to Client**:
  - `roomUpdated`: Room status and player list
  - `gameStart`: Countdown start
  - `showWait`: Wait message
  - `showGreen`: Green signal with timestamp
  - `gameEnd`: Game results and winner
  - `error`: Error messages

## Performance
- **Latency**: <50ms for tap registration
- **Fairness**: Green signal sent to all players within 10ms
- **Scalability**: Supports 100+ concurrent rooms

## Testing
To test the server:
1. Ensure the backend API is running.
2. Start the WebSocket server.
3. Use a Socket.io client or the provided test script to simulate player connections.
4. Verify room creation, game state transitions, and winner determination.

## Troubleshooting
- **Connection Issues**: Check if the server is running and the port is accessible.
- **Payment Verification Failures**: Ensure the backend API is up and correctly configured.
- **Latency Problems**: Monitor server load and network conditions.

## License
MIT
