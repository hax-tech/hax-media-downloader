# hax-media-downloader API Documentation

**Author:** Hamza  
**Version:** 1.0.0  
**Target Consumer:** WhatsApp bot **Tanu-xai** & external clients  
**Repository:** `https://github.com/hax-tech/hax-media-downloader`

All endpoints accept and return `application/json` (except media streaming endpoints which return binary media with appropriate `Content-Type`).

---

## Base URL
```
http://localhost:3000/api
```

---

## Authentication

| Header | Usage | Description |
|:---|:---|:---|
| `X-Admin-Key` | Admin Endpoints | Matches configured `ADMIN_API_KEY` |
| `Authorization: Bearer <token>` | Admin Endpoints | Alternative bearer token header |
| `X-Cron-Secret` | Cron / Cleanup | Matches configured `CRON_SECRET` for `/api/admin/cache/cleanup` |
| `X-Api-Key` | Public API | Optional identifier for per-client rate limit attribution |

---

## Error Response Format

All API errors return a uniform JSON structure with stable, programmatic error codes:

```json
{
  "success": false,
  "error": "Human-readable safe error message",
  "code": "INVALID_URL",
  "path": "/api/download",
  "timestamp": "2026-09-03T23:00:00.000Z"
}
```

### Programmatic Error Codes

| HTTP Status | Error Code | Description |
|:---|:---|:---|
| `400` | `INVALID_URL` | Malformed URL, failed SSRF check, restricted port, or dangerous characters. |
| `400` | `UNSUPPORTED_PLATFORM` | URL domain is not one of: YouTube, Instagram, TikTok, Facebook, Pinterest. |
| `400` | `VALIDATION_ERROR` | Request body schema failed validation. |
| `401` | `UNAUTHORIZED` | Missing or invalid `X-Admin-Key` or `X-Cron-Secret`. |
| `404` | `JOB_NOT_FOUND` | Specified `jobId` does not exist or has expired. |
| `404` | `FILE_NOT_FOUND` | Media file associated with token was removed or does not exist. |
| `410` | `DOWNLOAD_EXPIRED` | Download job or media token has exceeded its TTL (default: 1 hour). |
| `413` | `FILE_TOO_LARGE` | Target media exceeds configured `MAX_FILE_SIZE_MB`. |
| `429` | `RATE_LIMITED` | Client has exceeded 10 download requests per hour. |
| `502` | `INVALID_MEDIA` | Downloaded file failed magic-byte verification or is corrupted. |
| `503` | `YTDLP_NOT_FOUND` | yt-dlp binary is missing or not installed on host. |
| `503` | `PROVIDER_UNAVAILABLE` | Configured provider is offline or missing required environment credentials. |
| `504` | `DOWNLOAD_TIMEOUT` | Download execution exceeded provider timeout limit. |

---

## Public Endpoints

### 1. System Health
`GET /api/health`

Returns application status, uptime, memory, and concurrency metrics. Suitable for container liveness probes.

#### Response (HTTP 200):
```json
{
  "status": "ok",
  "service": "hax-media-downloader",
  "author": "Hamza",
  "version": "1.0.0",
  "uptimeSeconds": 182,
  "timestamp": "2026-09-03T23:15:00.000Z",
  "environment": "production",
  "memory": {
    "rssMb": 85,
    "heapUsedMb": 22
  },
  "concurrency": {
    "maxConcurrent": 3
  }
}
```

---

### 2. Providers Status
`GET /api/providers`

Lists all registered providers, their availability, latency, and supported platforms.

#### Response (HTTP 200):
```json
{
  "success": true,
  "priorityOrder": ["ytdlp", "cobalt", "external"],
  "providers": [
    {
      "name": "yt-dlp",
      "supportedPlatforms": ["youtube", "instagram", "tiktok", "facebook", "pinterest"],
      "isAvailable": true,
      "latencyMs": 14,
      "statusMessage": "yt-dlp v2026.08.19 | FFmpeg active | JS runtime: deno v2.9.6 | EJS: ejs:github",
      "version": "2026.08.19"
    },
    {
      "name": "cobalt",
      "supportedPlatforms": ["youtube", "instagram", "tiktok", "facebook", "pinterest"],
      "isAvailable": false,
      "statusMessage": "COBALT_API_URL is not configured in environment"
    },
    {
      "name": "external-api",
      "supportedPlatforms": ["youtube", "instagram", "tiktok", "facebook", "pinterest"],
      "isAvailable": false,
      "statusMessage": "EXTERNAL_API_URL is not configured in environment"
    }
  ]
}
```

---

### 3. Media Metadata Info
`POST /api/info`

Extracts media title, thumbnail, duration, author, and available streams without initiating a download.

#### Request Body:
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

#### Response (HTTP 200):
```json
{
  "success": true,
  "data": {
    "id": "dQw4w9WgXcQ",
    "title": "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)",
    "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
    "duration": 213,
    "author": "Rick Astley",
    "platform": "youtube",
    "availableQualities": ["1080p", "720p", "480p", "360p"],
    "availableFormats": ["mp4", "webm", "mp3", "m4a"],
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "originalUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "providerUsed": "yt-dlp"
  }
}
```

---

### 4. Create Download Job
`POST /api/download`

Submits an asynchronous download request to the worker queue.

#### Request Body:
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "type": "video",
  "quality": "720p",
  "format": "mp4"
}
```

#### Asynchronous Response (HTTP 202 Accepted):
```json
{
  "success": true,
  "jobId": "job_b8c05e7245b9f6d0",
  "status": "queued",
  "message": "Download job queued successfully. Poll /api/job/:jobId for completion."
}
```

*(Optional: Append query parameter `?sync=true` to wait for download completion synchronously).*

---

### 5. Check Job Status
`GET /api/job/:id`

Polls the state of a download job.

#### Job States:
* `queued`: Waiting for an available worker slot (max 3 concurrent).
* `processing`: Downloading and validating media streams.
* `completed`: Download finished and ready for streaming.
* `failed`: Download failed (includes safe error message).
* `expired`: Media and metadata have expired.

#### Completed Response (HTTP 200):
```json
{
  "success": true,
  "data": {
    "id": "job_b8c05e7245b9f6d0",
    "status": "completed",
    "title": "Rick Astley - Never Gonna Give You Up",
    "platform": "youtube",
    "provider": "yt-dlp",
    "format": "mp4",
    "quality": "720p",
    "duration": 213,
    "mimeType": "video/mp4",
    "size": 11953728,
    "downloadUrl": "/api/media/tok_e827e12a0da2dea23efb06147c7bbfb2",
    "createdAt": "2026-09-03T23:23:39.534Z",
    "expiresAt": "2026-09-04T00:23:39.534Z",
    "progress": null
  }
}
```

---

### 6. Streaming Media Delivery
`GET /api/media/:fileToken`

Delivers the downloaded file securely using an opaque token.

#### Features:
- **No Path Disclosure**: File system paths (`/app/temp/...`) are never exposed to clients.
- **HTTP 206 Range Requests**: Supports `Range: bytes=0-1048575` for video seeking and WhatsApp streaming.
- **Expiration Enforcement**: Returns HTTP 410 if the token or job is expired.
- **Safe Headers**: Sends `Content-Disposition: attachment; filename="<sanitized-title>.<ext>"`.

---

### 7. Media Search
`POST /api/search`

Searches supported media platforms for video titles and URLs.

#### Request Body:
```json
{
  "query": "lofi hip hop study beats",
  "platform": "youtube"
}
```

#### Response (HTTP 200):
```json
{
  "success": true,
  "query": "lofi hip hop study beats",
  "count": 5,
  "results": [
    {
      "id": "jfKfPfyJRdk",
      "title": "lofi hip hop radio 📚 beats to relax/study to",
      "url": "https://www.youtube.com/watch?v=jfKfPfyJRdk",
      "duration": 0,
      "uploader": "Lofi Girl",
      "platform": "youtube"
    }
  ]
}
```

---

## Admin Endpoints

*All admin endpoints require `X-Admin-Key` header or `Authorization: Bearer <ADMIN_API_KEY>`*.

### 1. Test All Providers
`POST /api/admin/providers/test`

Runs real connectivity and latency probes against all configured providers.

---

### 2. Cache & Storage Cleanup
`POST /api/admin/cache/cleanup`

*Accepts either `X-Cron-Secret` (configured `CRON_SECRET`) or `X-Admin-Key`*.  
Deletes expired download jobs, removes temporary disk files, and clears stale cache entries. Safe and idempotent.

#### Response (HTTP 200):
```json
{
  "success": true,
  "message": "System cache & expired job cleanup completed successfully.",
  "stats": {
    "expiredJobsDeleted": 8,
    "staleCacheEntriesRemoved": 15,
    "abandonedJobsMarkedExpired": 0,
    "executedAt": "2026-09-03T23:30:00.000Z"
  }
}
```
