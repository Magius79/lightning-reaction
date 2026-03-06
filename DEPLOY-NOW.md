# Deploy Now - Quick Start

**Ready to go live? Follow this streamlined guide.**

## Option 1: Deploy to Railway (Easiest - 15 minutes)

[Railway](https://railway.app) handles infrastructure automatically.

### Backend + WebSocket

1. **Sign up:** https://railway.app (free tier available)

2. **Create new project** → "Deploy from GitHub repo"

3. **Add Backend service:**
   - Root Directory: `backend`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Add environment variables (from `.env.example`)

4. **Add WebSocket service:**
   - Root Directory: `websocket`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Environment: `BACKEND_API_URL=https://your-backend.railway.app`

5. **Enable public networking** for both services

6. **Note your URLs:**
   - Backend: `https://xyz.railway.app`
   - WebSocket: `wss://abc.railway.app`

**Cost:** Free tier includes $5/month credit (enough for MVP)

---

## Option 2: Deploy to Render (Easy - 20 minutes)

[Render](https://render.com) is similar to Railway.

### Backend

1. Sign up at https://render.com
2. New → Web Service
3. Connect GitHub repo
4. Configuration:
   - Name: `lightning-reaction-backend`
   - Root Directory: `backend`
   - Build: `npm install && npm run build`
   - Start: `node dist/index.js`
   - Add environment variables

### WebSocket

1. New → Web Service
2. Same repo
3. Configuration:
   - Name: `lightning-reaction-websocket`
   - Root Directory: `websocket`
   - Build: `npm install && npm run build`
   - Start: `node dist/index.js`
   - Environment: `BACKEND_API_URL=https://your-backend.onrender.com`

**Cost:** Free tier available (services sleep after inactivity)

---

## Option 3: VPS (Full Control - 1-2 hours)

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete guide.

**Quick version:**

### 1. Get VPS
- DigitalOcean: $6/month
- Hetzner: €4/month
- Linode: $5/month

### 2. Run helper script
```bash
./deploy-helper.sh
```

### 3. SSH to server
```bash
ssh deploy@your-server-ip
```

### 4. Install PM2 and start services
```bash
sudo npm install -g pm2
cd lightning-reaction
pm2 start ecosystem.config.js
```

### 5. Setup Nginx + SSL
```bash
sudo apt install nginx certbot python3-certbot-nginx
# Follow DEPLOYMENT.md Part 4
```

---

## After Deployment (All Options)

### 1. Update Frontend URLs

Edit `frontend/src/constants/theme.ts`:
```typescript
export const API_URL = 'https://your-backend-url';
export const WS_URL = 'wss://your-websocket-url';
```

### 2. Configure LNbits Webhook

1. Login to https://legend.lnbits.com
2. Extensions → Webhooks
3. Add webhook:
   - URL: `https://your-backend-url/api/webhook/payment`
   - Secret: (from your backend `WEBHOOK_SECRET`)

### 3. Test It Works

```bash
# Test backend
curl https://your-backend-url/healthz
# Should return: {"ok":true}

# Test full flow
# 1. Open frontend app
# 2. Click "Play Now"
# 3. Pay invoice
# 4. Should join room successfully
```

---

## Build Android APK

### Quick Method (5 minutes)

```bash
cd frontend
npm install -g eas-cli
eas login
eas build -p android
```

Follow prompts. APK will be ready in ~10 minutes.

### Local Method (15 minutes)

```bash
cd frontend
npx expo prebuild
cd android
./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

---

## Submit to Zapstore

### 1. Sign APK

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore lr.keystore \
  -alias lr \
  -keyalg RSA -keysize 2048 -validity 10000

jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore lr.keystore app-release.apk lr
```

### 2. Upload APK

- GitHub Releases
- Your website
- Or any public URL

### 3. Create Nostr Event

Use a Nostr client to publish (kind: 32267):

```json
{
  "kind": 32267,
  "tags": [
    ["d", "lightning-reaction"],
    ["name", "Lightning Reaction Tournament"],
    ["about", "Fast reaction game with Lightning stakes"],
    ["url", "https://your-url/app.apk"],
    ["hash", "sha256:YOUR_APK_SHA256"],
    ["version", "1.0.0"],
    ["platform", "android"]
  ]
}
```

Get SHA256:
```bash
sha256sum app-release.apk
```

### 4. Verify in Zapstore

Open https://zap.store and search for your app.

---

## Recommended Path for Beginners

1. **Deploy:** Railway (easiest)
2. **Test:** With testnet sats first
3. **Switch:** To mainnet when confident
4. **Monitor:** Check logs daily for first week
5. **Upgrade:** To VPS when you outgrow free tier

---

## Cost Breakdown

| Service | Cost |
|---------|------|
| Railway/Render (free tier) | $0-5/month |
| VPS (if you outgrow free tier) | $6/month |
| Domain (optional) | $10-15/year |
| **Total to start:** | **$0-5/month** |

---

## Support

- **Setup issues:** Review DEPLOYMENT.md
- **Test failed:** Review TEST.md
- **Integration issues:** Review INTEGRATION.md
- **General questions:** Check README.md

---

## One More Thing

**Start small:**
- Deploy to Railway/Render first
- Test with friends using testnet
- Collect feedback
- Iterate quickly
- Then consider VPS for full control

**Don't overcomplicate it.** Get v1 live, learn from real users, improve.

🚀 **You got this!**
