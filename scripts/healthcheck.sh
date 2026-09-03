#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"

if ! command -v curl >/dev/null 2>&1; then
  echo "Error: curl command is required for healthcheck" >&2
  exit 1
fi

RESPONSE=$(curl -fsS --max-time 5 "${HEALTH_URL}" 2>/dev/null || true)

if [ -z "$RESPONSE" ]; then
  echo "Healthcheck failed: No response from ${HEALTH_URL}" >&2
  exit 1
fi

if echo "$RESPONSE" | grep -q '"status":"ok"'; then
  exit 0
elif echo "$RESPONSE" | grep -q '"status":"healthy"'; then
  exit 0
else
  echo "Healthcheck returned non-healthy response: ${RESPONSE}" >&2
  exit 1
fi
