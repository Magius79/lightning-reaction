# Testing Guide

## Pre-Flight Checks

Before testing, ensure all services are running:

```bash
# Check Backend
curl http://localhost:4000/healthz
# Expected: {"ok":true}

# Check WebSocket (via browser console or wscat)
# Install wscat if needed: npm install -g wscat
wscat -c ws://localhost:3001
# Should connect successfully
```

## Test Scenarios

### 1. Basic Flow (Mock Payment)

**Goal:** Test the game flow without real Lightning payments.

**Setup:**
1. Temporarily disable payment verification in backend
2. Or use LNbits testnet: https://testnet.lnbits.com

**Steps:**
1. Open app in Expo Go
2. Enter test pubkey: `npub1test123`
3. Click "Play Now"
4. Click "Simulate Payment" (or pay testnet invoice)
5. Should see "Waiting for players..."
6. Open second device/emulator
7. Repeat steps 2-4
8. Game should start with countdown
9. Wait for green screen
10. TAP as fast as possible!
11. Winner should see prize + confetti

**Expected:**
- Room created successfully
- Both players added to room
- Game countdown starts
- Green signal shows
- Winner determined correctly
- Payout calculated (shown in results)

---

### 2. Payment Flow (Real Lightning)

**Goal:** Test actual Lightning payments end-to-end.

**Prerequisites:**
- LNbits account (legend.lnbits.com or testnet)
- Admin and Invoice keys configured in backend `.env`
- Lightning wallet with sats

**Steps:**
1. Configure backend with real LNbits keys
2. Start all services
3. Open app, click "Play Now"
4. Backend generates invoice (100 sats)
5. Pay invoice with Lightning wallet
6. Backend webhook confirms payment
7. Player added to game room
8. Game proceeds normally

**Expected:**
- Invoice generated correctly
- QR code displays in app
- Payment detected within seconds
- Player immediately added to room
- No "payment pending" errors

**Debug:**
```bash
# Watch backend logs
cd backend && npm run dev
# Should see: "Payment confirmed: <hash>"

# Check webhook delivery (LNbits admin panel)
# Webhooks → Check delivery status
```

---

### 3. Anti-Cheat Testing

**Goal:** Verify anti-cheat logic catches cheating attempts.

**Test Cases:**

**A. Premature Tap:**
1. Start game
2. During countdown (before green), tap screen
3. **Expected:** "Too early! Wait for green." error

**B. Unrealistic Reaction Time:**
- Difficult to test manually (need <50ms)
- Check server logs for flagged times
- Could modify client to send fake timestamps

**C. Multiple Connections:**
1. Open app on 2 devices with same IP
2. Try joining same room
3. **Expected:** Second connection rejected or flagged

---

### 4. Room Management

**Goal:** Test room lifecycle and edge cases.

**Test Cases:**

**A. Room Fill-Up:**
1. Start with empty server
2. Join with multiple players (2-10)
3. **Expected:** All added to same room until full

**B. Player Leave:**
1. Join room
2. Close app before game starts
3. **Expected:** Player removed, room continues

**C. Room Cleanup:**
1. Complete a game
2. Check server logs
3. **Expected:** Room archived after game ends

---

### 5. Performance Testing

**Goal:** Verify low latency and fair green signal.

**Tools:**
```bash
# Install artillery for load testing
npm install -g artillery

# Create artillery.yml:
cat > artillery.yml << 'EOF'
config:
  target: "ws://localhost:3001"
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - engine: socketio
    flow:
      - emit:
          channel: "joinRoom"
          data:
            pubkey: "test_{{ $uuid }}"
            paymentHash: "hash_{{ $uuid }}"
EOF

# Run test
artillery run artillery.yml
```

**Expected:**
- <50ms average latency
- No dropped connections
- All players receive `showGreen` within 10ms

---

### 6. Mobile Device Testing

**Goal:** Test on real Android hardware.

**Setup:**
1. Connect phone to same WiFi
2. Get computer's local IP: `ifconfig` or `ipconfig`
3. Update `frontend/src/constants/theme.ts`:
   ```typescript
   export const API_URL = 'http://192.168.1.X:4000'; // Your IP
   export const WS_URL = 'ws://192.168.1.X:3001';
   ```
4. Rebuild: `npx expo start --clear`

**Test:**
- All core flows (login, payment, game)
- Touch responsiveness
- Network switching (WiFi → cellular)
- Background/foreground transitions

---

## Common Issues

### Payment Not Confirming
**Symptom:** Stuck on "Waiting for payment..."  
**Debug:**
1. Check backend logs for webhook calls
2. Verify `WEBHOOK_SECRET` matches LNbits
3. Check LNbits webhook URL is correct
4. For local dev, use ngrok: `ngrok http 4000`

### WebSocket Disconnects
**Symptom:** "Disconnected from server" error  
**Debug:**
1. Check firewall/antivirus blocking port 3001
2. Verify CORS settings in `websocket/src/index.ts`
3. Check network stability (especially on mobile)

### Game Doesn't Start
**Symptom:** Stuck in "Waiting for players..."  
**Debug:**
1. Check if second player joined successfully (backend logs)
2. Verify WebSocket events firing (add console.logs)
3. Check room state in server: `rooms.get(roomId)`

### Tap Not Registering
**Symptom:** Tapped but no reaction  
**Debug:**
1. Check if green signal was shown (timing)
2. Verify WebSocket connection active
3. Check server logs for received `tap` events
4. Ensure tap detection enabled in game screen

---

## Manual Test Checklist

Before deploying or submitting to Zapstore:

- [ ] Can log in with Nostr pubkey
- [ ] Can generate Lightning invoice
- [ ] Can pay invoice and join room
- [ ] Can see other players in room
- [ ] Game countdown works correctly
- [ ] Green signal shows simultaneously
- [ ] Tap detection is responsive (<100ms)
- [ ] Winner determined correctly
- [ ] Payout amount calculated right
- [ ] Leaderboard updates after game
- [ ] Can play multiple rounds
- [ ] Animations smooth on Android
- [ ] No crashes or freezes
- [ ] Works on 3G/4G (not just WiFi)
- [ ] Background/foreground works

---

## Next Steps

Once all tests pass:
1. Deploy backend + WebSocket to VPS
2. Update frontend URLs to production
3. Build production APK
4. Test on multiple Android devices
5. Submit to Zapstore with screenshots

---

**Good luck! ⚡🎮**
