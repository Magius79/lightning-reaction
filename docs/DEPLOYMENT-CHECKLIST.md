# Deployment Checklist

Use this checklist to track your deployment progress.

## Pre-Deployment

- [ ] VPS purchased and accessible via SSH
- [ ] Domain name registered
- [ ] DNS A records configured (api.yourdomain.com, ws.yourdomain.com)
- [ ] LNbits account created with API keys
- [ ] Code tested locally with real Lightning payments
- [ ] All tests passing (see TEST.md)

## Server Setup

- [ ] Ubuntu 22.04+ installed
- [ ] Non-root user created (`deploy`)
- [ ] Node.js 20+ installed
- [ ] Nginx installed
- [ ] Certbot installed
- [ ] Firewall configured (UFW)
- [ ] Git installed

## Application Deployment

- [ ] Repository cloned/uploaded to server
- [ ] Backend dependencies installed (`npm install`)
- [ ] WebSocket dependencies installed
- [ ] Backend built (`npm run build`)
- [ ] WebSocket built (`npm run build`)
- [ ] Backend `.env` configured with production values
- [ ] WebSocket `.env` configured (optional)
- [ ] PM2 installed globally
- [ ] PM2 ecosystem file created
- [ ] Services started with PM2
- [ ] PM2 startup configured
- [ ] PM2 process saving enabled

## Nginx & SSL

- [ ] Nginx config file created (`/etc/nginx/sites-available/lightning-reaction`)
- [ ] Nginx config symlinked to sites-enabled
- [ ] Nginx config tested (`nginx -t`)
- [ ] Nginx restarted
- [ ] SSL certificates obtained (certbot)
- [ ] HTTPS working for both domains
- [ ] HTTP → HTTPS redirect enabled
- [ ] Certbot auto-renewal verified

## LNbits Integration

- [ ] Webhook URL configured in LNbits
- [ ] Webhook secret matches backend `.env`
- [ ] Test payment made and confirmed
- [ ] Webhook logs show successful payment confirmation

## Frontend Build

- [ ] Production URLs updated in `theme.ts`
- [ ] APK built (via EAS or local gradle)
- [ ] Keystore generated and saved securely
- [ ] APK signed with keystore
- [ ] APK signature verified
- [ ] APK tested on Android device
- [ ] APK uploaded to server or GitHub releases

## Zapstore Submission

- [ ] App icon created (512x512)
- [ ] Screenshots taken (4-6 images)
- [ ] Privacy policy written
- [ ] NIP-78 Nostr event created
- [ ] SHA256 hash generated for APK
- [ ] Event published to Nostr
- [ ] App appears in Zapstore
- [ ] Download and install tested from Zapstore

## Security

- [ ] Database file permissions restricted (600)
- [ ] Strong JWT_SECRET generated
- [ ] Strong WEBHOOK_SECRET generated
- [ ] CORS configured for production domains only
- [ ] Log rotation configured
- [ ] Backups scheduled (cron)
- [ ] Monitoring setup (Uptime Robot or similar)

## Testing

- [ ] Can access backend healthcheck: `https://api.yourdomain.com/healthz`
- [ ] Can connect to WebSocket: `wss://ws.yourdomain.com`
- [ ] Frontend APK installs successfully
- [ ] Can login with Nostr pubkey
- [ ] Can generate Lightning invoice
- [ ] Can pay invoice and join room
- [ ] Two players can play a full game
- [ ] Winner receives payout correctly
- [ ] Leaderboard updates after game
- [ ] No console errors in app
- [ ] No server errors in logs

## Post-Launch

- [ ] Monitor logs for first 24 hours
- [ ] Check for any payment failures
- [ ] Monitor server resources (CPU/RAM/disk)
- [ ] Verify SSL renewal will work (certbot renew --dry-run)
- [ ] Set up alerts for downtime
- [ ] Document any issues found
- [ ] Collect user feedback

## Maintenance Schedule

**Daily:**
- Check PM2 status
- Review error logs

**Weekly:**
- Check disk space
- Review payment success rate
- Check for application updates

**Monthly:**
- Review server security updates
- Backup database manually
- Test SSL renewal

---

## Quick Commands

### Check everything is running:
```bash
pm2 status
sudo systemctl status nginx
curl https://api.yourdomain.com/healthz
```

### View logs:
```bash
pm2 logs --lines 100
sudo tail -f /var/log/nginx/error.log
```

### Restart services:
```bash
pm2 restart all
sudo systemctl reload nginx
```

### Update application:
```bash
cd /home/deploy/lightning-reaction
git pull
cd backend && npm install && npm run build
cd ../websocket && npm install && npm run build
pm2 restart all
```

---

**Progress:** ☐☐☐☐☐☐☐☐☐☐ 0/10 major sections complete
