import assert from 'assert';
import { validateMediaUrl } from '../src/utils/url-validator.ts';
import { isSafeUrl } from '../src/utils/ssrf.ts';

export function runUrlValidationTests() {
  console.log('--- Testing URL Validation & SSRF Protection ---');

  // SSRF Tests
  assert.strictEqual(isSafeUrl('http://localhost:3000').safe, false, 'Localhost should be blocked');
  assert.strictEqual(isSafeUrl('http://127.0.0.1/test').safe, false, '127.0.0.1 should be blocked');
  assert.strictEqual(isSafeUrl('http://169.254.169.254/latest/meta-data').safe, false, 'Cloud metadata IP should be blocked');
  assert.strictEqual(isSafeUrl('http://192.168.1.1').safe, false, 'Private class C should be blocked');
  assert.strictEqual(isSafeUrl('http://10.0.0.1').safe, false, 'Private class A should be blocked');
  assert.strictEqual(isSafeUrl('ftp://example.com').safe, false, 'FTP protocol should be blocked');
  assert.strictEqual(isSafeUrl('file:///etc/passwd').safe, false, 'File protocol should be blocked');

  // Safe external URLs
  assert.strictEqual(isSafeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ').safe, true, 'Valid YouTube URL should be safe');
  assert.strictEqual(isSafeUrl('https://instagram.com/reel/C8xyz123/').safe, true, 'Valid Instagram URL should be safe');

  // Media URL Validation
  const validYt = validateMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.strictEqual(validYt.isValid, true, 'YouTube URL should be valid');
  assert.strictEqual(validYt.platform, 'youtube', 'Should detect youtube platform');

  const invalidDomain = validateMediaUrl('https://malicious-site.com/video.mp4');
  assert.strictEqual(invalidDomain.isValid, false, 'Unsupported domain should be rejected');
  assert.ok(invalidDomain.error?.includes('Unsupported platform'), 'Should return unsupported platform error');

  const invalidSsrf = validateMediaUrl('http://127.0.0.1:8080/exploit');
  assert.strictEqual(invalidSsrf.isValid, false, 'SSRF attack should be rejected');

  console.log('✓ URL Validation & SSRF tests passed.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runUrlValidationTests();
}
