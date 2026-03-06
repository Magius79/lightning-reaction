#!/usr/bin/env bash
set -euo pipefail

URL="https://api.lrtgame.cloud/health"
LOG="/var/log/lrt-healthcheck.log"
STATE="/var/lib/lrt-healthcheck.failcount"
THRESHOLD=3

mkdir -p /var/lib
count=0
if [[ -f "$STATE" ]]; then
  count=$(cat "$STATE" 2>/dev/null || echo 0)
fi

if curl -fsS --max-time 5 "$URL" >/dev/null; then
  echo "0" > "$STATE"
  echo "$(date -Is) OK (failcount reset)" >> "$LOG"
  exit 0
else
  count=$((count+1))
  echo "$count" > "$STATE"
  echo "$(date -Is) FAIL (failcount=$count/$THRESHOLD)" >> "$LOG"

  if [[ "$count" -ge "$THRESHOLD" ]]; then
    echo "$(date -Is) FAIL threshold reached -> restarting lrt-backend via pm2" >> "$LOG"
    /usr/bin/pm2 restart lrt-backend >/dev/null 2>&1 || true
    echo "0" > "$STATE"
  fi

  exit 1
fi
