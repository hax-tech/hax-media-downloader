#!/usr/bin/env bash
set -euo pipefail

# Scheduled cleanup script for hax-media-downloader
# Supports triggering cleanup via HTTP endpoint or tsx cron runner

PORT="${PORT:-3000}"
APP_URL="${APP_URL:-http://localhost:${PORT}}"
CRON_SECRET="${CRON_SECRET:-}"
ADMIN_API_KEY="${ADMIN_API_KEY:-}"

AUTH_HEADER=""
AUTH_VALUE=""

if [ -n "$CRON_SECRET" ]; then
  AUTH_HEADER="X-Cron-Secret"
  AUTH_VALUE="$CRON_SECRET"
elif [ -n "$ADMIN_API_KEY" ]; then
  AUTH_HEADER="X-Admin-Key"
  AUTH_VALUE="$ADMIN_API_KEY"
fi

echo "[CRON] Starting cleanup trigger for ${APP_URL}..."

if command -v curl >/dev/null 2>&1; then
  if [ -n "$AUTH_HEADER" ]; then
    HTTP_CODE=$(curl -s -o /tmp/cleanup_response.json -w "%{http_code}" -X POST "${APP_URL}/api/admin/cache/cleanup" \
      -H "Content-Type: application/json" \
      -H "${AUTH_HEADER}: ${AUTH_VALUE}")
  else
    HTTP_CODE=$(curl -s -o /tmp/cleanup_response.json -w "%{http_code}" -X POST "${APP_URL}/api/admin/cache/cleanup" \
      -H "Content-Type: application/json")
  fi

  if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
    echo "[CRON] Cleanup succeeded (HTTP ${HTTP_CODE}):"
    cat /tmp/cleanup_response.json
    echo ""
    rm -f /tmp/cleanup_response.json
    exit 0
  else
    echo "[CRON] Cleanup failed with HTTP status ${HTTP_CODE}:" >&2
    cat /tmp/cleanup_response.json >&2
    echo "" >&2
    rm -f /tmp/cleanup_response.json
    exit 1
  fi
elif command -v node >/dev/null 2>&1; then
  echo "[CRON] curl not found, attempting in-process cleanup runner..."
  npx tsx cron/cleanup.ts
  exit 0
else
  echo "[CRON] Error: Neither curl nor node found to execute cleanup." >&2
  exit 1
fi
