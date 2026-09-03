import { Request, Response, NextFunction } from 'express';
import { providerManager } from '../../services/provider-manager/provider-manager.service.ts';
import { cleanupService } from '../../services/cleanup/cleanup.service.ts';
import { cacheService } from '../../services/cache/cache.service.ts';
import { db } from '../../database/repositories/memory-database.ts';

export class AdminController {
  async testProviders(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const healthList = await providerManager.checkAllHealth();
      const dbStatuses = await db.getAllProviderStatuses();

      res.json({
        success: true,
        testedAt: new Date().toISOString(),
        providers: healthList,
        historicalStats: dbStatuses,
      });
    } catch (err) {
      next(err);
    }
  }

  async cacheCleanup(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await cleanupService.runCleanup();
      res.json({
        success: true,
        message: 'System cache & expired job cleanup completed successfully.',
        stats,
      });
    } catch (err) {
      next(err);
    }
  }

  async getStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cacheStats = await cacheService.getStats();
      const providerStatuses = await db.getAllProviderStatuses();
      const recentJobs = await db.getJobs(100);

      const jobCounts = {
        total: recentJobs.length,
        completed: recentJobs.filter((j) => j.status === 'completed').length,
        failed: recentJobs.filter((j) => j.status === 'failed').length,
        processing: recentJobs.filter((j) => j.status === 'processing').length,
        expired: recentJobs.filter((j) => j.status === 'expired').length,
      };

      res.json({
        success: true,
        uptimeSeconds: Math.floor(process.uptime()),
        cache: cacheStats,
        jobs: jobCounts,
        providers: providerStatuses,
      });
    } catch (err) {
      next(err);
    }
  }

  async getJobs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const jobs = await db.getJobs(limit);
      res.json({
        success: true,
        count: jobs.length,
        jobs,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const adminController = new AdminController();
