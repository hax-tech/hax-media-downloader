import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  buildYtDlpFormatSelector,
  parseYtDlpJson,
  YtDlpProvider,
} from '../src/providers/ytdlp/ytdlp.provider.ts';
import { storageService } from '../src/services/storage/storage.service.ts';
import { DownloaderError } from '../src/utils/errors.ts';
import { downloadService } from '../src/services/download/download.service.ts';
import { db } from '../src/database/repositories/memory-database.ts';

export async function runYtDlpProviderTests() {
  console.log('--- Testing yt-dlp Provider & Components ---');

  // 1. Test Command Construction / Format Selector
  console.log('1. Testing format selector generation...');
  const f720 = buildYtDlpFormatSelector({ type: 'video', quality: '720p', format: 'mp4' }, true);
  assert.ok(f720.selector.includes('height<=720'), 'Should constrain height to 720');
  assert.ok(f720.extraArgs.includes('--merge-output-format'), 'Should merge output to MP4');

  const f1080 = buildYtDlpFormatSelector({ type: 'video', quality: '1080p' }, true);
  assert.ok(f1080.selector.includes('height<=1080'), 'Should constrain height to 1080');

  const f360 = buildYtDlpFormatSelector({ type: 'video', quality: '360p' }, true);
  assert.ok(f360.selector.includes('height<=360'), 'Should constrain height to 360');

  const fBest = buildYtDlpFormatSelector({ type: 'video', quality: 'best' }, true);
  assert.ok(fBest.selector.includes('bestvideo'), 'Best quality should select bestvideo');

  const fAudioMp3 = buildYtDlpFormatSelector({ type: 'audio', format: 'mp3' }, true);
  assert.ok(fAudioMp3.extraArgs.includes('mp3'), 'Audio MP3 should pass --audio-format mp3');

  const fAudioM4a = buildYtDlpFormatSelector({ type: 'audio', format: 'm4a' }, true);
  assert.ok(fAudioM4a.selector.includes('bestaudio[ext=m4a]'), 'Audio M4A should request bestaudio[ext=m4a]');

  // 2. Test JSON Output Parsing (Preamble stripping & error handling)
  console.log('2. Testing yt-dlp JSON parsing with warnings/preambles...');
  const cleanJson = '{"id":"abc1234","title":"Test Video","duration":120}';
  const parsedClean = parseYtDlpJson(cleanJson);
  assert.strictEqual(parsedClean.id, 'abc1234');
  assert.strictEqual(parsedClean.title, 'Test Video');

  const noisyJson = `
WARNING: [youtube] JavaScript runtime node is deprecated.
[youtube] Extracting URL: https://www.youtube.com/watch?v=abc1234
{"id":"abc1234","title":"Noisy Preamble Video","duration":45}
`;
  const parsedNoisy = parseYtDlpJson(noisyJson);
  assert.strictEqual(parsedNoisy.id, 'abc1234');
  assert.strictEqual(parsedNoisy.title, 'Noisy Preamble Video');

  assert.throws(
    () => parseYtDlpJson('ERROR: Unable to extract video data'),
    /unparseable or non-JSON output/,
    'Should throw DownloaderError on invalid non-JSON output'
  );

  // 3. Test Error Classification
  console.log('3. Testing error classification...');
  const notFoundErr = DownloaderError.ytdlpNotFound();
  assert.strictEqual(notFoundErr.code, 'YTDLP_NOT_FOUND');
  assert.strictEqual(notFoundErr.statusCode, 503);

  const timeoutErr = DownloaderError.timeout();
  assert.strictEqual(timeoutErr.code, 'DOWNLOAD_TIMEOUT');
  assert.strictEqual(timeoutErr.statusCode, 504);

  const invalidMediaErr = DownloaderError.invalidMedia();
  assert.strictEqual(invalidMediaErr.code, 'INVALID_MEDIA');
  assert.strictEqual(invalidMediaErr.statusCode, 502);

  const sizeErr = DownloaderError.fileTooLarge();
  assert.strictEqual(sizeErr.code, 'FILE_TOO_LARGE');
  assert.strictEqual(sizeErr.statusCode, 413);

  // 4. Test File Validation & Storage Safeguards
  console.log('4. Testing file validation safeguards...');
  const tempDir = storageService.getTempDir();
  const testJobId = 'job_test_val_1';
  const testFilePath = path.join(tempDir, `${testJobId}_sample.mp4`);

  // Empty file rejection
  await fs.promises.writeFile(testFilePath, Buffer.alloc(0));
  const emptyValidation = await storageService.validateDownloadedFile(testFilePath);
  assert.strictEqual(emptyValidation.isValid, false);
  assert.ok(emptyValidation.error?.includes('empty'), 'Should reject 0-byte files');

  // Valid MP4 mock header (with ftyp box)
  const validMp4Header = Buffer.alloc(64);
  validMp4Header.writeUInt32BE(32, 0); // box size
  validMp4Header.write('ftyp', 4, 4, 'utf8'); // ftyp box
  validMp4Header.write('isom', 8, 4, 'utf8'); // major brand
  await fs.promises.writeFile(testFilePath, validMp4Header);

  const validValidation = await storageService.validateDownloadedFile(testFilePath);
  assert.strictEqual(validValidation.isValid, true, 'Valid MP4 header should pass');
  assert.strictEqual(validValidation.mimeType, 'video/mp4');
  assert.strictEqual(validValidation.extension, 'mp4');

  // Cleanup test file
  await storageService.deleteFileSafely(testFilePath);

  // Disallowed extension test
  const disallowedFilePath = path.join(tempDir, `${testJobId}_script.sh`);
  await fs.promises.writeFile(disallowedFilePath, Buffer.from('#!/bin/bash\necho "bad"'));
  const disallowedValidation = await storageService.validateDownloadedFile(disallowedFilePath);
  assert.strictEqual(disallowedValidation.isValid, false);
  assert.ok(disallowedValidation.error?.includes('Disallowed media extension'), 'Should reject disallowed extension');

  // 5. Test Job State Transitions & Per-Job Isolation
  console.log('5. Testing job state transitions & storage isolation...');
  const stateJobId = 'job_state_test_001';
  const jobDir = storageService.createJobDirectory(stateJobId);
  assert.ok(fs.existsSync(jobDir), 'Job directory must be created');

  await db.saveJob({
    id: stateJobId,
    sourceUrl: 'https://www.youtube.com/watch?v=mock_video_123',
    platform: 'youtube',
    provider: 'yt-dlp',
    status: 'queued',
    progress: null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
  });

  const queuedJob = await db.getJobById(stateJobId);
  assert.strictEqual(queuedJob?.status, 'queued');
  assert.strictEqual(queuedJob?.progress, null);

  await db.updateJobStatus(stateJobId, 'processing');
  const processingJob = await db.getJobById(stateJobId);
  assert.strictEqual(processingJob?.status, 'processing');

  await db.updateJobStatus(stateJobId, 'completed');
  const completedJob = await db.getJobById(stateJobId);
  assert.strictEqual(completedJob?.status, 'completed');

  await storageService.cleanupJob(stateJobId);
  assert.strictEqual(fs.existsSync(jobDir), false, 'Job directory should be deleted on cleanup');

  // 6. Real Integration Test (enabled via RUN_PROVIDER_INTEGRATION_TESTS=true)
  if (process.env.RUN_PROVIDER_INTEGRATION_TESTS === 'true') {
    console.log('6. Running live provider integration test (RUN_PROVIDER_INTEGRATION_TESTS=true)...');
    const { YtDlpBinaryManager } = await import('../src/providers/ytdlp/ytdlp.binary.ts');
    
    // 6a. Binary detection
    const binary = await YtDlpBinaryManager.resolveBinary();
    console.log(`yt-dlp binary available: ${binary.available} (path: ${binary.path}, version: ${binary.version})`);
    assert.ok(binary.available, 'yt-dlp binary must be available for integration test');

    // 6b. FFmpeg detection
    const hasFfmpeg = await YtDlpBinaryManager.checkFfmpeg();
    console.log(`FFmpeg available: ${hasFfmpeg}`);

    // 6c. JS runtime detection
    const jsRuntime = await YtDlpBinaryManager.resolveJsRuntime();
    console.log(`JS runtime: ${jsRuntime.name} (available: ${jsRuntime.available}, version: ${jsRuntime.version || 'none'})`);

    // 6d. Health check
    const provider = new YtDlpProvider();
    const health = await provider.healthCheck();
    console.log(`Health check: ${health.statusMessage}`);
    assert.strictEqual(health.available, true, 'Provider must report available in integration test');

    // 6e. Metadata extraction against small public test URL
    const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    console.log(`Extracting metadata for: ${testUrl}`);
    const mediaInfo = await provider.getInfo(testUrl);
    assert.ok(mediaInfo.title, 'Media info must contain title');
    assert.strictEqual(mediaInfo.platform, 'youtube');
    console.log(`Extracted metadata successfully: "${mediaInfo.title}" (${mediaInfo.duration}s)`);

    // 6f. Real small download test
    console.log('Testing live download & validation...');
    const liveJobId = `int_test_${Date.now()}`;
    const downloadRes = await provider.download(testUrl, {
      type: 'audio',
      format: 'm4a',
      quality: '360p',
      jobId: liveJobId,
    });

    assert.strictEqual(downloadRes.success, true, 'Download must succeed');
    assert.ok(downloadRes.size > 0, 'Downloaded file size must be > 0');
    assert.ok(downloadRes.filePath, 'Downloaded file path must be defined');
    assert.ok(fs.existsSync(downloadRes.filePath), 'Downloaded file must exist on disk');

    const fileValidation = await storageService.validateDownloadedFile(downloadRes.filePath);
    assert.strictEqual(fileValidation.isValid, true, 'Downloaded file must pass validation');

    // 6g. Cleanup live test files
    await storageService.cleanupJob(liveJobId);
    console.log('Cleaned up integration test files successfully.');
  } else {
    console.log('6. Real provider integration tests skipped (set RUN_PROVIDER_INTEGRATION_TESTS=true to run live network test).');
  }

  console.log('✓ All yt-dlp provider tests passed.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runYtDlpProviderTests();
}
