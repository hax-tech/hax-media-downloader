import assert from 'assert';
import { db } from '../src/database/repositories/memory-database.ts';
import { cleanupService } from '../src/services/cleanup/cleanup.service.ts';
import { cacheService } from '../src/services/cache/cache.service.ts';
import { DownloadJob } from '../src/types/index.ts';

export async function runExpirationAndCleanupTests() {
  console.log('--- Testing Job Expiration & Garbage Collection ---');

  // 1. Create an already expired job
  const expiredJobId = 'job_expired_test_1';
  const expiredJob: DownloadJob = {
    id: expiredJobId,
    sourceUrl: 'https://www.youtube.com/watch?v=expired1',
    platform: 'youtube',
    provider: 'yt-dlp',
    status: 'completed',
    createdAt: new Date(Date.now() - 7200 * 1000).toISOString(),
    expiresAt: new Date(Date.now() - 3600 * 1000).toISOString(), // Expired 1 hr ago
  };
  await db.saveJob(expiredJob);

  // 2. Create an active valid job
  const activeJobId = 'job_active_test_2';
  const activeJob: DownloadJob = {
    id: activeJobId,
    sourceUrl: 'https://www.youtube.com/watch?v=active2',
    platform: 'youtube',
    provider: 'yt-dlp',
    status: 'completed',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(), // Expires in 1 hr
  };
  await db.saveJob(activeJob);

  // 3. Set an expired cache entry
  await db.setCache('cache:expired:test', { data: 'old' }, -10); // Negative TTL
  await cacheService.set('cache:active:test', { data: 'fresh' }, 600);

  // 4. Run cleanup service
  const stats = await cleanupService.runCleanup();

  assert.ok(stats.expiredJobsDeleted >= 1, 'Should delete at least 1 expired job');
  assert.ok(stats.staleCacheEntriesRemoved >= 1, 'Should delete at least 1 stale cache entry');

  // 5. Verify expired job is removed while active job remains
  const shouldBeNull = await db.getJobById(expiredJobId);
  assert.strictEqual(shouldBeNull, null, 'Expired job should be deleted from db');

  const shouldExist = await db.getJobById(activeJobId);
  assert.notStrictEqual(shouldExist, null, 'Active job should remain in db');
  assert.strictEqual(shouldExist?.id, activeJobId);

  // 6. Verify cache state
  const activeCache = await cacheService.get('cache:active:test');
  assert.notStrictEqual(activeCache, null, 'Active cache should still be retrievable');

  console.log('✓ Job expiration & cleanup tests passed.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runExpirationAndCleanupTests();
}
