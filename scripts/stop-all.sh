#!/bin/bash
# Stop all development services

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Stopping Lightning Reaction services...${NC}"
echo

# Check for tmux session
if tmux has-session -t lightning-dev 2>/dev/null; then
    echo -n "Killing tmux session... "
    tmux kill-session -t lightning-dev
    echo -e "${GREEN}✓${NC}"
fi

# Check for background processes
if [ -f "logs/pids.txt" ]; then
    echo -n "Killing background processes... "
    PIDS=$(cat logs/pids.txt)
    kill $PIDS 2>/dev/null
    echo -e "${GREEN}✓${NC}"
    rm logs/pids.txt
fi

# Fallback: kill by pattern
echo -n "Cleaning up any remaining processes... "
pkill -f "tsx watch src/index.ts" 2>/dev/null
pkill -f "npx expo start" 2>/dev/null
echo -e "${GREEN}✓${NC}"

echo
echo -e "${GREEN}All services stopped${NC}"
