# Tanu-xai Client Integration Contract

**Client:** WhatsApp Bot **Tanu-xai**  
**Author:** Hamza  
**Target API:** hax-media-downloader (Node.js TypeScript API)

This document defines the client integration contract for Tanu-xai to consume media downloads reliably using asynchronous job queuing and polling.

---

## Asynchronous Architecture Flow

```
+------------------+         +----------------------------+
|  Tanu-xai Bot    |         |  hax-media-downloader API  |
+------------------+         +----------------------------+
         |                                  |
         | 1. POST /api/download            |
         |--------------------------------->| (Enqueues job)
         |                                  |
         | 2. Returns 202 { jobId, status } |
         |<---------------------------------|
         |                                  |
         | [Poll Loop: every 1.5 - 2s]     |
         | 3. GET /api/job/:jobId           |
         |--------------------------------->|
         |                                  |
         | 4. Returns { status, progress }  |
         |<---------------------------------| (queued -> processing)
         |                                  |
         | ... polling ...                  |
         |                                  |
         | 5. Returns { status: completed,  |
         |              downloadUrl, title }|
         |<---------------------------------|
         |                                  |
         | 6. Fetches media stream & sends  |
         |    to WhatsApp chat              |
         +                                  +
```

---

## Minimal Node.js / TypeScript Client Example

This sample demonstrates the full lifecycle contract:
1. Send URL
2. Receive jobId
3. Poll job status
4. Receive completed result
5. Centralized failure handling
6. Respect rate limits (HTTP 429 backoff)

```typescript
import axios, { AxiosError } from 'axios';

interface DownloadJobResponse {
  success: boolean;
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  data?: {
    id: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    title?: string;
    mimeType?: string;
    size?: number;
    downloadUrl?: string;
    progress: number | null;
    error?: string;
    errorCode?: string;
  };
}

export class TanuXaiDownloaderClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(baseUrl = 'http://localhost:3000/api', apiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      h['x-api-key'] = this.apiKey;
    }
    return h;
  }

  /**
   * Dispatches a download request, polls until completion, and returns final media metadata.
   */
  async requestAndDownloadMedia(
    url: string,
    type: 'video' | 'audio' = 'video',
    quality = '720p',
    format?: string
  ) {
    try {
      // 1. Submit download request
      console.log(`[Tanu-xai] Submitting URL: ${url} (${type}, ${quality})`);
      const postRes = await axios.post<DownloadJobResponse>(
        `${this.baseUrl}/download`,
        { url, type, quality, format },
        { headers: this.headers, timeout: 10000 }
      );

      const jobId = postRes.data.jobId || postRes.data.data?.id;
      if (!jobId) {
        throw new Error('Downloader API did not return a valid jobId');
      }

      console.log(`[Tanu-xai] Job created: ${jobId}. Polling status...`);

      // 2. Poll job status until completed or failed
      const pollIntervalMs = 1500;
      const maxTimeoutMs = 120000; // 2 minutes
      const startTime = Date.now();

      while (Date.now() - startTime < maxTimeoutMs) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));

        const jobRes = await axios.get<DownloadJobResponse>(
          `${this.baseUrl}/job/${jobId}`,
          { headers: this.headers, timeout: 5000 }
        );

        const job = jobRes.data.data;
        if (!job) continue;

        console.log(`[Tanu-xai] Job ${jobId} status: ${job.status} (progress: ${job.progress ?? 'n/a'})`);

        if (job.status === 'completed') {
          // Absolute download URL
          const fullDownloadUrl = job.downloadUrl?.startsWith('http')
            ? job.downloadUrl
            : `${this.baseUrl.replace(/\/api$/, '')}${job.downloadUrl}`;

          return {
            jobId,
            status: 'completed' as const,
            title: job.title || 'Downloaded Media',
            mimeType: job.mimeType || (type === 'audio' ? 'audio/mpeg' : 'video/mp4'),
            size: job.size || 0,
            downloadUrl: fullDownloadUrl,
          };
        }

        if (job.status === 'failed') {
          throw new Error(`Media download job failed: ${job.error || job.errorCode || 'Unknown error'}`);
        }
      }

      throw new Error(`Download job ${jobId} timed out after ${maxTimeoutMs / 1000}s`);
    } catch (err: unknown) {
      this.handleError(err);
      throw err;
    }
  }

  /**
   * Centralized error and rate limit handling
   */
  private handleError(err: unknown): void {
    if (axios.isAxiosError(err)) {
      const axiosErr = err as AxiosError<{ code?: string; error?: string }>;
      const status = axiosErr.response?.status;
      const code = axiosErr.response?.data?.code;
      const message = axiosErr.response?.data?.error || axiosErr.message;

      if (status === 429 || code === 'RATE_LIMITED') {
        console.warn(`[Tanu-xai Rate Limit] Backing off: ${message}`);
        // Rate limit hit: notify WhatsApp user to slow down
        return;
      }

      if (status === 400 && code === 'INVALID_URL') {
        console.warn(`[Tanu-xai Invalid URL] ${message}`);
        return;
      }

      if (status === 400 && code === 'UNSUPPORTED_PLATFORM') {
        console.warn(`[Tanu-xai Unsupported Platform] ${message}`);
        return;
      }

      if (status === 503) {
        console.error(`[Tanu-xai Provider Unavailable] Provider or binary offline: ${message}`);
        return;
      }

      console.error(`[Tanu-xai API Error] HTTP ${status} [${code}]: ${message}`);
    } else {
      console.error('[Tanu-xai Client Error]', (err as Error).message);
    }
  }
}
```

---

## Error Handling Matrix for Tanu-xai

| HTTP Status | Error Code | Bot Behavior |
|:---|:---|:---|
| `400` | `INVALID_URL` | Reply to user: *"The link you sent is invalid. Please check the URL and try again."* |
| `400` | `UNSUPPORTED_PLATFORM` | Reply to user: *"Unsupported site. We currently support YouTube, Instagram, TikTok, Facebook, and Pinterest."* |
| `413` | `FILE_TOO_LARGE` | Reply to user: *"The requested media exceeds the maximum supported file size limit."* |
| `429` | `RATE_LIMITED` | Reply to user: *"You have reached the rate limit (10 downloads/hr). Please wait before requesting another download."* |
| `502` | `INVALID_MEDIA` | Reply to user: *"Downloaded media was corrupted or restricted by host platform."* |
| `503` | `YTDLP_NOT_FOUND` | Alert bot admin: *"Downloader binary is not available on host."* |
| `504` | `DOWNLOAD_TIMEOUT` | Reply to user: *"Download timed out. The video may be too long or unavailable."* |
