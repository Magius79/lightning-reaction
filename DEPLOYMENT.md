# Deployment Guide

## Overview

This guide covers deploying Lightning Reaction Tournament to production. We'll deploy:
- **Backend + WebSocket** → VPS with SSL
- **Frontend** → Android APK for Zapstore

## Prerequisites

- VPS with Ubuntu 22.04+ (Recommended: DigitalOcean, Hetzner, or Linode)
- Domain name (e.g., `lightningreaction.com`)
- LNbits account with API keys
- Basic Linux/SSH knowledge

## Part 1: VPS Setup

### 1.1 Choose a VPS Provider

**Recommended:**
- **DigitalOcean** - $6/month droplet (1 vCPU, 1GB RAM)
- **Hetzner** - €4/month (similar specs, EU-based)
- **Linode** - $5/month

**Specs needed:**
- 1-2 vCPU
- 1-2GB RAM
- 20GB+ storage
- Ubuntu 22.04 LTS

### 1.2 Initial Server Setup

SSH into your server:
```bash
ssh root@your-server-ip
```

Create a non-root user:
```bash
adduser deploy
usermod -aG sudo deploy
su - deploy
```

Update system:
```bash
sudo apt update && sudo apt upgrade -y
```

Install Node.js 20+:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # Should be v20+
```

Install essential tools:
```bash
sudo apt install -y git nginx certbot python3-certbot-nginx build-essential
```

### 1.3 Setup Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

## Part 2: Domain & DNS Setup

### 2.1 Configure DNS

Point your domain to your VPS IP:

```
A Record:  @              → your-server-ip
A Record:  api            → your-server-ip
A Record:  ws             → your-server-ip
CNAME:     www            → yourdomain.com
```

**Wait 5-60 minutes for DNS propagation.**

Verify:
```bash
dig api.yourdomain.com +short
# Should show your server IP
```

## Part 3: Deploy Backend + WebSocket

### 3.1 Clone Repository

```bash
cd /home/deploy
git clone YOUR_REPO_URL lightning-reaction
cd lightning-reaction
```

Or upload via rsync:
```bash
# On your local machine
rsync -avz --exclude 'node_modules' lightning-reaction/ deploy@your-server-ip:/home/deploy/lightning-reaction/
```

### 3.2 Install Dependencies

```bash
cd /home/deploy/lightning-reaction

# Backend
cd backend
npm install
npm run build

# WebSocket
cd ../websocket
npm install
npm run build
```

### 3.3 Configure Environment

**Backend:**
```bash
cd /home/deploy/lightning-reaction/backend
nano .env
```

```env
# Production configuration
NODE_ENV=production
PORT=4000

# IMPORTANT: Update CORS for your domain
CORS_ORIGIN=https://yourdomain.com,https://api.yourdomain.com

# Strong secrets (generate with: openssl rand -hex 32)
JWT_SECRET=your-production-secret-here
WEBHOOK_SECRET=your-webhook-secret-here

# Database
DB_PATH=/home/deploy/lightning-reaction/backend/data/app.sqlite

# LNbits (use your real keys)
LNBITS_URL=https://legend.lnbits.com
LNBITS_ADMIN_KEY=your_admin_key
LNBITS_INVOICE_KEY=your_invoice_key
ENTRY_FEE=100
HOUSE_EDGE=0.10
```

**WebSocket:**
```bash
cd /home/deploy/lightning-reaction/websocket
nano .env
```

```env
NODE_ENV=production
PORT=3001
BACKEND_API_URL=http://localhost:4000
```

### 3.4 Create Data Directory

```bash
mkdir -p /home/deploy/lightning-reaction/backend/data
```

### 3.5 Setup Process Manager (PM2)

Install PM2:
```bash
sudo npm install -g pm2
```

Create PM2 ecosystem file:
```bash
cd /home/deploy/lightning-reaction
nano ecosystem.config.js
```

```javascript
module.exports = {
  apps: [
    {
      name: 'lr-backend',
      cwd: '/home/deploy/lightning-reaction/backend',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/home/deploy/logs/backend-error.log',
      out_file: '/home/deploy/logs/backend-out.log',
      time: true
    },
    {
      name: 'lr-websocket',
      cwd: '/home/deploy/lightning-reaction/websocket',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/home/deploy/logs/websocket-error.log',
      out_file: '/home/deploy/logs/websocket-out.log',
      time: true
    }
  ]
};
```

Create logs directory:
```bash
mkdir -p /home/deploy/logs
```

Start services:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
# Follow the command it outputs to enable startup on boot
```

Check status:
```bash
pm2 status
pm2 logs
```

## Part 4: Nginx Configuration

### 4.1 Create Nginx Config

```bash
sudo nano /etc/nginx/sites-available/lightning-reaction
```

```nginx
# Backend API
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# WebSocket
server {
    listen 80;
    server_name ws.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/lightning-reaction /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 4.2 Setup SSL (Required for Lightning)

```bash
sudo certbot --nginx -d api.yourdomain.com -d ws.yourdomain.com
```

Follow prompts:
- Enter email
- Agree to terms
- Choose redirect HTTP → HTTPS (recommended)

Verify:
```bash
curl https://api.yourdomain.com/healthz
# Should return: {"ok":true}
```

Auto-renewal (already configured, but verify):
```bash
sudo certbot renew --dry-run
```

## Part 5: LNbits Webhook Configuration

### 5.1 Get Your Webhook URL

Your webhook URL is:
```
https://api.yourdomain.com/api/webhook/payment
```

### 5.2 Configure in LNbits

1. Go to https://legend.lnbits.com
2. Login with your wallet
3. Go to **Extensions** → **Webhooks** (or use the built-in webhook feature)
4. Add webhook:
   - **URL:** `https://api.yourdomain.com/api/webhook/payment`
   - **Events:** `payment_received`
   - **Secret:** (use your `WEBHOOK_SECRET` from backend `.env`)

### 5.3 Test Webhook

Generate a test invoice:
```bash
curl -X POST https://api.yourdomain.com/api/rooms/join \
  -H "Content-Type: application/json" \
  -d '{"pubkey":"test123"}'
```

Pay it with a Lightning wallet, then check logs:
```bash
pm2 logs lr-backend --lines 50
# Should see: "Payment confirmed: <hash>"
```

## Part 6: Frontend Production Build

### 6.1 Update Frontend URLs

On your local machine:
```bash
cd lightning-reaction/frontend
nano src/constants/theme.ts
```

```typescript
// Production URLs
export const API_URL = 'https://api.yourdomain.com';
export const WS_URL = 'wss://ws.yourdomain.com';

export const COLORS = {
  // ... keep as is
};
```

### 6.2 Build APK

Install EAS CLI:
```bash
npm install -g eas-cli
```

Configure EAS:
```bash
eas login
eas build:configure
```

Create `eas.json`:
```json
{
  "build": {
    "production": {
      "android": {
        "buildType": "apk",
        "gradleCommand": ":app:assembleRelease"
      }
    }
  }
}
```

Build APK:
```bash
eas build --platform android --profile production
```

Or build locally (faster):
```bash
npx expo prebuild
cd android
./gradlew assembleRelease
# APK will be in: android/app/build/outputs/apk/release/
```

### 6.3 Sign APK (Required for Zapstore)

Generate keystore (one-time):
```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore lightning-reaction.keystore \
  -alias lightning-reaction \
  -keyalg RSA -keysize 2048 -validity 10000
```

**IMPORTANT:** Save the keystore file and password securely!

Sign the APK:
```bash
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore lightning-reaction.keystore \
  app-release-unsigned.apk lightning-reaction
```

Verify:
```bash
jarsigner -verify -verbose -certs app-release-unsigned.apk
```

## Part 7: Security Hardening

### 7.1 Restrict Database Permissions

```bash
chmod 600 /home/deploy/lightning-reaction/backend/data/app.sqlite
```

### 7.2 Setup Log Rotation

```bash
sudo nano /etc/logrotate.d/lightning-reaction
```

```
/home/deploy/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 deploy deploy
}
```

### 7.3 Monitor Disk Space

```bash
df -h
# If low, clean old logs: pm2 flush
```

## Part 8: Monitoring & Maintenance

### 8.1 Check Service Health

```bash
# PM2 status
pm2 status
pm2 monit

# Logs
pm2 logs lr-backend --lines 100
pm2 logs lr-websocket --lines 100

# System resources
htop

# Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### 8.2 Restart Services

```bash
# Restart everything
pm2 restart all

# Restart one service
pm2 restart lr-backend

# Reload Nginx
sudo systemctl reload nginx
```

### 8.3 Update Application

```bash
cd /home/deploy/lightning-reaction

# Pull latest code
git pull

# Backend
cd backend
npm install
npm run build

# WebSocket
cd ../websocket
npm install
npm run build

# Restart
pm2 restart all
```

## Part 9: Zapstore Submission

### 9.1 Create Nostr Event (NIP-78)

Use a Nostr client to publish:

```json
{
  "kind": 32267,
  "content": "",
  "tags": [
    ["d", "lightning-reaction"],
    ["name", "Lightning Reaction Tournament"],
    ["picture", "https://yourdomain.com/icon-512.png"],
    ["about", "Fast-paced skill game with Lightning stakes. Test your reaction time and win sats!"],
    ["url", "https://yourdomain.com/releases/lightning-reaction-v1.0.0.apk"],
    ["version", "1.0.0"],
    ["hash", "sha256:YOUR_APK_SHA256_HERE"],
    ["license", "MIT"],
    ["platform", "android"],
    ["repo", "https://github.com/yourusername/lightning-reaction"]
  ]
}
```

Get SHA256:
```bash
sha256sum app-release.apk
```

### 9.2 Upload APK

Upload to your domain or GitHub releases:
```bash
# Via SCP to your server
scp app-release.apk deploy@yourdomain.com:/var/www/html/releases/lightning-reaction-v1.0.0.apk
```

Or use GitHub releases.

### 9.3 Submit to Zapstore

1. Go to https://zap.store
2. Publish your NIP-78 event
3. Verify it appears in Zapstore
4. Test download and installation

## Troubleshooting

### Backend won't start
```bash
pm2 logs lr-backend --err
# Check for missing env vars or DB errors
```

### WebSocket connection fails
```bash
# Check if service is running
pm2 status

# Check Nginx proxy
sudo nginx -t
sudo tail -f /var/log/nginx/error.log
```

### SSL certificate issues
```bash
# Renew manually
sudo certbot renew --force-renewal

# Check cert status
sudo certbot certificates
```

### Payment webhook not working
```bash
# Test webhook endpoint
curl -X POST https://api.yourdomain.com/api/webhook/payment \
  -H "Content-Type: application/json" \
  -d '{"payment_hash":"test"}'

# Check LNbits webhook config matches backend WEBHOOK_SECRET
```

## Cost Estimate

| Item | Cost |
|------|------|
| VPS (DigitalOcean) | $6/month |
| Domain name | $10-15/year |
| SSL (Let's Encrypt) | Free |
| **Total** | ~**$7/month** |

## Performance Tips

### Database Backups
```bash
# Add to crontab
crontab -e
```

```cron
# Daily backup at 3 AM
0 3 * * * cp /home/deploy/lightning-reaction/backend/data/app.sqlite /home/deploy/backups/app-$(date +\%Y\%m\%d).sqlite
```

### Optimize Nginx
```nginx
# Add to http block in /etc/nginx/nginx.conf
gzip on;
gzip_types application/json;
client_max_body_size 10M;
```

### Monitor with Uptime Robot
- Sign up at https://uptimerobot.com (free)
- Monitor: `https://api.yourdomain.com/healthz`
- Get alerts if service goes down

---

**🚀 Ready for Production!**

Once deployed, test thoroughly before announcing. Start with testnet sats, then switch to mainnet when confident.
