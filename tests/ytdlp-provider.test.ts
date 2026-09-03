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
  const f720 = buildYtDlpFormatSelector({ type: 'video', quality: '720p', format: 'mp4' });
  assert.ok(f720.selector.includes('height<=720'), 'Should constrain height to 720');
  assert.ok(f720.extraArgs.includes('--merge-output-format'), 'Should merge output to MP4');

  const f1080 = buildYtDlpFormatSelector({ type: 'video', quality: '1080p' });
  assert.ok(f1080.selector.includes('height<=1080'), 'Should constrain height to 1080');

  const f360 = buildYtDlpFormatSelector({ type: 'video', quality: '360p' });
  assert.ok(f360.selector.includes('height<=360'), 'Should constrain height to 360');

  const fBest = buildYtDlpFormatSelector({ type: 'video', quality: 'best' });
  assert.ok(fBest.selector.includes('bestvideo[ext=mp4]'), 'Best quality should prefer bestvideo[ext=mp4]');

  const fAudioMp3 = buildYtDlpFormatSelector({ type: 'audio', format: 'mp3' });
  assert.ok(fAudioMp3.extraArgs.includes('mp3'), 'Audio MP3 should pass --audio-format mp3');

  const fAudioM4a = buildYtDlpFormatSelector({ type: 'audio', format: 'm4a' });
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

  // 5. Test Job State Transitions
  console.log('5. Testing job state transitions...');
  const dummyUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const createdJob = await downloadService.createDownloadJob(dummyUrl, { quality: '720p' });
  assert.ok(createdJob.id.startsWith('job_'), 'Job ID should be generated');
  assert.ok(['queued', 'processing', 'completed'].includes(createdJob.status), 'Initial status should be queued or processing');

  const fetchedJob = await downloadService.getJob(createdJob.id);
  assert.ok(fetchedJob, 'Job should be retrievable from database');

  // 6. Optional Real Integration Test (enabled via RUN_PROVIDER_INTEGRATION_TESTS=true)
  if (process.env.RUN_PROVIDER_INTEGRATION_TESTS === 'true') {
    console.log('6. Running real yt-dlp integration test...');
    const provider = new YtDlpProvider();
    const health = await provider.healthCheck();
    console.log(`yt-dlp health: ${health.statusMessage}`);

    if (health.available) {
      const searchResults = await provider.search('never gonna give you up', 'youtube');
      assert.ok(Array.isArray(searchResults), 'Search should return an array');
      console.log(`yt-dlp search returned ${searchResults.length} entries`);
      if (searchResults.length > 0) {
        assert.ok(searchResults[0].title, 'First search result should have title');
        assert.ok(searchResults[0].url, 'First search result should have URL');
      }
    }
  }

  console.log('✓ All yt-dlp provider tests passed.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runYtDlpProviderTests();
}
