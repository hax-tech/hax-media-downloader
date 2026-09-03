import { cleanupService } from '../src/services/cleanup/cleanup.service.ts';
import { logger } from '../src/utils/logger.ts';

/**
 * Standalone cron execution entry point.
 * Can be triggered via:
 *   tsx cron/cleanup.ts
 * or via external HTTP POST /api/admin/cache/cleanup
 */
export async function executeCronCleanup() {
  try {
    logger.info('[CRON] Initiating scheduled cleanup task...');
    const stats = await cleanupService.runCleanup();
    console.log('\n================ CLEANUP COMPLETED ================');
    console.log(`Executed At:               ${stats.executedAt}`);
    console.log(`Expired Jobs Deleted:      ${stats.expiredJobsDeleted}`);
    console.log(`Stale Cache Entries Purged:${stats.staleCacheEntriesRemoved}`);
    console.log(`Abandoned Jobs Expired:    ${stats.abandonedJobsMarkedExpired}`);
    console.log('====================================================\n');
    return stats;
  } catch (err) {
    logger.error('[CRON] Failed during cleanup execution:', { error: (err as Error).message });
    process.exitCode = 1;
    throw err;
  }
}

// If invoked directly from terminal / cron job runner
if (import.meta.url === `file://${process.argv[1]}`) {
  executeCronCleanup().catch(() => process.exit(1));
}
