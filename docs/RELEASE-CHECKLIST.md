# Production Release & Pre-Flight Checklist

**Project:** hax-media-downloader  
**Author:** Hamza  
**Target Consumer:** WhatsApp Bot "Tanu-xai" & external clients  
**Version:** 1.0.0  

This checklist must be verified before deploying **hax-media-downloader** to any production environment (Docker, Cloud Run, Kubernetes, or VPS).

---

## 1. Environment & Secret Configuration

- [ ] **`ADMIN_API_KEY` set**: Generated a high-entropy string (e.g. `openssl rand -hex 32`) and provided via environment variable or secret manager.
- [ ] **`CRON_SECRET` set**: Generated a separate high-entropy string for external automated cron triggers.
- [ ] **No default secrets**: Verified that `.env` contains no placeholder values and that `.env` is omitted from version control (`.gitignore`).
- [ ] **`NODE_ENV=production`**: Enforced to enable production optimizations, static asset serving, and disable development Vite middleware.
- [ ] **`CORS_ORIGIN` configured**: Configured to point to the client domain or bot host, rather than an unrestricted wildcard when credentials or sensitive contexts are involved.

---

## 2. Docker & Container Deployment

- [ ] **Deterministic base image**: Dockerfile uses `node:22-bookworm-slim` multi-stage build.
- [ ] **Non-root user**: Container executes under the non-privileged user `node` (UID 1000).
- [ ] **Volume mount for temporary storage**: `/app/temp` is mounted to a volume or scratch disk with adequate IOPS and storage capacity.
- [ ] **Health check configured**: Container includes `HEALTHCHECK` running `/app/scripts/healthcheck.sh` every 30s.
- [ ] **System dependencies present**:
  - [x] Node.js v22.x
  - [x] Official `yt-dlp` executable in `$PATH`
  - [x] System `ffmpeg` and `ffprobe`
  - [x] Python 3 (`python3`)
  - [x] Deno v2.x (`/usr/local/bin/deno`) for YouTube EJS JavaScript challenge solving

---

## 3. Storage & Cleanup Requirements

- [ ] **Max file size bounded**: `MAX_FILE_SIZE_MB` configured (default: 100MB) to prevent disk exhaustion.
- [ ] **Concurrency bounded**: `MAX_CONCURRENT_DOWNLOADS` configured (default: 3) to prevent CPU and network saturation.
- [ ] **Ephemeral lifecycle**: Temporary files are isolated into per-job subdirectories (`temp/<jobId>/media.<ext>`).
- [ ] **Automatic garbage collection**: Background cleanup interval runs periodically (`CLEANUP_INTERVAL_MINUTES=15`).
- [ ] **External cron scheduled**: External cron or scheduler triggers `POST /api/admin/cache/cleanup` with `X-Cron-Secret` header every 10–15 minutes.

---

## 4. Provider Configuration & Fallbacks

- [ ] **yt-dlp operational**: Verified via `GET /api/providers` that `yt-dlp` reports available.
- [ ] **Cobalt provider (optional)**: If using Cobalt as a secondary provider, `COBALT_API_URL` points to an authorized, private Cobalt instance. If unconfigured, the provider reports unavailable safely without crashing.
- [ ] **External API provider (optional)**: If using a 3rd-party REST API as a tertiary fallback, `EXTERNAL_API_URL` and `EXTERNAL_API_KEY` are provided.
- [ ] **Priority order configured**: `PROVIDER_PRIORITY` is set to desired resolution order (default: `ytdlp,cobalt,external`).

---

## 5. Rate Limiting & Concurrency Limitations

- [ ] **Per-IP limits active**: Default limit of 10 downloads/hr per IP enforced with HTTP 429 status and headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`).
- [ ] **Process-local note**: The in-memory rate limiter is process-local. For multi-replica deployments behind a round-robin load balancer, sticky sessions or an upstream reverse proxy (Cloudflare, Nginx, or Redis-backed rate limiter) must be implemented.

---

## 6. Security & Hardening Verification

- [ ] **SSRF protection active**: Verified that internal IP ranges (127.0.0.1, 10.0.0.0/8, 192.168.0.0/16, 172.16.0.0/12, 169.254.169.254, AWS/GCP metadata) and non-standard ports are rejected with HTTP 400 `INVALID_URL`.
- [ ] **Safe file delivery**: All media downloads are served via random file tokens (`GET /api/media/:fileToken`). Internal container filesystem paths are never exposed.
- [ ] **Timing-safe authentication**: Admin and Cron secrets are verified using constant-time comparisons (`crypto.timingSafeEqual`).
- [ ] **Sanitized logging**: Production logs do not contain secrets, tokens, authorization headers, or credentials in query parameters.
- [ ] **Legal compliance**: Service is operated strictly for authorized, publicly accessible content without DRM circumvention.

---

## 7. Monitoring & Operational Observability

- [ ] **Liveness probe**: HTTP `GET /api/health` returns `200 OK` with uptime and memory metrics.
- [ ] **Readiness probe**: HTTP `GET /api/providers` returns registered provider status.
- [ ] **Admin diagnostics**: HTTP `POST /api/admin/providers/test` can be run to inspect live latency and provider responsiveness.
- [ ] **Log aggregation**: Application stdout/stderr JSON logs are routed to a log collector (e.g. CloudWatch, Datadog, or Grafana Loki).
