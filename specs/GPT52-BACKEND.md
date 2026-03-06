# Backend Spec - API & Lightning (ChatGPT 5.2)

## Your Mission
Build the Express backend with REST API and Lightning payment integration.

## Tech Stack
- Node.js 20+
- Express
- LNbits or Alby for Lightning
- SQLite for data
- CORS enabled
- Environment variables for secrets

## API Endpoints

### **POST /api/auth/login**
```typescript
// Body: { pubkey: string }
// Creates or retrieves player record
// Returns: { player: PlayerModel, token: string }
```

### **POST /api/rooms/join**
```typescript
// Body: { pubkey: string }
// Generates Lightning invoice (100 sats)
// Returns: { invoice: string, roomId: string, paymentHash: string }
```

### **GET /api/rooms/:id**
```typescript
// Returns room state
// Returns: { id, status, players, prizePool }
```

### **GET /api/leaderboard**
```typescript
// Query: ?limit=50
// Returns top players
// Returns: [{ pubkey, gamesWon, avgReactionTime, totalWinnings }]
```

### **GET /api/players/:pubkey**
```typescript
// Returns player stats
// Returns: { pubkey, gamesPlayed, gamesWon, avgReactionTime }
```

### **POST /api/webhook/payment**
```typescript
// LNbits/Alby webhook for payment confirmations
// Verifies payment and adds player to room
// Internal endpoint (validate webhook signature)
```

## Lightning Integration

### Invoice Generation
```typescript
// Use LNbits or Alby API
// Amount: 100 sats (configurable)
// Memo: "Lightning Reaction - Entry Fee"
// Expiry: 5 minutes
// Webhook: /api/webhook/payment
```

### Payout
```typescript
// When game ends, pay winner
// Amount: prizePool (total entry fees × 0.9)
// Store transaction ID
// Handle failures gracefully (retry 3x)
```

### Configuration
```
LNBITS_URL=https://legend.lnbits.com
LNBITS_ADMIN_KEY=your_admin_key
LNBITS_INVOICE_KEY=your_invoice_key
ENTRY_FEE=100
HOUSE_EDGE=0.10
```

## Database Schema (SQLite)

### **players**
```sql
CREATE TABLE players (
  pubkey TEXT PRIMARY KEY,
  display_name TEXT,
  games_played INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0,
  total_winnings INTEGER DEFAULT 0,
  avg_reaction_time REAL,
  created_at INTEGER
);
```

### **games**
```sql
CREATE TABLE games (
  id TEXT PRIMARY KEY,
  room_id TEXT,
  winner_pubkey TEXT,
  prize_pool INTEGER,
  num_players INTEGER,
  start_time INTEGER,
  end_time INTEGER,
  created_at INTEGER
);
```

### **game_players**
```sql
CREATE TABLE game_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT,
  pubkey TEXT,
  tap_time INTEGER,
  reaction_time INTEGER,
  paid BOOLEAN,
  payment_hash TEXT,
  FOREIGN KEY (game_id) REFERENCES games(id)
);
```

### **transactions**
```sql
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pubkey TEXT,
  type TEXT, -- 'entry' or 'payout'
  amount INTEGER,
  payment_hash TEXT,
  status TEXT, -- 'pending', 'confirmed', 'failed'
  created_at INTEGER
);
```

## Payment Flow

1. **Entry:**
   - Player requests to join room
   - Generate Lightning invoice
   - Store payment intent in DB
   - Return invoice to client
   - Wait for webhook confirmation
   - Add player to room when paid

2. **Payout:**
   - Game ends (winner determined by Grok)
   - Calculate prize pool
   - Send Lightning payment to winner
   - Update player stats
   - Store transaction record

## Error Handling

- Retry Lightning payments 3 times
- Log all payment failures
- Return clear error messages
- Handle duplicate payments
- Validate all inputs

## Security

- Validate webhook signatures
- Rate limit API endpoints
- Sanitize all inputs
- Use HTTPS in production
- Store admin keys in env vars
- CORS whitelist

## File Structure

```
backend/
├── src/
│   ├── index.ts
│   ├── config/
│   │   ├── database.ts
│   │   └── lightning.ts
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── rooms.ts
│   │   ├── leaderboard.ts
│   │   └── webhook.ts
│   ├── services/
│   │   ├── lightning.ts
│   │   ├── player.ts
│   │   └── game.ts
│   ├── models/
│   │   ├── Player.ts
│   │   ├── Game.ts
│   │   └── Transaction.ts
│   └── utils/
│       └── validation.ts
├── package.json
├── tsconfig.json
└── .env.example
```

## Deliverables

1. REST API with all endpoints
2. Lightning payment integration
3. Database schema & migrations
4. Webhook handler for payment confirmations
5. Error handling & logging
6. README with setup instructions

## Testing Checklist

- [ ] Can create player accounts
- [ ] Can generate Lightning invoices
- [ ] Webhook confirms payments correctly
- [ ] Can retrieve player stats
- [ ] Can fetch leaderboard
- [ ] Payouts work correctly
- [ ] Error handling works
- [ ] Database transactions are atomic

## Notes

- Don't handle WebSocket - that's Grok's job
- Focus on reliability for payments
- Use SQLite for MVP (can upgrade to Postgres later)
- Test with LNbits testnet first

**Start with:** Database schema + auth endpoints, then Lightning integration.
