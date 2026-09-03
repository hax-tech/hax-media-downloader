#!/usr/bin/env bash
set -euo pipefail

# Safe downloader script for official yt-dlp release binary
TARGET_DIR="${1:-./bin}"
TARGET_PATH="${TARGET_DIR}/yt-dlp"

echo "[yt-dlp installer] Preparing destination directory: ${TARGET_DIR}..."
mkdir -p "${TARGET_DIR}"

DOWNLOAD_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"

echo "[yt-dlp installer] Downloading official yt-dlp binary from ${DOWNLOAD_URL}..."
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "${DOWNLOAD_URL}" -o "${TARGET_PATH}"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "${TARGET_PATH}" "${DOWNLOAD_URL}"
else
  echo "[yt-dlp installer] Error: neither curl nor wget found." >&2
  exit 1
fi

chmod a+rx "${TARGET_PATH}"

echo "[yt-dlp installer] Validating downloaded executable..."
if "${TARGET_PATH}" --version >/dev/null 2>&1; then
  VERSION=$("${TARGET_PATH}" --version)
  echo "[yt-dlp installer] Successfully installed yt-dlp (version: ${VERSION}) at ${TARGET_PATH}"
  exit 0
else
  echo "[yt-dlp installer] Error: Downloaded file is not a valid executable." >&2
  rm -f "${TARGET_PATH}"
  exit 1
fi
