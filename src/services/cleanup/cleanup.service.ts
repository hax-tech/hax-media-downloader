import { db } from '../../database/repositories/memory-database.ts';
import { storageService } from '../storage/storage.service.ts';
import { CleanupStats } from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';

export class CleanupService {
  /**
   * Executes complete database, cache & temporary storage garbage collection.
   */
  async runCleanup(): Promise<CleanupStats> {
    const executedAt = new Date().toISOString();
    logger.info('Starting system cleanup & garbage collection cycle...');

    // 1. Mark abandoned jobs (pending/processing older than 15 minutes) as expired
    const abandonedCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const abandonedMarked = await db.markAbandonedJobs(abandonedCutoff);

    // 2. Find and delete expired jobs
    const expiredJobsDeleted = await db.deleteExpiredJobs(executedAt);

    // 3. Remove stale cache entries
    const staleCacheEntriesRemoved = await db.deleteExpiredCache(executedAt);

    // 4. Clean expired rate limits
    await db.cleanExpiredRateLimits(Date.now());

    // 5. Purge expired files from temporary storage
    const filesPurged = await storageService.purgeExpiredFiles();

    const stats: CleanupStats = {
      expiredJobsDeleted,
      staleCacheEntriesRemoved,
      abandonedJobsMarkedExpired: abandonedMarked,
      executedAt,
    };

    logger.info('System cleanup complete', { stats, filesPurged });
    return stats;
  }
}

export const cleanupService = new CleanupService();
