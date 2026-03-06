#!/bin/bash
# Lightning Reaction Tournament - Integration Verification

echo "🔍 Verifying Lightning Reaction Tournament setup..."
echo ""

ERRORS=0

# Check directories exist
echo "📁 Checking project structure..."
for dir in backend websocket frontend; do
    if [ -d "$(dirname "$0")/$dir" ]; then
        echo "  ✅ $dir/"
    else
        echo "  ❌ $dir/ missing!"
        ERRORS=$((ERRORS + 1))
    fi
done
echo ""

# Check package.json files
echo "📦 Checking package.json files..."
for dir in backend websocket frontend; do
    if [ -f "$(dirname "$0")/$dir/package.json" ]; then
        echo "  ✅ $dir/package.json"
    else
        echo "  ❌ $dir/package.json missing!"
        ERRORS=$((ERRORS + 1))
    fi
done
echo ""

# Check node_modules installed
echo "📚 Checking dependencies..."
for dir in backend websocket frontend; do
    if [ -d "$(dirname "$0")/$dir/node_modules" ]; then
        echo "  ✅ $dir dependencies installed"
    else
        echo "  ⚠️  $dir dependencies not installed (run: cd $dir && npm install)"
        ERRORS=$((ERRORS + 1))
    fi
done
echo ""

# Check configuration files
echo "⚙️  Checking configuration..."
if [ -f "$(dirname "$0")/backend/.env" ]; then
    echo "  ✅ backend/.env exists"
    
    # Check critical env vars
    if grep -q "LNBITS_ADMIN_KEY=" "$(dirname "$0")/backend/.env" && grep -q "LNBITS_INVOICE_KEY=" "$(dirname "$0")/backend/.env"; then
        if grep -q "LNBITS_ADMIN_KEY=$" "$(dirname "$0")/backend/.env" || grep -q "LNBITS_INVOICE_KEY=$" "$(dirname "$0")/backend/.env"; then
            echo "  ⚠️  LNbits keys not configured (backend/.env)"
        else
            echo "  ✅ LNbits keys configured"
        fi
    fi
else
    echo "  ⚠️  backend/.env missing (copy from .env.example)"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "$(dirname "$0")/websocket/.env" ]; then
    echo "  ✅ websocket/.env exists"
else
    echo "  ℹ️  websocket/.env optional (using defaults)"
fi
echo ""

# Check TypeScript compilation
echo "🔨 Checking TypeScript setup..."
for dir in backend websocket; do
    if [ -f "$(dirname "$0")/$dir/tsconfig.json" ]; then
        echo "  ✅ $dir/tsconfig.json"
    else
        echo "  ❌ $dir/tsconfig.json missing!"
        ERRORS=$((ERRORS + 1))
    fi
done
echo ""

# Check key source files
echo "📄 Checking key source files..."
KEY_FILES=(
    "backend/src/index.ts"
    "websocket/src/index.ts"
    "frontend/src/constants/theme.ts"
    "frontend/App.tsx"
)
for file in "${KEY_FILES[@]}"; do
    if [ -f "$(dirname "$0")/$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file missing!"
        ERRORS=$((ERRORS + 1))
    fi
done
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $ERRORS -eq 0 ]; then
    echo "✅ All checks passed!"
    echo ""
    echo "🚀 Ready to start:"
    echo "   ./START.sh"
    echo ""
    echo "Or manually:"
    echo "   cd backend && npm run dev      # Terminal 1"
    echo "   cd websocket && npm run dev    # Terminal 2"
    echo "   cd frontend && npx expo start  # Terminal 3"
else
    echo "❌ Found $ERRORS error(s)"
    echo ""
    echo "Fix the issues above, then run ./VERIFY.sh again"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
