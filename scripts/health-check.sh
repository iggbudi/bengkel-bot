#!/usr/bin/env bash
# BengkelBot external health check — suitable for cron.
# Usage: ./scripts/health-check.sh [URL]
# Exit 0 = healthy, 1 = unhealthy

URL="${1:-http://127.0.0.1:3012/api/health}"
RESPONSE=$(curl -sf "$URL" 2>/dev/null) || {
  echo "FAIL: cannot reach $URL"
  exit 1
}

OK=$(echo "$RESPONSE" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).ok" 2>/dev/null)

if [ "$OK" = "true" ]; then
  echo "OK: $URL"
  exit 0
fi

echo "FAIL: health not ok"
echo "$RESPONSE"
exit 1