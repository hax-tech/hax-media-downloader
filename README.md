# hax-media-downloader

> **Production-Ready Multi-Platform Media Downloader API**  
> **Owner/Author:** Hamza  
> **Target Consumer:** WhatsApp Bot **Tanu-xai** & external clients  
> **Repository:** `https://github.com/hax-tech/hax-media-downloader`

---

## Overview

`hax-media-downloader` is a backend-first, high-performance Node.js & TypeScript media downloader API designed to extract public video and audio from popular media platforms:
* **YouTube**
* **Instagram**
* **TikTok**
* **Facebook**
* **Pinterest**

It features a pluggable **Provider Adapter Architecture** with automatic priority ordering, fallback execution, SSRF protection, configurable rate limiting, concurrency management, streaming range-request file serving (`206 Partial Content`), metadata persistence, and automated garbage collection.

---

## Capabilities & Provider Status

| Feature / Provider | Status | Requirements | Notes |
|---|---|---|---|
| **yt-dlp Provider** | **Active / Production-Ready** | `yt-dlp`, `ffmpeg`, and JS Runtime (`deno` 2.x or `node` 22+) | Default primary provider. Handles public YouTube video/audio streams, extraction, format selection, and conversions. |
| **Cobalt Provider** | **Optional / Supported** | `COBALT_API_URL` environment variable | Optional fallback. If not configured, gracefully reports offline without errors. |
| **External API Provider** | **Optional / Supported** | `EXTERNAL_API_URL` and `EXTERNAL_API_KEY` | Optional third-party fallback. |
| **Supported Platforms** | **YouTube, Instagram, TikTok, Facebook, Pinterest** | Public content only | Content requiring login, age-verification, or DRM is strictly rejected by design. |
| **Docker Support** | **Production-Ready Container** | Docker engine | Packages Node 22, Deno 2.9, FFmpeg 4.4, and verified `yt-dlp` binary with automated health checks. |

---

## Architectural Principles

1. **Backend-First**: Decoupled Express API with modular, testable services.
2. **Real Providers**: Genuine `yt-dlp` CLI binary integration with safe `execFile` parameterization, JavaScript runtime support (Deno 2.x / Node 22+), and format selection. Pluggable `cobalt` and `external-api` adapters.
3. **Provider Fallback**: Tries providers in priority order (`yt-dlp` ➔ `cobalt` ➔ `external-api`).
4. **Stream & Chunk Storage**: Zero memory bloat. Files are streamed to temporary storage, validated via magic bytes, served using HTTP 206 partial content ranges, and automatically cleaned up.
5. **No Hardcoded Secrets**: All settings and keys are driven strictly by environment variables.
6. **Zero DRM Bypass**: Strictly designed for public, authorized content.

---

## Environment Variables

Copy `.env.example` to `.env`. Never commit secrets or hardcode credentials into configuration or repository files.

| Variable | Description | Requirement | Example Placeholder |
|---|---|---|---|
| `PORT` | HTTP Port (defaults to 3000) | Optional | `3000` |
| `NODE_ENV` | Environment (`development`, `production`, `test`) | Optional | `production` |
| `HOST` | Bind host address | Optional | `0.0.0.0` |
| `ADMIN_API_KEY` | Secret token for `/api/admin/*` | **Required in Prod** | `<generate-a-long-random-secret>` |
| `CRON_SECRET` | Secret token for `/api/admin/cache/cleanup` | **Required in Prod** | `<generate-a-long-random-secret>` |
| `CORS_ORIGIN` | Allowed CORS origins | Optional | `https://your-domain.com` |
| `TEMP_DIR` | Directory for temporary downloaded files | Optional | `/app/temp` |
| `MAX_CONCURRENT_DOWNLOADS` | Max simultaneous active downloads | Optional | `3` |
| `MAX_FILE_SIZE_MB` | Maximum allowed media file size in MB | Optional | `100` |
| `RATE_LIMIT_MAX_REQUESTS` | Standard download requests per hour (per IP) | Optional | `10` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in milliseconds | Optional | `3600000` (1 hr) |
| `CACHE_ENABLED` | Enable metadata and job caching | Optional | `true` |
| `CACHE_TTL_SECONDS` | Metadata cache TTL | Optional | `1800` (30 mins) |
| `JOB_EXPIRATION_SECONDS` | Download job & media token TTL | Optional | `3600` (1 hr) |
| `CLEANUP_INTERVAL_MINUTES` | Internal garbage collector interval | Optional | `15` |
| `PROVIDER_PRIORITY` | Provider priority order | Optional | `ytdlp,cobalt,external` |
| `YTDLP_ENABLED` | Enable yt-dlp provider | Optional | `true` |
| `YTDLP_PATH` | Path to yt-dlp binary | Optional | `yt-dlp` |
| `YTDLP_JS_RUNTIME` | JS runtime for challenge solving (`auto`, `deno`, `node`) | Optional | `auto` |
| `YTDLP_REMOTE_COMPONENTS`| EJS challenge solving component (`ejs:github`) | Optional | `ejs:github` |
| `COBALT_ENABLED` | Enable Cobalt provider | Optional | `true` |
| `COBALT_API_URL` | Self-hosted Cobalt API URL (no public default) | Optional | `https://cobalt.internal.yourdomain.com` |
| `EXTERNAL_API_ENABLED` | Enable external third-party API | Optional | `false` |
| `RUN_PROVIDER_INTEGRATION_TESTS`| Run real network integration tests | Test Only | `false` |

---

## Installation & Local Development

This project uses **npm** for deterministic, reproducible builds.

```bash
# 1. Clone repository
git clone https://github.com/hax-tech/hax-media-downloader.git
cd hax-media-downloader

# 2. Install dependencies deterministically
npm ci

# 3. Configure environment
cp .env.example .env
# Edit .env and supply your ADMIN_API_KEY and CRON_SECRET

# 4. Run test suite (Isolated unit & regression tests, zero network reliance)
npm test

# 5. Optional: Run live integration tests (requires network & yt-dlp)
RUN_PROVIDER_INTEGRATION_TESTS=true npm test

# 6. Start development server
npm run dev
```

---

## Production Docker Deployment

The provided multi-stage `Dockerfile` is built on `node:22-bookworm-slim`, containing system `ffmpeg`, Python 3, official `deno` (v2.x) for YouTube JavaScript challenge solving, and the official `yt-dlp` binary. The application runs as a non-privileged `node` user with an automated container healthcheck.

```bash
# 1. Build production Docker image
docker build -t hax-media-downloader:latest .

# 2. Run container
docker run -d \
  --name hax-downloader \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e ADMIN_API_KEY="<generate-a-long-random-secret>" \
  -e CRON_SECRET="<generate-a-long-random-secret>" \
  -e CORS_ORIGIN="https://your-domain.com" \
  -v hax-temp-data:/app/temp \
  hax-media-downloader:latest

# 3. Check container health status
docker inspect --format='{{json .State.Health.Status}}' hax-downloader
```

---

## API Reference

### 1. `GET /api/health`
System healthcheck returning uptime, memory usage, concurrency, and service health.

### 2. `GET /api/providers`
Lists all registered providers, their configured priority, supported platforms, and real-time connectivity status.

### 3. `POST /api/info`
Extracts rich media metadata (title, uploader, duration, thumbnail, available streams) without initiating a download.
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

### 4. `POST /api/download`
Submits an asynchronous download request. Returns HTTP 202 with `jobId`.
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "type": "video",
  "quality": "720p",
  "format": "mp4"
}
```

**Asynchronous Response (HTTP 202 Accepted):**
```json
{
  "success": true,
  "jobId": "job_b8c05e7245b9f6d0",
  "status": "queued"
}
```

*(Note: pass query parameter `?sync=true` if synchronous completion is desired for testing).*

### 5. `GET /api/job/:id`
Polls job state (`queued` ➔ `processing` ➔ `completed` or `failed`).
```json
{
  "success": true,
  "data": {
    "id": "job_b8c05e7245b9f6d0",
    "status": "completed",
    "title": "Rick Astley - Never Gonna Give You Up",
    "mimeType": "video/mp4",
    "size": 11953728,
    "downloadUrl": "/api/media/tok_e827e12a0da2dea23efb06147c7bbfb2",
    "format": "mp4",
    "quality": "720p",
    "duration": 213,
    "expiresAt": "2026-09-04T00:23:45.000Z"
  }
}
```

### 6. `GET /api/media/:fileToken`
Secure, streaming file delivery endpoint. Validates:
* Token existence and ownership
* Job expiration (expired tokens return HTTP 410 Gone)
* File existence on disk
* HTTP 206 Partial Content (range requests for smooth seeking and streaming)
* MIME type headers

### 7. `POST /api/search`
Searches media platforms by query:
```json
{
  "query": "lofi hip hop study beats",
  "platform": "youtube"
}
```

### 8. `POST /api/admin/providers/test`
*Requires `X-Admin-Key` or `Authorization: Bearer <ADMIN_API_KEY>`*. Tests connectivity and latency of all providers.

### 9. `POST /api/admin/cache/cleanup`
*Requires `X-Cron-Secret` or `X-Admin-Key`*. Purges expired jobs, deletes expired temporary media files, and clears stale cache entries.

---

## Rate Limiting & Concurrency

* **Standard Rate Limit**: 10 download requests per hour per IP (configurable via `RATE_LIMIT_MAX_REQUESTS`).
* **Storage & Concurrency**: Download execution is bounded by an asynchronous FIFO queue (`MAX_CONCURRENT_DOWNLOADS=3`).
* **Distributed Caveat**: The built-in rate limiter is memory-bounded and process-local. For distributed horizontal scaling across multiple container replicas, configure a shared Redis or external gateway.

---

## WhatsApp Bot "Tanu-xai" Integration

See [`docs/TANU-XAI-INTEGRATION.md`](docs/TANU-XAI-INTEGRATION.md) for complete TypeScript integration code and client lifecycle contract.

---

## License & Legal Disclaimer

Licensed under the [MIT License](LICENSE).  
Authored by **Hamza**.

This software is strictly intended for downloading and processing authorized, publicly available media for personal backup and educational purposes. End users are solely responsible for adhering to platform terms of service and copyright laws. This software does not bypass DRM or access controls.
