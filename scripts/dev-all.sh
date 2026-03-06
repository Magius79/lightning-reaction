#!/bin/bash
# Start all three services (Backend, WebSocket, Frontend) for local development

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}⚡ Lightning Reaction Tournament - Development Startup${NC}"
echo "========================================================"
echo

# Check if we're in the right directory
if [ ! -d "backend" ] || [ ! -d "websocket" ] || [ ! -d "frontend" ]; then
    echo -e "${RED}✗${NC} Must run from lightning-reaction/ root directory"
    exit 1
fi

# Check if tmux is available (optional but recommended)
if command -v tmux &> /dev/null; then
    USE_TMUX=true
    echo -e "${GREEN}✓${NC} tmux detected - will use split panes"
else
    USE_TMUX=false
    echo -e "${YELLOW}⚠${NC} tmux not found - will run in background"
    echo "   Install tmux for better experience: sudo apt install tmux"
fi

echo

# Check Node.js
echo -n "Checking Node.js... "
if command -v node &> /dev/null; then
    echo -e "${GREEN}✓${NC} $(node -v)"
else
    echo -e "${RED}✗${NC} Node.js not found"
    exit 1
fi

# Check if dependencies are installed
echo
echo "Checking dependencies..."

check_deps() {
    local dir=$1
    echo -n "  $dir: "
    if [ -d "$dir/node_modules" ]; then
        echo -e "${GREEN}✓${NC}"
        return 0
    else
        echo -e "${YELLOW}installing...${NC}"
        (cd "$dir" && npm install > /dev/null 2>&1)
        if [ $? -eq 0 ]; then
            echo -e "  $dir: ${GREEN}✓${NC} installed"
            return 0
        else
            echo -e "  $dir: ${RED}✗${NC} install failed"
            return 1
        fi
    fi
}

check_deps "backend" || exit 1
check_deps "websocket" || exit 1
check_deps "frontend" || exit 1

# Check environment files
echo
echo "Checking environment files..."

check_env() {
    local dir=$1
    echo -n "  $dir/.env: "
    if [ -f "$dir/.env" ]; then
        echo -e "${GREEN}✓${NC}"
    else
        if [ -f "$dir/.env.example" ]; then
            echo -e "${YELLOW}creating from .env.example${NC}"
            cp "$dir/.env.example" "$dir/.env"
            echo -e "  ${YELLOW}⚠${NC} Edit $dir/.env with your configuration!"
        else
            echo -e "${RED}✗${NC} missing (no .env.example found)"
        fi
    fi
}

check_env "backend"
check_env "websocket"

# Get local IP for Expo
LOCAL_IP=$(hostname -I | awk '{print $1}')
if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP="192.168.1.x"
fi

echo
echo -e "${BLUE}Configuration Reminder:${NC}"
echo "  Backend:    http://localhost:4000"
echo "  WebSocket:  ws://localhost:3001"
echo "  Frontend:   Update theme.ts with:"
echo "              API_URL: 'http://$LOCAL_IP:4000'"
echo "              WS_URL:  'ws://$LOCAL_IP:3001'"
echo

read -p "Press Enter to start services (Ctrl+C to cancel)..."

# Create log directory
mkdir -p logs

if [ "$USE_TMUX" = true ]; then
    # Start with tmux (split panes)
    SESSION="lightning-dev"
    
    # Kill existing session if it exists
    tmux has-session -t $SESSION 2>/dev/null && tmux kill-session -t $SESSION
    
    # Create new session with backend
    tmux new-session -d -s $SESSION -n "services"
    tmux send-keys -t $SESSION "cd backend && npm run dev" C-m
    
    # Split vertically for websocket
    tmux split-window -v -t $SESSION
    tmux send-keys -t $SESSION "cd websocket && npm run dev" C-m
    
    # Split horizontally for frontend
    tmux split-window -h -t $SESSION
    tmux send-keys -t $SESSION "cd frontend && npx expo start" C-m
    
    # Adjust pane sizes
    tmux select-layout -t $SESSION tiled
    
    echo
    echo -e "${GREEN}✓${NC} All services started in tmux session: $SESSION"
    echo
    echo "Commands:"
    echo "  tmux attach -t $SESSION    # Attach to view logs"
    echo "  tmux kill-session -t $SESSION    # Stop all services"
    echo
    echo "Tmux keys (inside session):"
    echo "  Ctrl+B then Arrow Keys    # Switch panes"
    echo "  Ctrl+B then D             # Detach (keep running)"
    echo "  Ctrl+C in each pane       # Stop service"
    echo
    
    # Auto-attach
    read -p "Attach to tmux session now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        tmux attach -t $SESSION
    fi
    
else
    # Start in background (no tmux)
    echo "Starting services in background..."
    echo
    
    # Backend
    echo -e "${BLUE}Starting backend...${NC}"
    cd backend
    npm run dev > ../logs/backend.log 2>&1 &
    BACKEND_PID=$!
    echo -e "  ${GREEN}✓${NC} PID: $BACKEND_PID"
    cd ..
    
    sleep 2
    
    # WebSocket
    echo -e "${BLUE}Starting websocket...${NC}"
    cd websocket
    npm run dev > ../logs/websocket.log 2>&1 &
    WEBSOCKET_PID=$!
    echo -e "  ${GREEN}✓${NC} PID: $WEBSOCKET_PID"
    cd ..
    
    sleep 2
    
    # Frontend
    echo -e "${BLUE}Starting frontend...${NC}"
    cd frontend
    npx expo start > ../logs/frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo -e "  ${GREEN}✓${NC} PID: $FRONTEND_PID"
    cd ..
    
    echo
    echo -e "${GREEN}✓${NC} All services started"
    echo
    echo "View logs:"
    echo "  tail -f logs/backend.log"
    echo "  tail -f logs/websocket.log"
    echo "  tail -f logs/frontend.log"
    echo
    echo "Stop services:"
    echo "  kill $BACKEND_PID $WEBSOCKET_PID $FRONTEND_PID"
    echo "  Or run: pkill -f 'npm run dev'"
    echo
    
    # Save PIDs to file for easy cleanup
    echo "$BACKEND_PID $WEBSOCKET_PID $FRONTEND_PID" > logs/pids.txt
    echo "PIDs saved to logs/pids.txt"
fi

echo
echo -e "${GREEN}🚀 Development environment ready!${NC}"
echo
echo "Next steps:"
echo "  1. Check backend health: curl http://localhost:4000/healthz"
echo "  2. Check WebSocket health: curl http://localhost:3001/health"
echo "  3. Open Expo app and scan QR code"
echo "  4. Test the full flow: login → room → pay → play"
echo
