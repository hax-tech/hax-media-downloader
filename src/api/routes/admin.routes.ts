import { Router } from 'express';
import { adminController } from '../controllers/admin.controller.ts';
import { adminAuthMiddleware, cronAuthMiddleware } from '../../middleware/auth.middleware.ts';
import { adminRateLimiter } from '../../middleware/rate-limit.middleware.ts';

const router = Router();

// Apply admin rate limiter across all admin routes
router.use(adminRateLimiter);

// POST /api/admin/cache/cleanup - allows valid ADMIN_API_KEY or CRON_SECRET
router.post('/cache/cleanup', cronAuthMiddleware, (req, res, next) =>
  adminController.cacheCleanup(req, res, next)
);

// All subsequent admin routes require strict ADMIN_API_KEY
router.use(adminAuthMiddleware);

// POST /api/admin/providers/test
router.post('/providers/test', (req, res, next) => adminController.testProviders(req, res, next));

// GET /api/admin/stats
router.get('/stats', (req, res, next) => adminController.getStats(req, res, next));

// GET /api/admin/jobs
router.get('/jobs', (req, res, next) => adminController.getJobs(req, res, next));

export default router;
