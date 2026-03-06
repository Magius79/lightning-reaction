# Deployment Checklist

Complete production deployment checklist for Lightning Reaction Tournament.

## Pre-Deployment

### LNbits Setup
- [ ] LNbits instance accessible (not localhost)
- [ ] Wallet created and funded
- [ ] Admin API key copied
- [ ] Invoice/Read API key copied
- [ ] Test API keys with curl/Postman

### Security
- [ ] Generate strong JWT_SECRET (32+ characters)
- [ ] Generate WEBHOOK_SECRET (optional)
- [ ] Prepare CORS_ORIGIN list (frontend domains)
- [ ] Review rate limits (backend: 120 req/min)

### Testing
- [ ] Backend runs locally with `.env` file
- [ ] WebSocket server connects to backend
- [ ] Frontend connects to both services
- [ ] Payment invoice generation works
- [ ] Webhook handling tested (mock payment)
- [ ] End-to-end game flow tested

## Backend Deployment (Railway)

### Railway Account
- [ ] Railway account created at [railway.app](https://railway.app)
- [ ] Payment method added (for production)
- [ ] GitHub repository connected (or CLI installed)

### Backend Service
- [ ] Railway project created
- [ ] Backend deployed from GitHub/CLI
- [ ] Environment variables configured:
  - [ ] `JWT_SECRET`
  - [ ] `LNBITS_URL`
  - [ ] `LNBITS_ADMIN_KEY`
  - [ ] `LNBITS_INVOICE_KEY`
  - [ ] `ENTRY_FEE` (default: 100)
  - [ ] `HOUSE_EDGE` (default: 0.1)
  - [ ] `CORS_ORIGIN`
  - [ ] `DB_PATH=/app/data/app.sqlite`
- [ ] Volume added for database (`/app/data`)
- [ ] Health check passing (`/healthz`)
- [ ] Railway domain assigned (e.g., `*.railway.app`)
- [ ] Custom domain configured (optional)
- [ ] SSL certificate active

### WebSocket Service
- [ ] Separate Railway service created for WebSocket
- [ ] WebSocket deployed from `websocket/` directory
- [ ] Environment variables configured:
  - [ ] `PORT=3001`
  - [ ] `BACKEND_URL=https://your-backend.railway.app`
  - [ ] `CORS_ORIGIN`
- [ ] Railway domain assigned
- [ ] Health check passing

### Post-Deployment Testing
- [ ] Backend health: `curl https://backend.railway.app/healthz`
- [ ] WebSocket connection test
- [ ] Create test invoice via API
- [ ] Verify database persists across deploys
- [ ] Check logs for errors
- [ ] Test rate limiting
- [ ] Verify CORS with frontend domain

## LNbits Webhook Configuration

- [ ] LNbits webhook URL set to: `https://backend.railway.app/api/webhook`
- [ ] Webhook secret matches `WEBHOOK_SECRET` (if used)
- [ ] Test webhook with real payment (small amount)
- [ ] Verify payment marks room as paid in database
- [ ] Check backend logs for webhook events

## Frontend Updates

- [ ] Update `frontend/src/constants/theme.ts`:
  ```typescript
  export const API_URL = 'https://your-backend.railway.app';
  export const WS_URL = 'wss://your-websocket.railway.app';
  ```
- [ ] Test frontend connects to production backend
- [ ] Test login with Nostr keypair
- [ ] Test room creation and payment flow
- [ ] Test game play (end-to-end)

## Android Build (Zapstore)

### Prerequisites
- [ ] Expo dev account created
- [ ] Android keystore generated
- [ ] Signing keys backed up securely

### Build Process
- [ ] `npx expo prebuild` generates native Android project
- [ ] Configure `app.json` with production values:
  - [ ] `version`, `versionCode`
  - [ ] `package` identifier
  - [ ] Icons and splash screen
- [ ] Build release APK: `./gradlew assembleRelease`
- [ ] Sign APK with keystore
- [ ] Test APK on device (install via adb)

### Zapstore Submission
- [ ] Create Nostr keypair for app identity
- [ ] Prepare app metadata:
  - [ ] Name, description, icons
  - [ ] Screenshots
  - [ ] Category, tags
- [ ] Upload APK to web-accessible URL
- [ ] Create NIP-78 event (app metadata)
- [ ] Broadcast event to Nostr relays
- [ ] Verify listing on [zapstore.dev](https://zapstore.dev)

## Monitoring & Maintenance

### Railway Monitoring
- [ ] Railway logs monitored (errors, crashes)
- [ ] Metrics dashboard reviewed (CPU, memory, network)
- [ ] Alerts configured (deploy failures, crashes)
- [ ] Database backup strategy planned

### Application Monitoring
- [ ] Error tracking setup (Sentry/similar)
- [ ] Analytics configured (user count, game count)
- [ ] Lightning payment tracking (volume, failures)
- [ ] Leaderboard reviewed for anomalies

### Ongoing Tasks
- [ ] Regular dependency updates
- [ ] Security patches applied
- [ ] Database backups tested
- [ ] Performance monitoring
- [ ] User feedback review

## Launch Checklist

### Pre-Launch
- [ ] All tests passing
- [ ] Production config verified
- [ ] Backups working
- [ ] Monitoring active
- [ ] Support channels ready (Discord/Nostr)

### Launch Day
- [ ] Deploy final version to Railway
- [ ] Publish APK to Zapstore
- [ ] Announce on Nostr
- [ ] Monitor first 24h closely
- [ ] Be ready for hot fixes

### Post-Launch
- [ ] Collect user feedback
- [ ] Monitor payment flows
- [ ] Track error rates
- [ ] Plan feature updates
- [ ] Build community

## Rollback Plan

### If Critical Issue Found
1. **Identify Issue**: Logs, metrics, user reports
2. **Assess Impact**: How many users affected?
3. **Quick Fix or Rollback**:
   - Railway: Revert to previous deploy
   - Zapstore: Cannot force update, but can update listing
4. **Communicate**: Update users on status
5. **Fix Root Cause**: Test thoroughly before re-deploy

### Railway Rollback
```bash
railway logs --tail 100  # Check recent errors
railway rollback         # Revert to previous deploy
```

## Success Metrics

### Week 1
- [ ] 100+ app installs
- [ ] 50+ completed games
- [ ] <5% payment failure rate
- [ ] <1% crash rate
- [ ] Average game time <60 seconds

### Month 1
- [ ] 1000+ installs
- [ ] 500+ active players
- [ ] 10,000+ sats in entry fees
- [ ] Positive user reviews
- [ ] Growing community engagement

---

**Note**: This is a living document. Update as deployment process evolves.
