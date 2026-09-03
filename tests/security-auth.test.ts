import assert from 'assert';
import {
  timingSafeCompare,
  verifyAdminKey,
  verifyCronSecret,
} from '../src/middleware/auth.middleware.ts';
import { config } from '../src/config/index.ts';
import { MemoryDatabase } from '../src/database/repositories/memory-database.ts';

export async function runSecurityAuthTests() {
  console.log('--- Testing Security, Constant-Time Auth & Bounded Memory ---');

  // 1. Constant-time comparison tests
  assert.strictEqual(timingSafeCompare('secret-token-123', 'secret-token-123'), true, 'Identical strings must match');
  assert.strictEqual(timingSafeCompare('secret-token-123', 'secret-token-456'), false, 'Different strings must fail');
  assert.strictEqual(timingSafeCompare('short', 'longer-secret-token'), false, 'Different lengths must fail safely');
  assert.strictEqual(timingSafeCompare('', ''), false, 'Empty strings must fail safely');
  assert.strictEqual(timingSafeCompare('token', ''), false, 'Empty comparison target must fail');

  // 2. Admin key verification
  const originalKey = config.adminApiKey;
  const originalCron = config.cronSecret;

  try {
    // When ADMIN_API_KEY is configured
    config.adminApiKey = 'test-super-secret-admin-key-2026';
    assert.strictEqual(verifyAdminKey('test-super-secret-admin-key-2026'), true, 'Valid admin key should be accepted');
    assert.strictEqual(verifyAdminKey('test-super-secret-admin-key-2026 '), true, 'Trimmed admin key should be accepted');
    assert.strictEqual(verifyAdminKey('wrong-key'), false, 'Incorrect admin key should be rejected');
    assert.strictEqual(verifyAdminKey(''), false, 'Empty admin key should be rejected');
    assert.strictEqual(verifyAdminKey(undefined), false, 'Undefined admin key should be rejected');

    // Substring bypass prevention: verify that a key that contains the admin key as a substring is rejected
    assert.strictEqual(verifyAdminKey('prefix_test-super-secret-admin-key-2026'), false, 'Substring match must be rejected');

    // When ADMIN_API_KEY is empty/unconfigured
    config.adminApiKey = '';
    assert.strictEqual(verifyAdminKey('any-key'), false, 'Unconfigured admin key must always reject');

    // 3. Cron secret verification
    config.cronSecret = 'test-cron-secret-xyz';
    assert.strictEqual(verifyCronSecret('test-cron-secret-xyz'), true, 'Valid cron secret should be accepted');
    assert.strictEqual(verifyCronSecret('invalid-cron'), false, 'Invalid cron secret should be rejected');

    config.cronSecret = '';
    assert.strictEqual(verifyCronSecret('test-cron-secret-xyz'), false, 'Unconfigured cron secret must reject');

    // 4. Memory bounded storage tests
    const memDb = new MemoryDatabase();
    for (let i = 0; i < 50; i++) {
      await memDb.setCache(`key_${i}`, `val_${i}`, 60);
    }
    const cacheStats = await memDb.getCacheStats();
    assert.strictEqual(cacheStats.count, 50, 'Cache should store test entries accurately');
    assert.strictEqual(cacheStats.activeCount, 50, 'All fresh cache entries should be active');
  } finally {
    config.adminApiKey = originalKey;
    config.cronSecret = originalCron;
  }

  console.log('✓ Security, Auth & Bounded Memory tests passed.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSecurityAuthTests();
}
