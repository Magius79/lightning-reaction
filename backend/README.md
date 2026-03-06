# Lightning Reaction Tournament — Backend

Express + TypeScript backend for Lightning Reaction Tournament (SQLite + LNbits).

## Requirements

- Node.js 20+
- An LNbits wallet (testnet recommended for development)

## Setup

```bash
cd lightning-reaction/backend
cp .env.example .env
npm i
npm run dev
```

Server defaults to `http://localhost:4000`.

### Environment variables

- `DB_PATH` – SQLite file location (default `./data/app.sqlite`)
- `JWT_SECRET` – used for login tokens
- `LNBITS_URL`, `LNBITS_INVOICE_KEY`, `LNBITS_ADMIN_KEY` – LNbits credentials
- `ENTRY_FEE` – sats for entry invoice
- `HOUSE_EDGE` – e.g. `0.10`
- `WEBHOOK_SECRET` – optional HMAC secret for webhook authenticity

## API

### POST `/api/auth/login`
Body:
```json
{ "pubkey": "npub_or_pubkey_string" }
```
Returns:
```json
{ "player": {"pubkey":"..."}, "token": "..." }
```

### POST `/api/rooms/join`
Body:
```json
{ "pubkey": "..." }
```
Creates an LN invoice for `ENTRY_FEE` sats and returns:
```json
{ "invoice": "bolt11...", "roomId": "...", "paymentHash": "..." }
```

### GET `/api/rooms/:id`
Returns:
```json
{ "id": "...", "status": "open", "players": [ {"pubkey":"...","paid":false} ], "prizePool": 90 }
```
`prizePool` is computed as `paidPlayers * ENTRY_FEE * (1 - HOUSE_EDGE)`.

### GET `/api/leaderboard?limit=50`
Returns a list of top players:
```json
[{"pubkey":"...","gamesWon":0,"avgReactionTime":null,"totalWinnings":0}]
```

### GET `/api/players/:pubkey`
Returns:
```json
{ "pubkey":"...", "gamesPlayed":0, "gamesWon":0, "avgReactionTime":null }
```

### POST `/api/webhook/payment`
This endpoint confirms entry payments.

Headers:
- `x-webhook-signature`: hex HMAC-SHA256 of the raw request body using `WEBHOOK_SECRET`.
  - If `WEBHOOK_SECRET` is empty, signature is not required (not recommended outside dev).

Body:
```json
{ "paymentHash":"...", "roomId":"...", "pubkey":"..." }
```
Behavior:
- Looks up the pending `entry` transaction by `paymentHash`
- Verifies the invoice is paid by querying LNbits (`GET /api/v1/payments/:hash`)
- Marks transaction confirmed and marks `room_players.paid=1`

## Quick test (no Lightning)

You can start the server and test non-Lightning routes:

```bash
curl http://localhost:4000/healthz
curl -X POST http://localhost:4000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"pubkey":"test-pubkey-1234567890"}'

curl -X GET http://localhost:4000/api/leaderboard
```

`/api/rooms/join` requires LNbits invoice key to be configured.

## Notes on LNbits webhook

LNbits webhook payloads can vary depending on extensions. For MVP reliability we **always** verify payment status directly with LNbits using the `paymentHash`.

If you control the webhook sender, sign payloads with `x-webhook-signature`.

## Production

- Use HTTPS at the reverse proxy
- Set `CORS_ORIGIN` to your frontend origin(s)
- Set a strong `JWT_SECRET`
- Set `WEBHOOK_SECRET` and ensure your webhook caller signs requests
