import assert from 'assert';
import fs from 'fs';
import { YtDlpBinaryManager } from '../src/providers/ytdlp/ytdlp.binary.ts';
import { YtDlpProvider } from '../src/providers/ytdlp/ytdlp.provider.ts';
import { storageService } from '../src/services/storage/storage.service.ts';
import { config } from '../src/config/index.ts';

/**
 * Real provider integration test suite.
 * Environment-controlled via RUN_PROVIDER_INTEGRATION_TESTS=true.
 * When disabled, normal CI does NOT touch external websites.
 */
export async function runProviderIntegrationTests() {
  console.log('--- Testing Provider Integration (Real Environment) ---');

  const isEnabled = process.env.RUN_PROVIDER_INTEGRATION_TESTS === 'true' || config.runProviderIntegrationTests;

  if (!isEnabled) {
    console.log('[SKIPPED] Provider integration tests disabled.');
    console.log('Set RUN_PROVIDER_INTEGRATION_TESTS=true to execute real external network & binary tests.');
    return;
  }

  console.log('1. Detecting yt-dlp binary...');
  const ytBinary = await YtDlpBinaryManager.resolveBinary();
  assert.ok(ytBinary.available, 'yt-dlp binary must be available in environment');
  assert.ok(ytBinary.version && ytBinary.version !== 'unknown', 'yt-dlp version must be resolved');
  console.log(`✓ yt-dlp detected at: ${ytBinary.path} (version: ${ytBinary.version})`);

  console.log('2. Detecting FFmpeg...');
  const ffmpegInfo = await YtDlpBinaryManager.checkFfmpeg();
  assert.ok(ffmpegInfo.available, 'FFmpeg must be installed and executable');
  console.log(`✓ FFmpeg detected (version: ${ffmpegInfo.version || 'installed'})`);

  console.log('3. Detecting supported JavaScript runtime (Deno 2.x or Node 22+)...');
  const jsRuntime = await YtDlpBinaryManager.resolveJsRuntime();
  assert.ok(jsRuntime.available, 'A supported JavaScript runtime must be available on host');
  assert.ok(jsRuntime.isSupported, `JS runtime ${jsRuntime.name} must be supported (Node 20 is rejected)`);
  console.log(`✓ JS Runtime detected: ${jsRuntime.name} (version: ${jsRuntime.version})`);

  const provider = new YtDlpProvider();
  const health = await provider.healthCheck();
  assert.strictEqual(health.available, true, `yt-dlp provider health check must pass: ${health.statusMessage}`);
  console.log(`✓ Provider health check passed: ${health.statusMessage}`);

  // Small public test URL (Creative Commons / public domain media or standard YouTube video)
  const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

  console.log('4. Testing real metadata extraction...');
  const info = await provider.getInfo(testUrl, { timeoutMs: 30000 });
  assert.ok(info.title, 'Extracted media info must have title');
  assert.ok(info.duration && info.duration > 0, 'Extracted media info must have duration');
  assert.ok(Array.isArray(info.formats) && info.formats.length > 0, 'Extracted info must contain formats array');
  console.log(`✓ Metadata extraction succeeded: "${info.title}" (${info.duration}s, ${info.formats.length} formats)`);

  console.log('5. Testing small real media download and file validation...');
  const testJobId = `integ_${Date.now()}`;
  const downloadResult = await provider.download(testUrl, {
    jobId: testJobId,
    type: 'audio',
    format: 'm4a',
    timeoutMs: 45000,
  });

  assert.strictEqual(downloadResult.success, true, 'Download operation must succeed');
  assert.ok(downloadResult.size && downloadResult.size > 0, 'Downloaded media file size must be > 0');
  assert.ok(downloadResult.filePath, 'Downloaded result must include filePath');
  assert.ok(fs.existsSync(downloadResult.filePath), 'Downloaded file must exist on disk');

  // Verify file directly using storage service validation
  const validation = await storageService.validateDownloadedFile(downloadResult.filePath, 'm4a');
  assert.strictEqual(validation.isValid, true, `Downloaded file must pass validation: ${validation.error}`);
  assert.strictEqual(validation.extension, 'm4a', 'Downloaded file extension must be m4a');
  assert.strictEqual(validation.mimeType, 'audio/mp4', 'MIME type must be audio/mp4');
  console.log(`✓ Real download verified: ${validation.size} bytes, ${validation.mimeType}`);

  console.log('6. Cleaning up integration test artifacts...');
  await storageService.cleanupJob(testJobId);
  assert.strictEqual(fs.existsSync(downloadResult.filePath), false, 'Test file must be cleaned up');
  console.log('✓ Cleanup verified: test artifacts removed.');

  console.log('✓ Real provider integration tests completed successfully.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runProviderIntegrationTests().catch((err) => {
    console.error('Integration test failed:', err);
    process.exit(1);
  });
}
