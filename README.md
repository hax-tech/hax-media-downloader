# hax-media-downloader

> **Production-Ready Multi-Platform Media Downloader API**  
> **Owner/Author:** Hamza  
> **Target Consumer:** WhatsApp Bot **Tanu-xai** & external clients

---

## Overview

`hax-media-downloader` is a backend-first, high-performance Node.js & TypeScript media downloader API designed to extract public video and audio from popular media platforms:
* **YouTube**
* **Instagram**
* **TikTok**
* **Facebook**
* **Pinterest**

It features a pluggable **Provider Adapter Architecture** with automatic priority ordering, fallback execution, SSRF protection, configurable rate limiting, concurrency management, streaming range-request file serving, metadata persistence, and automated garbage collection.

---

## Architectural Principles

1. **Backend-First**: Decoupled Express API with modular, testable services.
2. **Real Providers**: Genuine `yt-dlp` CLI binary integration with safe `execFile` parameterization, JavaScript runtime support, and format selection. Pluggable `cobalt` and `external-api` adapters.
3. **Provider Fallback**: Tries providers in priority order (`yt-dlp` ➔ `cobalt` ➔ `external-api`).
4. **Stream & Chunk Storage**: Zero memory bloat. Files are streamed to temporary storage, validated via magic bytes, served using HTTP 206 partial content ranges, and automatically cleaned up.
5. **No Hardcoded Secrets**: All settings and keys are driven by environment variables.
6. **Zero DRM Bypass**: Strictly designed for public, authorized content.

---

## Project Structure

```
hax-media-downloader/
├── src/
│   ├── api/
│   │   ├── controllers/
│   │   │   ├── downloader.controller.ts   # Public API endpoints (/info, /download, /job, /media)
│   │   │   └── admin.controller.ts        # Admin tests & stats
│   │   └── routes/
│   │       ├── downloader.routes.ts       # /api/health, /info, /download, /job, /media
│   │       ├── admin.routes.ts            # /api/admin/*
│   │       └── index.ts
│   ├── providers/
│   │   ├── base/
│   │   │   ├── provider.interface.ts      # DownloaderProvider contract
│   │   │   └── base.provider.ts           # Timeout & error handling base
│   │   ├── ytdlp/
│   │   │   ├── ytdlp.provider.ts          # yt-dlp CLI adapter
│   │   │   └── ytdlp.binary.ts            # Dynamic binary resolver & runtime detection
│   │   ├── cobalt/
│   │   │   └── cobalt.provider.ts         # Cobalt API v7/v10 adapter
│   │   └── external/
│   │       └── external.provider.ts       # 3rd-party REST API adapter
│   ├── services/
│   │   ├── provider-manager/              # Priority & fallback orchestrator
│   │   ├── download/                      # Job lifecycle, queue & concurrency executor
│   │   ├── storage/                       # Safe file validation, streaming & cleanup
│   │   ├── cache/                         # In-memory TTL cache
│   │   ├── rate-limit/                    # Per-IP / user rate limiter
│   │   └── cleanup/                       # Garbage collector
│   ├── database/
│   │   ├── models/                        # Job, Provider, Cache, RateLimit
│   │   └── repositories/                  # Abstract DB & in-memory engine
│   ├── middleware/                        # Auth, RateLimiter, Validation, Logger
│   │   ├── error.middleware.ts            # Centralized DownloaderError mapper
│   ├── utils/                             # SSRF check, Platform detection, Logger, Errors
│   ├── config/                            # Typed environment configuration
│   ├── types/                             # Global TypeScript declarations
│   ├── app.ts                             # Express setup
│   └── App.tsx                            # Admin & Developer Dashboard UI
├── cron/
│   └── cleanup.ts                         # Standalone cron cleanup job
├── scripts/
│   └── update-ytdlp.ts                    # Official yt-dlp updater
├── tests/                                 # Complete unit & integration test suite
├── docs/                                  # API, Providers, and Bot guides
├── .env.example
├── Dockerfile
├── README.md
├── package.json
├── server.ts
└── tsconfig.json
```

---

## Environment Variables

Copy `.env.example` to `.env`:

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP Port | `3000` |
| `ADMIN_API_KEY` | Secret token for `/api/admin/*` | `hax-admin-super-secret-key` |
| `TEMP_DIR` | Directory for temporary downloaded files | `./temp` |
| `MAX_CONCURRENT_DOWNLOADS` | Max simultaneous active downloads | `3` |
| `MAX_FILE_SIZE_BYTES` | Maximum allowed media file size | `104857600` (100MB) |
| `RATE_LIMIT_MAX_REQUESTS` | Standard requests per hour | `10` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in ms | `3600000` (1 hr) |
| `CACHE_ENABLED` | Enable response caching | `true` |
| `CACHE_TTL_SECONDS` | Cache expiration | `1800` (30 mins) |
| `JOB_EXPIRATION_SECONDS` | Download job metadata TTL | `3600` (1 hr) |
| `PROVIDER_PRIORITY` | Provider priority order | `ytdlp,cobalt,external` |
| `YTDLP_ENABLED` | Enable yt-dlp provider | `true` |
| `YTDLP_PATH` | Path to yt-dlp binary | `yt-dlp` |
| `COBALT_ENABLED` | Enable Cobalt provider | `true` |
| `COBALT_API_URL` | Cobalt instance URL | `""` |
| `EXTERNAL_API_ENABLED` | Enable external API provider | `true` |
| `EXTERNAL_API_URL` | Third-party API base URL | `""` |
| `CRON_SECRET` | Secret token for external cron endpoints | `hax-cron-secret-key` |

---

## Quickstart & Installation

```bash
# Clone and install dependencies
git clone https://github.com/Hamza/hax-media-downloader.git
cd hax-media-downloader
npm install

# Run test suite
npm test

# Run real yt-dlp integration tests
RUN_PROVIDER_INTEGRATION_TESTS=true npm test

# Start development server (API + Admin Dashboard)
npm run dev

# Build for production
npm run build
npm start
```

---

## API Endpoints

### 1. `POST /api/download`
Creates an asynchronous queued download job (or synchronous if `?sync=true`).
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "type": "video",
  "quality": "720p",
  "format": "mp4"
}
```

**Job Creation Response (HTTP 202):**
```json
{
  "success": true,
  "data": {
    "jobId": "job_e86bbeb3cbc52141",
    "status": "queued"
  },
  "jobId": "job_e86bbeb3cbc52141",
  "status": "queued"
}
```

### 2. `GET /api/job/:id`
Poll job status.
```json
{
  "success": true,
  "data": {
    "id": "job_e86bbeb3cbc52141",
    "status": "completed",
    "title": "Rick Astley - Never Gonna Give You Up",
    "mimeType": "video/mp4",
    "size": 15482910,
    "downloadUrl": "/api/media/tok_e827e12a0da2dea23efb06147c7bbfb2",
    "format": "mp4",
    "quality": "720p",
    "duration": 213,
    "createdAt": "2026-09-03T22:59:57.117Z",
    "expiresAt": "2026-09-04T00:00:06.269Z"
  }
}
```

### 3. `GET /api/media/:token`
Streams the completed media file with HTTP Range support (`206 Partial Content`), safe headers, and content disposition.

### 4. `POST /api/info`
Extracts rich media metadata without downloading:
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

### 5. `POST /api/search`
Searches YouTube/media platforms:
```json
{
  "query": "Rick Astley",
  "platform": "youtube"
}
```

### 6. `GET /api/providers`
Health, priority, and availability of all registered providers.

### 7. `GET /api/health`
System uptime, memory usage, and concurrency statistics.

---

## WhatsApp Bot "Tanu-xai" Integration

```typescript
// Tanu-xai WhatsApp Bot Handler Example
async function handleMediaDownload(sock, chatId, userUrl) {
  // 1. Submit download job
  const res = await fetch('http://localhost:3000/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: userUrl, type: 'video', quality: '720p' }),
  });
  const { data } = await res.json();

  // 2. Poll job status
  let job;
  while (true) {
    await new Promise((r) => setTimeout(r, 1500));
    const jobRes = await fetch(`http://localhost:3000/api/job/${data.jobId}`);
    const jobJson = await jobRes.json();
    job = jobJson.data;
    if (job.status === 'completed' || job.status === 'failed') break;
  }

  // 3. Dispatch to WhatsApp user
  if (job.status === 'completed') {
    const fullMediaUrl = `http://localhost:3000${job.downloadUrl}`;
    await sock.sendMessage(chatId, {
      video: { url: fullMediaUrl },
      caption: `🎬 ${job.title}`,
    });
  } else {
    await sock.sendMessage(chatId, { text: `❌ Download failed: ${job.error}` });
  }
}
```

---

## License & Security
Authored by **Hamza**. Designed strictly for authorized, public content.
