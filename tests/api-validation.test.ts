import assert from 'assert';
import {
  InfoRequestSchema,
  DownloadRequestSchema,
  SearchRequestSchema,
} from '../src/middleware/validation.middleware.ts';

export function runApiValidationTests() {
  console.log('--- Testing API Schema Validation ---');

  // Info Request Schema
  const validInfo = InfoRequestSchema.safeParse({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.strictEqual(validInfo.success, true);

  const emptyUrl = InfoRequestSchema.safeParse({ url: '' });
  assert.strictEqual(emptyUrl.success, false);

  const nonUrl = InfoRequestSchema.safeParse({ url: 'not-a-valid-url' });
  assert.strictEqual(nonUrl.success, false);

  // Download Request Schema
  const validDownload = DownloadRequestSchema.safeParse({
    url: 'https://www.instagram.com/reel/C8xyz123/',
    type: 'video',
    quality: '720p',
    format: 'mp4',
  });
  assert.strictEqual(validDownload.success, true);
  if (validDownload.success) {
    assert.strictEqual(validDownload.data.type, 'video');
    assert.strictEqual(validDownload.data.quality, '720p');
  }

  // Invalid type (e.g. 'executable')
  const invalidType = DownloadRequestSchema.safeParse({
    url: 'https://www.youtube.com/watch?v=12345',
    type: 'executable',
  });
  assert.strictEqual(invalidType.success, false);

  // Search Request Schema
  const validSearch = SearchRequestSchema.safeParse({ query: 'lofi hip hop', platform: 'youtube' });
  assert.strictEqual(validSearch.success, true);

  const emptySearch = SearchRequestSchema.safeParse({ query: '' });
  assert.strictEqual(emptySearch.success, false);

  console.log('✓ API Schema validation tests passed.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runApiValidationTests();
}
