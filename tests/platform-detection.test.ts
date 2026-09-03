import assert from 'assert';
import { detectPlatform } from '../src/utils/platform-detector.ts';

export function runPlatformDetectionTests() {
  console.log('--- Testing Platform Detection ---');

  // YouTube
  assert.strictEqual(detectPlatform('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'youtube');
  assert.strictEqual(detectPlatform('https://youtu.be/dQw4w9WgXcQ'), 'youtube');
  assert.strictEqual(detectPlatform('https://youtube.com/shorts/3fG8j4L8x9A'), 'youtube');
  assert.strictEqual(detectPlatform('https://music.youtube.com/watch?v=abcdef'), 'youtube');

  // Instagram
  assert.strictEqual(detectPlatform('https://www.instagram.com/reel/Cx9823kL/'), 'instagram');
  assert.strictEqual(detectPlatform('https://instagram.com/p/B_8372klm/'), 'instagram');
  assert.strictEqual(detectPlatform('https://instagr.am/reel/abc123/'), 'instagram');

  // TikTok
  assert.strictEqual(detectPlatform('https://www.tiktok.com/@creator/video/7182938472918237182'), 'tiktok');
  assert.strictEqual(detectPlatform('https://vm.tiktok.com/ZM8xPqRsT/'), 'tiktok');
  assert.strictEqual(detectPlatform('https://vt.tiktok.com/ZS8y12345/'), 'tiktok');

  // Facebook
  assert.strictEqual(detectPlatform('https://www.facebook.com/watch/?v=1029384756'), 'facebook');
  assert.strictEqual(detectPlatform('https://facebook.com/user/videos/12345678/'), 'facebook');
  assert.strictEqual(detectPlatform('https://fb.watch/kL9832_abc/'), 'facebook');

  // Pinterest
  assert.strictEqual(detectPlatform('https://www.pinterest.com/pin/1234567890/'), 'pinterest');
  assert.strictEqual(detectPlatform('https://pin.it/7a8b9c0'), 'pinterest');

  // Unsupported or invalid
  assert.strictEqual(detectPlatform('https://example.com/movie.mp4'), null);
  assert.strictEqual(detectPlatform('not-a-url'), null);

  console.log('✓ Platform detection tests passed.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPlatformDetectionTests();
}
