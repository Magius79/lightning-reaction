#!/bin/bash
# Lightning Reaction Tournament - Startup Script

echo "🎮 Starting Lightning Reaction Tournament..."
echo ""

# Check if tmux is available
if ! command -v tmux &> /dev/null; then
    echo "⚠️  tmux not found. Install with: brew install tmux (macOS) or apt install tmux (Linux)"
    echo ""
    echo "Running services in foreground (use Ctrl+C to stop)..."
    echo ""
    
    # Fallback: run in foreground
    cd "$(dirname "$0")/backend" && npm run dev &
    BACKEND_PID=$!
    
    cd "$(dirname "$0")/websocket" && npm run dev &
    WEBSOCKET_PID=$!
    
    cd "$(dirname "$0")/frontend" && npx expo start &
    FRONTEND_PID=$!
    
    echo "✅ Services started!"
    echo "   Backend PID: $BACKEND_PID"
    echo "   WebSocket PID: $WEBSOCKET_PID"
    echo "   Frontend PID: $FRONTEND_PID"
    echo ""
    echo "Press Ctrl+C to stop all services"
    
    # Wait for Ctrl+C
    trap "kill $BACKEND_PID $WEBSOCKET_PID $FRONTEND_PID 2>/dev/null" EXIT
    wait
    
else
    # Use tmux for better management
    SESSION="lightning-reaction"
    
    # Kill existing session if it exists
    tmux has-session -t $SESSION 2>/dev/null && tmux kill-session -t $SESSION
    
    # Create new session
    tmux new-session -d -s $SESSION -n backend
    
    # Backend window
    tmux send-keys -t $SESSION:backend "cd $(dirname "$0")/backend && npm run dev" C-m
    
    # WebSocket window
    tmux new-window -t $SESSION -n websocket
    tmux send-keys -t $SESSION:websocket "cd $(dirname "$0")/websocket && npm run dev" C-m
    
    # Frontend window
    tmux new-window -t $SESSION -n frontend
    tmux send-keys -t $SESSION:frontend "cd $(dirname "$0")/frontend && npx expo start" C-m
    
    # Select backend window
    tmux select-window -t $SESSION:backend
    
    echo "✅ All services started in tmux session: $SESSION"
    echo ""
    echo "Commands:"
    echo "  View all: tmux attach -t $SESSION"
    echo "  Switch windows: Ctrl+B then 0/1/2"
    echo "  Stop all: tmux kill-session -t $SESSION"
    echo ""
    echo "Service status:"
    echo "  Backend:   http://localhost:4000"
    echo "  WebSocket: ws://localhost:3001"
    echo "  Frontend:  Expo Dev Server (scan QR)"
fi
