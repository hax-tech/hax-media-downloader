import assert from 'assert';
import { rateLimitService } from '../src/services/rate-limit/rate-limit.service.ts';
import { config } from '../src/config/index.ts';

export async function runRateLimitingTests() {
  console.log('--- Testing Rate Limiting ---');

  const testUser = `test_user_${Date.now()}`;
  await rateLimitService.reset(testUser, false);

  const initialStatus = await rateLimitService.getStatus(testUser, false);
  assert.strictEqual(initialStatus.total, 0);
  assert.strictEqual(initialStatus.remaining, config.rateLimit.maxRequests);

  // Consume up to maxRequests
  for (let i = 1; i <= config.rateLimit.maxRequests; i++) {
    const res = await rateLimitService.checkRateLimit(testUser, false);
    assert.strictEqual(res.allowed, true, `Request ${i} should be permitted`);
    assert.strictEqual(res.total, i);
  }

  // Next request should be blocked
  const blockedRes = await rateLimitService.checkRateLimit(testUser, false);
  assert.strictEqual(blockedRes.allowed, false, 'Request exceeding maxRequests should be rejected');
  assert.strictEqual(blockedRes.remaining, 0);

  // Reset and verify recovery
  await rateLimitService.reset(testUser, false);
  const recovered = await rateLimitService.checkRateLimit(testUser, false);
  assert.strictEqual(recovered.allowed, true, 'Request should be allowed after reset');

  console.log('✓ Rate limiting tests passed.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runRateLimitingTests();
}
