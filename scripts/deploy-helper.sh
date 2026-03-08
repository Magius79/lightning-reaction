#!/bin/bash
# Lightning Reaction Tournament - Deployment Helper
# Run this on your LOCAL machine to help with deployment

echo "🚀 Lightning Reaction Deployment Helper"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Step 1: Check prerequisites
echo "📋 Checking prerequisites..."
MISSING=0

if ! command_exists rsync; then
    echo -e "${RED}✗${NC} rsync not found (install: apt install rsync)"
    MISSING=1
else
    echo -e "${GREEN}✓${NC} rsync"
fi

if ! command_exists ssh; then
    echo -e "${RED}✗${NC} ssh not found"
    MISSING=1
else
    echo -e "${GREEN}✓${NC} ssh"
fi

if ! command_exists npm; then
    echo -e "${RED}✗${NC} npm not found (install Node.js)"
    MISSING=1
else
    echo -e "${GREEN}✓${NC} npm"
fi

if [ $MISSING -eq 1 ]; then
    echo ""
    echo -e "${RED}Missing required tools. Install them first.${NC}"
    exit 1
fi

echo ""

# Step 2: Get server details
echo "📝 Server Configuration"
echo "----------------------"
read -p "Server IP or hostname: " SERVER_IP
read -p "SSH user (default: deploy): " SSH_USER
SSH_USER=${SSH_USER:-deploy}
read -p "Domain name (e.g., yourdomain.com): " DOMAIN

echo ""
echo "Configuration:"
echo "  Server: $SSH_USER@$SERVER_IP"
echo "  API: https://api.$DOMAIN"
echo "  WebSocket: wss://ws.$DOMAIN"
echo ""
read -p "Is this correct? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Step 3: Test SSH connection
echo ""
echo "🔑 Testing SSH connection..."
if ssh -o BatchMode=yes -o ConnectTimeout=5 $SSH_USER@$SERVER_IP echo "Connected" 2>&1 | grep -q "Connected"; then
    echo -e "${GREEN}✓${NC} SSH connection successful"
else
    echo -e "${YELLOW}⚠${NC}  SSH connection failed. Make sure you can SSH without password (use ssh-copy-id)"
    echo "   Run: ssh-copy-id $SSH_USER@$SERVER_IP"
    exit 1
fi

# Step 4: Build locally
echo ""
echo "🔨 Building for production..."
cd "$(dirname "$0")"

echo "  Building backend..."
cd backend
npm install --production=false
npm run build
cd ..

echo "  Building websocket..."
cd websocket
npm install --production=false
npm run build
cd ..

echo -e "${GREEN}✓${NC} Build complete"

# Step 5: Upload to server
echo ""
echo "📤 Uploading to server..."
read -p "Upload files now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'frontend' \
        . $SSH_USER@$SERVER_IP:/home/$SSH_USER/lightning-reaction/
    echo -e "${GREEN}✓${NC} Upload complete"
else
    echo "Skipped upload. You can manually upload with:"
    echo "  rsync -avz --exclude 'node_modules' . $SSH_USER@$SERVER_IP:/home/$SSH_USER/lightning-reaction/"
fi

# Step 6: Generate secrets
echo ""
echo "🔐 Generate production secrets"
echo "-----------------------------"
echo "Add these to your backend/.env on the server:"
echo ""
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "WEBHOOK_SECRET=$(openssl rand -hex 32)"
echo ""

# Step 7: Update frontend
echo "📱 Frontend Configuration"
echo "------------------------"
echo "Update frontend/src/constants/theme.ts with:"
echo ""
echo "export const API_URL = 'https://api.$DOMAIN';"
echo "export const WS_URL = 'wss://ws.$DOMAIN';"
echo ""

# Step 8: Next steps
echo ""
echo "✅ Deployment helper complete!"
echo ""
echo "Next steps:"
echo "1. SSH to server: ssh $SSH_USER@$SERVER_IP"
echo "2. Configure backend/.env with LNbits keys"
echo "3. Install dependencies on server:"
echo "   cd /home/$SSH_USER/lightning-reaction/backend && npm install --production"
echo "   cd /home/$SSH_USER/lightning-reaction/websocket && npm install --production"
echo "4. Follow DEPLOYMENT.md from 'Part 3.5: Setup Process Manager'"
echo ""
echo "Quick SSH: ssh $SSH_USER@$SERVER_IP"
