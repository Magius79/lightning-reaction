#!/bin/bash
# Verify Railway deployment readiness for Lightning Reaction backend

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚂 Lightning Reaction - Railway Deployment Verification"
echo "========================================================"
echo

# Check Node.js version
echo -n "Checking Node.js version... "
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -ge 20 ]; then
    echo -e "${GREEN}✓${NC} Node $(node -v)"
else
    echo -e "${RED}✗${NC} Node $(node -v) (requires >=20)"
    exit 1
fi

# Check if package.json exists
echo -n "Checking package.json... "
if [ -f "package.json" ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC} package.json not found"
    exit 1
fi

# Check if dependencies are installed
echo -n "Checking node_modules... "
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}⚠${NC} Run 'npm install' first"
fi

# Check for required environment variables template
echo -n "Checking .env.example... "
if [ -f ".env.example" ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}⚠${NC} .env.example not found"
fi

# Check if source files exist
echo -n "Checking src/ directory... "
if [ -d "src" ] && [ -f "src/index.ts" ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC} src/index.ts not found"
    exit 1
fi

# Check TypeScript build
echo -n "Testing TypeScript build... "
if npm run build > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
    # Clean up build artifacts
    rm -rf dist/
else
    echo -e "${RED}✗${NC} Build failed"
    echo "Run 'npm run build' to see errors"
    exit 1
fi

# Check railway.json
echo -n "Checking railway.json... "
if [ -f "railway.json" ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}⚠${NC} railway.json not found (optional)"
fi

# Check .railwayignore
echo -n "Checking .railwayignore... "
if [ -f ".railwayignore" ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}⚠${NC} .railwayignore not found (optional)"
fi

echo
echo "📋 Environment Variables Checklist"
echo "===================================="
echo
echo "Required for Railway deployment:"
echo "  [ ] JWT_SECRET (32+ characters)"
echo "  [ ] LNBITS_URL"
echo "  [ ] LNBITS_ADMIN_KEY"
echo "  [ ] LNBITS_INVOICE_KEY"
echo
echo "Optional but recommended:"
echo "  [ ] CORS_ORIGIN (comma-separated domains)"
echo "  [ ] DB_PATH=/app/data/app.sqlite"
echo "  [ ] WEBHOOK_SECRET"
echo

# Check if Railway CLI is installed
echo -n "Checking Railway CLI... "
if command -v railway &> /dev/null; then
    echo -e "${GREEN}✓${NC} $(railway --version)"
    echo
    echo "📦 Quick Deploy Commands"
    echo "========================="
    echo "  railway login         # Authenticate"
    echo "  railway init          # Link to project"
    echo "  railway up            # Deploy"
    echo "  railway logs          # View logs"
    echo "  railway open          # Open dashboard"
else
    echo -e "${YELLOW}⚠${NC} Not installed"
    echo
    echo "Install Railway CLI:"
    echo "  npm install -g @railway/cli"
fi

echo
echo "✅ Pre-deployment checks complete!"
echo
echo "Next steps:"
echo "  1. Review docs/RAILWAY_DEPLOYMENT.md"
echo "  2. Prepare environment variables"
echo "  3. Deploy with 'railway up' or GitHub integration"
echo "  4. Configure database volume (/app/data)"
echo "  5. Test deployment: curl https://your-service.railway.app/healthz"
echo
