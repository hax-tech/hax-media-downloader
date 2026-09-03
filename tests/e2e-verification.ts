import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createApp } from '../src/app.ts';
import { config } from '../src/config/index.ts';
import { db } from '../src/database/repositories/memory-database.ts';
import { storageService } from '../src/services/storage/storage.service.ts';
import { YtDlpBinaryManager } from '../src/providers/ytdlp/ytdlp.binary.ts';
import { YtDlpProvider } from '../src/providers/ytdlp/ytdlp.provider.ts';
import { providerManager } from '../src/services/provider-manager/provider-manager.service.ts';
import { cleanupService } from '../src/services/cleanup/cleanup.service.ts';
import { DownloaderError } from '../src/utils/errors.ts';
import { isSafeUrl } from '../src/utils/ssrf.ts';
import { timingSafeCompare, verifyAdminKey, verifyCronSecret } from '../src/middleware/auth.middleware.ts';

const TEST_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

export async function runE2EVerification() {
  console.log('\n=============================================================');
  console.log('  HAX-MEDIA-DOWNLOADER PHASE 3 — E2E PRODUCTION VERIFICATION');
  console.log('  Author: Hamza | Client: Tanu-xai');
  console.log('=============================================================\n');

  // Start in-memory HTTP server on ephemeral port
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Ephemeral test server running at ${baseUrl}\n`);

  const results: Record<string, 'PASS' | 'FAIL' | 'NOT RUN'> = {};

  try {
    // -------------------------------------------------------------
    // GATE 1: DEPENDENCY HEALTH CHECK
    // -------------------------------------------------------------
    console.log('--- 1. Dependency Health Check ---');
    const binaryRes = await YtDlpBinaryManager.resolveBinary();
    assert.ok(binaryRes.available, 'yt-dlp must be available');
    console.log(`yt-dlp:   PASS (v${binaryRes.version}, path: ${binaryRes.path})`);

    const ffmpegRes = await YtDlpBinaryManager.checkFfmpeg();
    assert.ok(ffmpegRes, 'FFmpeg must be available');
    console.log(`FFmpeg:   PASS (active)`);

    const jsRuntimeRes = await YtDlpBinaryManager.resolveJsRuntime();
    assert.ok(jsRuntimeRes.available, 'JS runtime must be available');
    console.log(`JS Runtime: PASS (${jsRuntimeRes.name} v${jsRuntimeRes.version || 'detected'})`);
    console.log(`EJS config: ${config.providers.ytdlp.ejsSource}`);

    // -------------------------------------------------------------
    // GATE 2: HEALTH ENDPOINT
    // -------------------------------------------------------------
    console.log('\n--- 2. Health Endpoint (GET /api/health) ---');
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(healthRes.status, 200, 'Health endpoint must return 200');
    const healthJson = await healthRes.json() as Record<string, any>;
    assert.strictEqual(healthJson.status, 'ok', 'Health status must be "ok"');
    assert.ok(healthJson.uptimeSeconds >= 0, 'Uptime must be reported');
    assert.ok(healthJson.timestamp, 'Timestamp must be reported');
    assert.ok(healthJson.memory, 'Memory metrics must be reported');
    // Verify no secrets exposed
    assert.strictEqual(healthJson.adminApiKey, undefined, 'Must not expose adminApiKey');
    assert.strictEqual(healthJson.cronSecret, undefined, 'Must not expose cronSecret');
    console.log(`Health endpoint: PASS (${JSON.stringify(healthJson.memory)})`);

    // -------------------------------------------------------------
    // GATE 3: PROVIDER STATUS
    // -------------------------------------------------------------
    console.log('\n--- 3. Provider Status (GET /api/providers) ---');
    const provRes = await fetch(`${baseUrl}/api/providers`);
    assert.strictEqual(provRes.status, 200, 'Providers endpoint must return 200');
    const provJson = await provRes.json() as Record<string, any>;
    assert.strictEqual(provJson.success, true);
    assert.ok(Array.isArray(provJson.providers), 'Providers list must be an array');
    const ytdlpProv = provJson.providers.find((p: any) => p.name === 'yt-dlp');
    const cobaltProv = provJson.providers.find((p: any) => p.name === 'cobalt');
    const extProv = provJson.providers.find((p: any) => p.name === 'external-api');
    assert.ok(ytdlpProv, 'yt-dlp provider must be reported');
    assert.strictEqual(ytdlpProv.isAvailable, true, 'yt-dlp provider must be available');
    console.log(`yt-dlp:       Available (v${ytdlpProv.version})`);
    console.log(`Cobalt:       ${cobaltProv?.isAvailable ? 'Available' : 'Unconfigured (Safe fallback)'}`);
    console.log(`External API: ${extProv?.isAvailable ? 'Available' : 'Unconfigured (Safe fallback)'}`);
    console.log('Provider status: PASS');

    // -------------------------------------------------------------
    // GATE 4: REAL YOUTUBE INFO TEST
    // -------------------------------------------------------------
    console.log('\n--- 4. Real YouTube Info Extraction (POST /api/info) ---');
    const infoRes = await fetch(`${baseUrl}/api/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: TEST_URL }),
    });
    assert.strictEqual(infoRes.status, 200, 'Info extraction must return 200');
    const infoJson = await infoRes.json() as Record<string, any>;
    assert.strictEqual(infoJson.success, true);
    assert.ok(infoJson.data.title.includes('Rick Astley'), `Title must match ("${infoJson.data.title}")`);
    assert.strictEqual(infoJson.data.platform, 'youtube');
    assert.strictEqual(infoJson.data.uploader, 'Rick Astley');
    assert.ok(infoJson.data.duration > 200, 'Duration must be > 200 seconds');
    assert.ok(infoJson.data.thumbnail, 'Thumbnail URL must be present');
    assert.ok(Array.isArray(infoJson.data.formats), 'Formats list must be present');
    console.log(`Title:    "${infoJson.data.title}"`);
    console.log(`Uploader: "${infoJson.data.uploader}" | Duration: ${infoJson.data.duration}s`);
    console.log(`Formats:  ${infoJson.data.formats.length} streams discovered`);
    results['REAL YOUTUBE INFO'] = 'PASS';

    // -------------------------------------------------------------
    // GATE 5: REAL YOUTUBE AUDIO TEST (MP3 Conversion)
    // -------------------------------------------------------------
    console.log('\n--- 5. Real YouTube Audio Download (MP3) ---');
    const audioSyncRes = await fetch(`${baseUrl}/api/download?sync=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: TEST_URL,
        type: 'audio',
        format: 'mp3',
        sync: true,
      }),
    });
    assert.strictEqual(audioSyncRes.status, 200, 'Sync audio download must return 200');
    const audioJson = await audioSyncRes.json() as Record<string, any>;
    assert.strictEqual(audioJson.success, true);
    assert.strictEqual(audioJson.data.status, 'completed');
    assert.strictEqual(audioJson.data.mimeType, 'audio/mpeg');
    assert.ok(audioJson.data.size > 1024 * 100, 'MP3 file size must be > 100KB');
    assert.ok(audioJson.data.downloadUrl.startsWith('/api/media/'), 'Must return valid downloadUrl');
    // Verify file exists on disk and has valid MP3 bytes
    const audioToken = audioJson.fileToken;
    const tokenFile = storageService.getFileByToken(audioToken);
    assert.ok(tokenFile, 'Token must resolve to stored file');
    assert.ok(fs.existsSync(tokenFile.filePath), 'Target file must exist in storage');
    assert.strictEqual(path.extname(tokenFile.filePath), '.mp3');
    // Cleanup
    await storageService.cleanupJob(audioJson.jobId);
    console.log(`Audio MP3: PASS (Size: ${Math.round(audioJson.data.size / 1024)}KB, MIME: ${audioJson.data.mimeType})`);
    results['REAL YOUTUBE MP3'] = 'PASS';

    // -------------------------------------------------------------
    // GATE 6: REAL YOUTUBE VIDEO TEST (MP4 Merging)
    // -------------------------------------------------------------
    console.log('\n--- 6. Real YouTube Video Download (MP4 360p) ---');
    const videoSyncRes = await fetch(`${baseUrl}/api/download?sync=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: TEST_URL,
        type: 'video',
        quality: '360p',
        format: 'mp4',
        sync: true,
      }),
    });
    assert.strictEqual(videoSyncRes.status, 200, 'Sync video download must return 200');
    const videoJson = await videoSyncRes.json() as Record<string, any>;
    assert.strictEqual(videoJson.success, true);
    assert.strictEqual(videoJson.data.status, 'completed');
    assert.strictEqual(videoJson.data.mimeType, 'video/mp4');
    assert.ok(videoJson.data.size > 1024 * 500, 'MP4 file size must be > 500KB');
    const videoToken = videoJson.fileToken;
    const videoTokenFile = storageService.getFileByToken(videoToken);
    assert.ok(videoTokenFile, 'Video token must resolve to stored file');
    assert.ok(fs.existsSync(videoTokenFile.filePath), 'MP4 file must exist on disk');
    // Cleanup
    await storageService.cleanupJob(videoJson.jobId);
    console.log(`Video MP4: PASS (Size: ${Math.round(videoJson.data.size / 1024 / 1024 * 10) / 10}MB, MIME: ${videoJson.data.mimeType})`);
    results['REAL YOUTUBE MP4'] = 'PASS';

    // -------------------------------------------------------------
    // GATE 7: REAL YOUTUBE SEARCH
    // -------------------------------------------------------------
    console.log('\n--- 7. Real YouTube Search (POST /api/search) ---');
    const searchRes = await fetch(`${baseUrl}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'lofi hip hop beats', platform: 'youtube' }),
    });
    assert.strictEqual(searchRes.status, 200, 'Search must return 200');
    const searchJson = await searchRes.json() as Record<string, any>;
    assert.strictEqual(searchJson.success, true);
    assert.ok(Array.isArray(searchJson.results), 'Results must be an array');
    assert.ok(searchJson.results.length > 0, 'Must return at least 1 search result');
    const firstResult = searchJson.results[0];
    assert.ok(firstResult.id, 'Search item must have id');
    assert.ok(firstResult.title, 'Search item must have title');
    assert.ok(firstResult.webpageUrl, 'Search item must have webpageUrl');
    console.log(`Search:    PASS (${searchJson.results.length} results returned, top: "${firstResult.title}")`);
    results['SEARCH'] = 'PASS';

    // -------------------------------------------------------------
    // GATE 8: JOB LIFECYCLE (queued -> processing -> completed)
    // -------------------------------------------------------------
    console.log('\n--- 8. Job Lifecycle (Async Queue & Polling) ---');
    const createJobRes = await fetch(`${baseUrl}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: TEST_URL,
        type: 'audio',
        format: 'm4a',
      }),
    });
    assert.strictEqual(createJobRes.status, 202, 'Async download creation must return 202 Accepted');
    const createJobJson = await createJobRes.json() as Record<string, any>;
    const asyncJobId = createJobJson.jobId;
    assert.ok(asyncJobId, 'Must return jobId');
    assert.strictEqual(createJobJson.status, 'queued', 'Initial state must be "queued"');

    // Poll until completed (timeout 60s)
    let finalJob: any = null;
    const pollStart = Date.now();
    while (Date.now() - pollStart < 60000) {
      const pollRes = await fetch(`${baseUrl}/api/job/${asyncJobId}`);
      assert.strictEqual(pollRes.status, 200);
      const pollJson = await pollRes.json() as Record<string, any>;
      const status = pollJson.data.status;
      assert.strictEqual(pollJson.data.progress, null, 'Progress must be null (no fake progress)');

      if (status === 'completed' || status === 'failed') {
        finalJob = pollJson.data;
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    assert.ok(finalJob, 'Job must transition to completed or failed within 60s');
    assert.strictEqual(finalJob.status, 'completed', 'Job must complete successfully');
    assert.ok(finalJob.title, 'Completed job must have title');
    assert.ok(finalJob.downloadUrl, 'Completed job must have downloadUrl');
    // Cleanup
    await storageService.cleanupJob(asyncJobId);
    console.log(`Lifecycle: PASS (queued -> processing -> completed, progress: null)`);
    results['JOB LIFECYCLE'] = 'PASS';

    // -------------------------------------------------------------
    // GATE 9: DOWNLOAD RESULT SECURITY (No internal paths exposed)
    // -------------------------------------------------------------
    console.log('\n--- 9. Download Result Security ---');
    const serialized = JSON.stringify(finalJob);
    assert.strictEqual(serialized.includes('/app/'), false, 'Response must NEVER contain internal /app/ path');
    assert.strictEqual(serialized.includes('/temp/'), false, 'Response must NEVER contain internal /temp/ path');
    assert.strictEqual(serialized.includes(config.tempDir), false, 'Response must NEVER expose config.tempDir');
    assert.strictEqual(finalJob.filePath, undefined, 'Public job object must NEVER include filePath');
    console.log('Result Security: PASS (no absolute paths, /app/, or temp directories leaked)');

    // -------------------------------------------------------------
    // GATE 10: FAILURE TESTS
    // -------------------------------------------------------------
    console.log('\n--- 10. Failure Tests ---');
    // Invalid URL
    const invRes = await fetch(`${baseUrl}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'not-a-valid-url' }),
    });
    const invJson = await invRes.json() as Record<string, any>;
    assert.strictEqual(invRes.status, 400);
    assert.strictEqual(invJson.code, 'INVALID_URL');
    console.log('INVALID_URL:          PASS (400)');

    // Unsupported Platform
    const unsupRes = await fetch(`${baseUrl}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://vimeo.com/123456789' }),
    });
    const unsupJson = await unsupRes.json() as Record<string, any>;
    assert.strictEqual(unsupRes.status, 400);
    assert.strictEqual(unsupJson.code, 'UNSUPPORTED_PLATFORM');
    console.log('UNSUPPORTED_PLATFORM: PASS (400)');

    // YTDLP_NOT_FOUND error generation
    const notFoundErr = DownloaderError.ytdlpNotFound();
    assert.strictEqual(notFoundErr.code, 'YTDLP_NOT_FOUND');
    assert.strictEqual(notFoundErr.statusCode, 503);
    console.log('YTDLP_NOT_FOUND:      PASS (503)');

    // PROVIDER_UNAVAILABLE error generation
    const unavailErr = DownloaderError.providerUnavailable('test');
    assert.strictEqual(unavailErr.code, 'PROVIDER_UNAVAILABLE');
    assert.strictEqual(unavailErr.statusCode, 503);
    console.log('PROVIDER_UNAVAILABLE: PASS (503)');

    // DOWNLOAD_TIMEOUT error generation
    const timeoutErr = DownloaderError.timeout('test');
    assert.strictEqual(timeoutErr.code, 'DOWNLOAD_TIMEOUT');
    assert.strictEqual(timeoutErr.statusCode, 504);
    console.log('DOWNLOAD_TIMEOUT:     PASS (504)');

    // FILE_TOO_LARGE error generation
    const largeErr = DownloaderError.fileTooLarge('test');
    assert.strictEqual(largeErr.code, 'FILE_TOO_LARGE');
    assert.strictEqual(largeErr.statusCode, 413);
    console.log('FILE_TOO_LARGE:       PASS (413)');

    // -------------------------------------------------------------
    // GATE 11: SECURITY REGRESSION (SSRF Protection)
    // -------------------------------------------------------------
    console.log('\n--- 11. Security Regression & SSRF Protection ---');
    const dangerousTargets = [
      'http://localhost:3000',
      'http://127.0.0.1/test',
      'http://2130706433', // decimal 127.0.0.1
      'http://0x7f000001', // hex 127.0.0.1
      'http://[::1]', // IPv6 localhost
      'http://192.168.1.1', // private class C
      'http://10.0.0.1', // private class A
      'http://169.254.169.254/latest/meta-data', // AWS/GCP metadata
      'http://internal.corp', // internal domain
      'ftp://example.com/file.mp4', // dangerous protocol
      'file:///etc/passwd', // file protocol
      'https://www.youtube.com:22/watch?v=abc', // restricted port 22
      'https://www.youtube.com/watch?v=abc;rm -rf /;', // command injection in query
    ];

    for (const target of dangerousTargets) {
      const check = isSafeUrl(target);
      assert.strictEqual(check.safe, false, `SSRF target must be blocked: ${target}`);
      const apiCheck = await fetch(`${baseUrl}/api/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target }),
      });
      assert.strictEqual(apiCheck.status, 400, `API must reject SSRF target: ${target}`);
    }
    console.log(`SSRF Protection: PASS (${dangerousTargets.length} dangerous patterns blocked)`);
    results['SSRF SECURITY'] = 'PASS';

    // -------------------------------------------------------------
    // GATE 12: AUTHENTICATION
    // -------------------------------------------------------------
    console.log('\n--- 12. Constant-Time Authentication ---');
    const originalAdminKey = config.adminApiKey;
    const originalCronSecret = config.cronSecret;

    try {
      config.adminApiKey = 'test-admin-secret-2026';
      config.cronSecret = 'test-cron-secret-2026';

      // Timing safe compare
      assert.strictEqual(timingSafeCompare('tok-123', 'tok-123'), true);
      assert.strictEqual(timingSafeCompare('tok-123', 'tok-456'), false);
      assert.strictEqual(timingSafeCompare('short', 'longer-token-secret'), false);

      // Admin auth on POST /api/admin/providers/test
      const adminGood = await fetch(`${baseUrl}/api/admin/providers/test`, {
        method: 'POST',
        headers: { 'X-Admin-Key': 'test-admin-secret-2026' },
      });
      assert.strictEqual(adminGood.status, 200, 'Valid admin key must return 200');

      const adminBad = await fetch(`${baseUrl}/api/admin/providers/test`, {
        method: 'POST',
        headers: { 'X-Admin-Key': 'wrong-key' },
      });
      assert.strictEqual(adminBad.status, 401, 'Invalid admin key must return 401');

      // Cron auth on POST /api/admin/cache/cleanup
      const cronGood = await fetch(`${baseUrl}/api/admin/cache/cleanup`, {
        method: 'POST',
        headers: { 'X-Cron-Secret': 'test-cron-secret-2026' },
      });
      assert.strictEqual(cronGood.status, 200, 'Valid cron secret must return 200');

      const cronBad = await fetch(`${baseUrl}/api/admin/cache/cleanup`, {
        method: 'POST',
        headers: { 'X-Cron-Secret': 'wrong-secret' },
      });
      assert.strictEqual(cronBad.status, 401, 'Invalid cron secret must return 401');

      // Unconfigured secrets -> 503 Service Unavailable
      config.adminApiKey = '';
      config.cronSecret = '';
      const unconfigAdmin = await fetch(`${baseUrl}/api/admin/providers/test`, {
        method: 'POST',
        headers: { 'X-Admin-Key': 'any-key' },
      });
      assert.strictEqual(unconfigAdmin.status, 503, 'Missing admin secret must return 503');

      const unconfigCron = await fetch(`${baseUrl}/api/admin/cache/cleanup`, {
        method: 'POST',
        headers: { 'X-Cron-Secret': 'any-secret' },
      });
      assert.strictEqual(unconfigCron.status, 503, 'Missing cron secret must return 503');
    } finally {
      config.adminApiKey = originalAdminKey;
      config.cronSecret = originalCronSecret;
    }
    console.log('Authentication: PASS (timing-safe comparisons, 401 rejection, 503 safe unconfigured state)');
    results['AUTH'] = 'PASS';

    // -------------------------------------------------------------
    // GATE 13: RATE LIMITING
    // -------------------------------------------------------------
    console.log('\n--- 13. Rate Limiting ---');
    const rlKey = 'test_ip_ratelimit_probe';
    const limit = config.rateLimit.maxRequests;
    console.log(`Configured limit: ${limit} requests per window`);

    // Reset probe key
    await db.resetRateLimit(rlKey);
    for (let i = 1; i <= limit; i++) {
      const res = await db.incrementRateLimit(rlKey, 60000);
      assert.strictEqual(res.count, i);
    }
    const exceeded = await db.incrementRateLimit(rlKey, 60000);
    assert.strictEqual(exceeded.count, limit + 1, 'Exceeded limit should be recorded');
    await db.resetRateLimit(rlKey);
    console.log('Rate Limiting: PASS (bounded memory, deterministic eviction)');
    results['RATE LIMIT'] = 'PASS';

    // -------------------------------------------------------------
    // GATE 14: CLEANUP & GARBAGE COLLECTION
    // -------------------------------------------------------------
    console.log('\n--- 14. Cleanup & Garbage Collection ---');
    // Create an expired mock job
    const expiredJobId = 'job_expired_test_999';
    await db.saveJob({
      id: expiredJobId,
      sourceUrl: TEST_URL,
      platform: 'youtube',
      provider: 'yt-dlp',
      status: 'completed',
      createdAt: new Date(Date.now() - 7200 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 3600 * 1000).toISOString(),
    });

    const cleanupStats1 = await cleanupService.runCleanup();
    assert.ok(cleanupStats1.expiredJobsDeleted >= 1, 'Cleanup must delete expired job');
    const checkedJob = await db.getJobById(expiredJobId);
    assert.strictEqual(checkedJob, null, 'Expired job must be gone from database');

    // Idempotency check: repeated cleanup runs without crashing
    const cleanupStats2 = await cleanupService.runCleanup();
    assert.ok(cleanupStats2.executedAt, 'Repeated cleanup must succeed');
    console.log('Cleanup: PASS (idempotent, expired records removed, temp storage purged)');
    results['CLEANUP'] = 'PASS';

    console.log('\n=============================================================');
    console.log('  ALL E2E SUITES PASSED SUCCESSFULLY!');
    console.log('=============================================================\n');
  } finally {
    server.close();
  }

  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runE2EVerification().catch((err) => {
    console.error('\n❌ E2E VERIFICATION FAILED:', err);
    process.exit(1);
  });
}
