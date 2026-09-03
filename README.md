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

It features a pluggable **Provider Adapter Architecture** with automatic priority ordering, fallback execution, SSRF protection, configurable rate limiting, metadata-only persistence, cache invalidation, and automated garbage collection.

---

## Architectural Principles

1. **Backend-First**: Decoupled Express API with modular services.
2. **Metadata-Only Persistence**: No heavy media binaries are stored in the database. Only metadata, temporary stream URLs, and job lifecycles.
3. **Provider Fallback**: Tries providers in priority order (`yt-dlp` ➔ `cobalt` ➔ `external-api`).
4. **No Fake Results**: If a provider or binary is unconfigured, it gracefully reports unavailable and falls back.
5. **No Hardcoded Secrets**: Everything is driven by environment variables.
6. **Zero DRM Bypass**: Strictly designed for public, authorized content.

---

## Project Structure

```
hax-media-downloader/
├── src/
│   ├── api/
│   │   ├── controllers/
│   │   │   ├── downloader.controller.ts   # Public API endpoints
│   │   │   └── admin.controller.ts        # Admin tests & stats
│   │   └── routes/
│   │       ├── downloader.routes.ts       # /api/health, /info, /download, /job
│   │       ├── admin.routes.ts            # /api/admin/*
│   │       └── index.ts
│   ├── providers/
│   │   ├── base/
│   │   │   ├── provider.interface.ts      # DownloaderProvider contract
│   │   │   └── base.provider.ts           # Timeout & error handling base
│   │   ├── ytdlp/
│   │   │   ├── ytdlp.provider.ts          # yt-dlp CLI adapter
│   │   │   └── ytdlp.binary.ts            # Dynamic binary resolver
│   │   ├── cobalt/
│   │   │   └── cobalt.provider.ts         # Cobalt API v7/v10 adapter
│   │   └── external/
│   │       └── external.provider.ts       # 3rd-party REST API adapter
│   ├── services/
│   │   ├── provider-manager/              # Priority & fallback orchestrator
│   │   ├── download/                      # Job lifecycle & download executor
│   │   ├── cache/                         # In-memory TTL cache
│   │   ├── rate-limit/                    # Per-IP / user rate limiter
│   │   └── cleanup/                       # Garbage collector
│   ├── database/
│   │   ├── models/                        # Job, Provider, Cache, RateLimit
│   │   └── repositories/                  # Abstract DB & in-memory engine
│   ├── middleware/                        # Auth, RateLimiter, Validation, Logger
│   ├── utils/                             # SSRF check, Platform detection, Logger
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

---

## Quickstart & Installation

```bash
# Clone and install dependencies
git clone https://github.com/Hamza/hax-media-downloader.git
cd hax-media-downloader
npm install

# Run test suite
npm test

# Start development server (API + Admin Dashboard)
npm run dev

# Build for production
npm run build
npm start
```

---

## API Endpoints

### 1. `POST /api/download`
Initiates download and returns normalized stream URL.
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "type": "video",
  "quality": "720p",
  "format": "mp4"
}
```

**Normalized Response:**
```json
{
  "success": true,
  "platform": "youtube",
  "provider": "yt-dlp",
  "title": "Rick Astley - Never Gonna Give You Up",
  "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
  "duration": 213,
  "format": "mp4",
  "quality": "720p",
  "url": "https://...",
  "expiresAt": "2026-09-03T16:00:00.000Z",
  "jobId": "job_0a1b2c3d4e"
}
```

### 2. `POST /api/info`
Metadata extraction without download.

### 3. `GET /api/providers`
Health, priority, and availability of all registered providers.

### 4. `POST /api/admin/cache/cleanup`
Cron-compatible cache garbage collection.

---

## WhatsApp Bot "Tanu-xai" Integration

Refer to [docs/TANU_XAI_INTEGRATION.md](docs/TANU_XAI_INTEGRATION.md) for complete TypeScript / Baileys code examples.

---

## Cron Garbage Collection

Trigger via external cron:
```bash
# Via Node CLI
tsx cron/cleanup.ts

# Or via HTTP POST
curl -X POST http://localhost:3000/api/admin/cache/cleanup \
  -H "X-Admin-Key: hax-admin-super-secret-key"
```

---

## License & Security
Authored by **Hamza**. Designed strictly for authorized, public content.
