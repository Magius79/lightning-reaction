# WebSocket & Game Logic Spec (Grok 3)

## Your Mission
Build the real-time game engine using WebSockets. Handle room matching, game state, and determine winners.

## Tech Stack
- Socket.io (server-side)
- Node.js
- In-memory state (Redis optional)
- Connect to Express backend

## Game State Machine

```
WAITING → STARTING → COUNTDOWN → READY → FINISHED
   ↑                                          ↓
   └──────────────────────────────────────────┘
```

**States:**
- `WAITING`: Room has <2 players
- `STARTING`: 2+ players paid, 3-second countdown
- `COUNTDOWN`: 3..2..1.. before wait screen
- `READY`: Random delay (2-8s), then GREEN signal
- `FINISHED`: First tap recorded, winner determined

## WebSocket Events

### **Client → Server:**

**`joinRoom`**
```typescript
// Payload: { pubkey: string, paymentHash: string }
// Verify payment with backend
// Add to next available room or create new one
// Emit roomUpdated to all players in room
```

**`tap`**
```typescript
// Payload: { timestamp: number }
// Record tap time (server timestamp)
// If first tap after green: winner!
// If tap before green: disqualified
// Emit gameEnd to all players
```

**`leaveRoom`**
```typescript
// Remove player from room
// If game active: forfeit
// If waiting: refund (via backend)
```

### **Server → Client:**

**`roomUpdated`**
```typescript
// Payload: { roomId, players: [], status, countdown }
// Sent when: player joins, leaves, payment confirmed
```

**`gameStart`**
```typescript
// Payload: { countdown: 3 }
// Sent when: room has 2+ players
// Countdown 3..2..1..
```

**`showWait`**
```typescript
// Payload: { message: "WAIT..." }
// Sent after countdown
// Random delay before green (2-8 seconds)
```

**`showGreen`**
```typescript
// Payload: { timestamp: number }
// Sent to all players simultaneously
// Server timestamp for fairness
```

**`gameEnd`**
```typescript
// Payload: { 
//   winner: pubkey, 
//   reactionTime: number,
//   prizePool: number,
//   results: [{ pubkey, tapTime, reactionTime }]
// }
// Trigger payout via backend
// Update player stats
```

**`error`**
```typescript
// Payload: { message: string }
// Sent for: invalid tap, payment failed, etc.
```

## Room Management

### Room Creation
```typescript
// Auto-create rooms when players join
// Max 10 players per room (configurable)
// Entry fee: 100 sats (validated with backend)
```

### Matchmaking
```typescript
// Simple FIFO queue
// Players join next available room
// Room starts when 2+ players ready
// Optional: skill-based matching (MVP: random)
```

### Room Cleanup
```typescript
// Close room after game finishes
// Archive game data to backend
// Recycle room ID after 5 minutes
```

## Anti-Cheat Logic

### Premature Tap Detection
```typescript
// If tap before showGreen: disqualify
// Emit error: "Too early! Wait for green."
// Don't count tap
```

### Unrealistic Reaction Times
```typescript
// Human reaction time: 150-300ms average
// Flag if <50ms (likely bot/cheat)
// Allow but log for review
// Backend can ban repeat offenders
```

### Multiple Connections
```typescript
// Track connections by IP
// Max 2 connections per IP in same room
// Disconnect duplicates
```

### Timing Validation
```typescript
// Use server timestamps (not client)
// Calculate reaction time server-side
// First valid tap wins (after green shown)
```

## Game Flow (Detailed)

1. **Player A joins:**
   - Verify payment with backend
   - Add to waiting room
   - Emit `roomUpdated`

2. **Player B joins:**
   - Verify payment
   - Add to same room
   - Room now has 2 players
   - Emit `gameStart` with 3-second countdown

3. **Countdown:**
   - Emit `3`, `2`, `1` to all players
   - Then emit `showWait`

4. **Wait Phase:**
   - Random delay: 2-8 seconds
   - Server picks random time
   - Emit `showGreen` with server timestamp

5. **Tap Phase:**
   - First tap after green wins
   - Calculate reaction time: tapTime - greenTime
   - Emit `gameEnd` with winner + results

6. **Payout:**
   - Call backend API to payout winner
   - Update player stats
   - Close room

## State Management

```typescript
interface Room {
  id: string;
  status: 'waiting' | 'starting' | 'countdown' | 'ready' | 'finished';
  players: Map<socketId, PlayerState>;
  entryFee: number;
  prizePool: number;
  greenTimestamp: number | null;
  startTime: number;
}

interface PlayerState {
  socketId: string;
  pubkey: string;
  paid: boolean;
  tapTime: number | null;
  reactionTime: number | null;
  disqualified: boolean;
}
```

## File Structure

```
websocket/
├── src/
│   ├── index.ts (Socket.io server)
│   ├── rooms/
│   │   ├── RoomManager.ts
│   │   ├── Room.ts
│   │   └── Matchmaker.ts
│   ├── game/
│   │   ├── GameEngine.ts
│   │   ├── AntiCheat.ts
│   │   └── StateMachine.ts
│   ├── events/
│   │   ├── handlers.ts
│   │   └── emitters.ts
│   └── utils/
│       └── timing.ts
├── package.json
└── tsconfig.json
```

## Performance Requirements

- **Latency:** <50ms for tap registration
- **Fairness:** All players get `showGreen` within 10ms
- **Scalability:** Support 100 concurrent rooms (1000 players)
- **Reliability:** No dropped connections during game

## Deliverables

1. Socket.io server with all events
2. Room management & matchmaking
3. Game state machine
4. Anti-cheat logic
5. Integration with backend API
6. README with setup instructions

## Testing Checklist

- [ ] Can handle multiple simultaneous rooms
- [ ] Countdown timing is accurate
- [ ] Green signal sent to all players simultaneously
- [ ] First tap after green wins
- [ ] Premature taps are rejected
- [ ] Room cleanup works correctly
- [ ] Reconnection handling
- [ ] Stress test with 100+ concurrent players

## Notes

- Don't worry about Lightning - backend handles that
- Focus on low-latency, fair gameplay
- Use server timestamps for all timing
- Log all game events for debugging

**Start with:** Room creation + basic state machine, then add game logic.
