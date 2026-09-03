import { Router } from 'express';
import { adminController } from '../controllers/admin.controller.ts';
import { adminAuthMiddleware } from '../../middleware/auth.middleware.ts';
import { adminRateLimiter } from '../../middleware/rate-limit.middleware.ts';

const router = Router();

// Apply admin authentication and admin rate limiter across all /api/admin routes
router.use(adminAuthMiddleware);
router.use(adminRateLimiter);

// POST /api/admin/providers/test
router.post('/providers/test', (req, res, next) => adminController.testProviders(req, res, next));

// POST /api/admin/cache/cleanup
router.post('/cache/cleanup', (req, res, next) => adminController.cacheCleanup(req, res, next));

// GET /api/admin/stats
router.get('/stats', (req, res, next) => adminController.getStats(req, res, next));

// GET /api/admin/jobs
router.get('/jobs', (req, res, next) => adminController.getJobs(req, res, next));

export default router;
