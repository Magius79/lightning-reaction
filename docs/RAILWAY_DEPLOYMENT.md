# Railway Deployment Guide

Deploy the Lightning Reaction backend to Railway with SSL and automatic deployments.

## Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **LNbits Instance**: You need access to an LNbits server with:
   - Admin API key
   - Invoice/Read API key
   - Your LNbits wallet URL

## Quick Deploy

### Option 1: Deploy from GitHub (Recommended)

1. **Push to GitHub**:
   ```bash
   cd lightning-reaction/backend
   git init
   git add .
   git commit -m "Initial backend commit"
   git branch -M main
   git remote add origin <your-github-repo>
   git push -u origin main
   ```

2. **Create Railway Project**:
   - Go to [railway.app/new](https://railway.app/new)
   - Click "Deploy from GitHub repo"
   - Select your repository
   - Railway will auto-detect the Node.js project

3. **Configure Environment Variables** (see below)

4. **Add Volume for Database**:
   - In Railway dashboard → your service → Variables tab
   - Scroll to "Volume" section
   - Click "Add Volume"
   - Mount path: `/app/data`
   - This persists your SQLite database across deploys

### Option 2: Deploy with Railway CLI

1. **Install Railway CLI**:
   ```bash
   npm install -g @railway/cli
   ```

2. **Login and Initialize**:
   ```bash
   cd lightning-reaction/backend
   railway login
   railway init
   ```

3. **Deploy**:
   ```bash
   railway up
   ```

4. **Configure environment variables and volume** (see below)

## Environment Variables

Set these in Railway Dashboard → Service → Variables tab:

### Required Variables

```bash
# Security
JWT_SECRET=<generate-random-32-char-string>

# LNbits Configuration
LNBITS_URL=https://legend.lnbits.com
LNBITS_ADMIN_KEY=<your-lnbits-admin-key>
LNBITS_INVOICE_KEY=<your-lnbits-invoice-key>

# Game Configuration
ENTRY_FEE=100
HOUSE_EDGE=0.1
```

### Optional Variables

```bash
# Environment
NODE_ENV=production
PORT=4000  # Railway will override with their internal port

# CORS (comma-separated origins)
CORS_ORIGIN=https://yourdomain.com,https://mobile-app.yourdomain.com

# Database (persisted via volume)
DB_PATH=/app/data/app.sqlite

# Payment Settings
INVOICE_EXPIRY_SECONDS=300
LIGHTNING_MEMO=Lightning Reaction - Entry Fee

# Webhook Security (optional, for signature verification)
WEBHOOK_SECRET=<random-string>
```

### Generate JWT Secret

```bash
# On Linux/Mac:
openssl rand -base64 32

# Or with Node.js:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## LNbits Setup

1. **Get Your LNbits Keys**:
   - Go to your LNbits instance (e.g., legend.lnbits.com)
   - Create or open a wallet
   - Copy the **Admin Key** (full access - keep secret!)
   - Copy the **Invoice/Read Key** (for creating invoices)

2. **Test Your Keys** (optional):
   ```bash
   curl -H "X-Api-Key: YOUR_INVOICE_KEY" \
     https://legend.lnbits.com/api/v1/wallet
   ```

## Post-Deployment

### Get Your Backend URL

Railway automatically assigns a domain:
```
https://your-service.railway.app
```

Find it in: Railway Dashboard → Service → Settings → Domains

### Test the Deployment

```bash
# Health check
curl https://your-service.railway.app/healthz

# Should return: {"ok":true}
```

### Configure Frontend

Update your frontend environment to use the Railway backend:

```typescript
// frontend/src/constants/theme.ts
export const API_URL = 'https://your-service.railway.app';
export const WS_URL = 'wss://your-websocket-service.railway.app';
```

## Custom Domain (Optional)

1. **Add Custom Domain in Railway**:
   - Service → Settings → Domains
   - Click "Add Domain"
   - Enter your domain (e.g., `api.yourgame.com`)

2. **Configure DNS**:
   - Add CNAME record pointing to Railway's provided domain
   - Wait for DNS propagation (5-30 minutes)

3. **SSL Certificate**:
   - Railway automatically provisions Let's Encrypt SSL
   - HTTPS will work automatically once DNS resolves

## Database Backup

Your SQLite database is in the `/app/data` volume. To backup:

1. **Via Railway CLI**:
   ```bash
   railway run bash
   # Inside container:
   cat /app/data/app.sqlite | base64
   # Copy output and decode locally
   ```

2. **Manual Export**:
   - Consider periodic backups to S3/Cloudflare R2
   - Add a cron job or Railway plugin

## Monitoring

### View Logs

```bash
# Railway CLI
railway logs

# Or in Railway Dashboard → Service → Logs tab
```

### Metrics

Railway Dashboard → Service → Metrics shows:
- CPU usage
- Memory usage
- Network traffic
- Request rates

### Set Up Alerts

Railway Dashboard → Service → Settings → Notifications:
- Deploy failures
- Service crashes
- Custom webhooks

## WebSocket Server Deployment

The WebSocket server needs a separate Railway service:

1. **Create New Service** in Railway dashboard
2. **Deploy** `lightning-reaction/websocket` directory
3. **Set Environment Variables**:
   ```bash
   PORT=3001
   BACKEND_URL=https://your-backend-service.railway.app
   CORS_ORIGIN=*  # or restrict to your frontend domain
   ```

4. **Connect to Backend**:
   - WebSocket server will call backend API for payment verification
   - Ensure CORS allows WebSocket server origin

## Troubleshooting

### "Cannot find module" error
- Check that `npm run build` completes successfully
- Verify `dist/` directory is created
- Check Railway build logs

### Database permission errors
- Ensure volume is mounted at `/app/data`
- Set `DB_PATH=/app/data/app.sqlite` in env variables

### CORS errors
- Add your frontend domain to `CORS_ORIGIN`
- Check Railway service settings allow external connections

### LNbits connection fails
- Verify `LNBITS_URL` is accessible from Railway (not localhost)
- Check API keys are valid
- Test with: `railway run node -e "console.log(process.env.LNBITS_ADMIN_KEY)"`

### Payment webhooks not working
- Railway provides HTTPS by default (required for webhooks)
- Configure LNbits webhook URL: `https://your-service.railway.app/api/webhook`
- Check Railway logs for webhook errors

## Cost Estimation

Railway Pricing (as of 2024):
- **Starter Plan**: $5/month
  - $5 of usage credits included
  - ~$0.000463/hour for service (~$0.33/GB RAM)
- **Expected Cost**: $5-10/month for this backend

To minimize costs:
- Use hobby plan for development
- Scale down during low usage
- Consider shared database services

## Security Checklist

- ✅ HTTPS enabled (automatic with Railway)
- ✅ JWT_SECRET is strong (32+ chars)
- ✅ LNBITS_ADMIN_KEY kept secret (not in code)
- ✅ CORS restricted to known domains
- ✅ Rate limiting enabled (60 req/min)
- ✅ Helmet security headers active
- ✅ Database volume encrypted (Railway default)
- ✅ Webhook signature verification (optional)

## Next Steps

1. Deploy backend to Railway
2. Deploy WebSocket server to Railway (separate service)
3. Update frontend with production URLs
4. Test end-to-end payment flow
5. Build Android APK with production config
6. Submit to Zapstore

---

**Support**: [Railway Docs](https://docs.railway.app) | [Discord](https://discord.gg/railway)
