# hax-media-downloader API Documentation

**Author:** Hamza  
**Version:** 1.0.0  
**Target Consumer:** WhatsApp bot **Tanu-xai** & external clients

All endpoints accept and return `application/json`.

---

## Base URL
```
http://localhost:3000/api
```

---

## Public Endpoints

### 1. System Health
`GET /api/health`

Returns uptime, memory usage, service name, and health.

#### Response:
```json
{
  "status": "ok",
  "service": "hax-media-downloader",
  "author": "Hamza",
  "version": "1.0.0",
  "uptimeSeconds": 360,
  "timestamp": "2026-09-03T15:00:00.000Z",
  "environment": "development",
  "memory": {
    "rssMb": 48,
    "heapUsedMb": 24
  }
}
```

---

### 2. Providers Status
`GET /api/providers`

Lists registered providers, health, configured priority, and supported platforms.

#### Response:
```json
{
  "success": true,
  "priorityOrder": ["ytdlp", "cobalt", "external"],
  "providers": [
    {
      "name": "yt-dlp",
      "supportedPlatforms": ["youtube", "instagram", "tiktok", "facebook", "pinterest"],
      "isAvailable": true,
      "latencyMs": 18,
      "statusMessage": "yt-dlp is available (version 2024.12.23)",
      "version": "2024.12.23"
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

Extracts media title, thumbnail, duration, author, and available formats/qualities without initiating a download.

#### Request Body:
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

#### Response:
```json
{
  "success": true,
  "data": {
    "id": "dQw4w9WgXcQ",
    "title": "Rick Astley - Never Gonna Give You Up (Official Music Video)",
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

### 4. Process Download
`POST /api/download`

Extracts direct media download stream URL using automatic provider fallback.

#### Request Body:
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "type": "video",
  "quality": "720p",
  "format": "mp4"
}
```

#### Normalized Response:
```json
{
  "success": true,
  "platform": "youtube",
  "provider": "yt-dlp",
  "title": "Rick Astley - Never Gonna Give You Up (Official Music Video)",
  "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
  "duration": 213,
  "format": "mp4",
  "quality": "720p",
  "url": "https://rr2---sn-xxxxx.googlevideo.com/videoplayback?...",
  "expiresAt": "2026-09-03T16:00:00.000Z",
  "jobId": "job_3a8b9c1d2e"
}
```

---

### 5. Check Job Status
`GET /api/job/:id`

#### Response:
```json
{
  "success": true,
  "job": {
    "id": "job_3a8b9c1d2e",
    "sourceUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "platform": "youtube",
    "provider": "yt-dlp",
    "status": "completed",
    "title": "Rick Astley - Never Gonna Give You Up (Official Music Video)",
    "mediaUrl": "https://rr2---sn-xxxxx.googlevideo.com/videoplayback?...",
    "createdAt": "2026-09-03T15:00:00.000Z",
    "expiresAt": "2026-09-03T16:00:00.000Z"
  }
}
```

---

### 6. Media Search
`POST /api/search`

#### Request:
```json
{
  "query": "lofi hip hop chill beats",
  "platform": "youtube"
}
```

---

## Admin Endpoints
*Requires header `X-Admin-Key: <ADMIN_API_KEY>` or `Authorization: Bearer <ADMIN_API_KEY>`*

### 1. Test All Providers
`POST /api/admin/providers/test`

Executes live connectivity checks across all providers and returns historical latency and success metrics.

### 2. Cache & Job Cleanup
`POST /api/admin/cache/cleanup`

Deletes expired jobs, purges stale cache records, and marks abandoned jobs as expired.

#### Response:
```json
{
  "success": true,
  "message": "System cache & expired job cleanup completed successfully.",
  "stats": {
    "expiredJobsDeleted": 14,
    "staleCacheEntriesRemoved": 28,
    "abandonedJobsMarkedExpired": 0,
    "executedAt": "2026-09-03T15:10:00.000Z"
  }
}
```

### 3. Server & System Stats
`GET /api/admin/stats`

### 4. Recent Jobs Log
`GET /api/admin/jobs?limit=50`
