# Downloader Provider Architecture

## Overview

`hax-media-downloader` utilizes a provider adapter architecture decoupling the API routing layer from specific media scrapers and extraction backends.

```
Incoming Request
      │
      ▼
ProviderManager
      │
      ├── Detects Platform (YouTube, Instagram, TikTok, Facebook, Pinterest)
      ├── Filters Supported Providers
      └── Sorts by Priority Order (PROVIDER_PRIORITY="ytdlp,cobalt,external")
            │
            ├─► 1. YtDlpProvider (Native / Binary)
            │      └── If fails / unavailable ──┐
            ├─► 2. CobaltProvider (API) ◄───────┘
            │      └── If fails / unavailable ──┐
            └─► 3. ExternalApiProvider ◄────────┘
```

---

## 1. YtDlpProvider

### Features
* Complete metadata extraction via `--dump-single-json`
* Format selection (video / audio)
* Resolution selection (2160p, 1080p, 720p, 480p, etc.)
* Zero external network API dependencies

### Binary Resolution Strategy
The `YtDlpBinaryManager` checks candidates in this order:
1. `YTDLP_PATH` environment variable
2. Local workspace `./bin/yt-dlp`
3. `/usr/local/bin/yt-dlp`
4. `/usr/bin/yt-dlp`
5. System PATH lookup (`yt-dlp`)

### Safe Updates
Run the safe updater script:
```bash
npm run update-ytdlp # or tsx scripts/update-ytdlp.ts
```

---

## 2. CobaltProvider

### Features
* Ultra-fast processing of web videos
* Self-hosted or hosted instance integration
* Graceful fallback when instance is unconfigured

### Configuration
```env
COBALT_ENABLED=true
COBALT_API_URL=https://cobalt.yourdomain.com
COBALT_API_KEY=your-api-key-optional
COBALT_TIMEOUT_MS=20000
```

---

## 3. ExternalApiProvider

### Features
* Allows integrating any generic 3rd-party REST media API
* Dynamic headers and key management
* Normalized output translation

### Configuration
```env
EXTERNAL_API_ENABLED=true
EXTERNAL_API_URL=https://api.thirdparty-downloader.com
EXTERNAL_API_KEY=secret_key
EXTERNAL_API_HEADER=x-api-key
EXTERNAL_TIMEOUT_MS=20000
```

---

## Adding a Custom Provider

To add a new provider:
1. Extend `BaseProvider` from `src/providers/base/base.provider.ts`
2. Implement `name`, `supportedPlatforms`, `getInfo()`, `download()`, and `healthCheck()`
3. Register the instance in `ProviderManager`:
```typescript
import { providerManager } from './src/services/provider-manager/provider-manager.service.ts';
import { MyCustomProvider } from './src/providers/custom/my.provider.ts';

providerManager.registerProvider(new MyCustomProvider());
```
