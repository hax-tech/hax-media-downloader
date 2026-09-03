import { Router } from 'express';
import { downloaderController } from '../controllers/downloader.controller.ts';
import {
  validateBody,
  InfoRequestSchema,
  DownloadRequestSchema,
  SearchRequestSchema,
} from '../../middleware/validation.middleware.ts';
import { downloadRateLimiter } from '../../middleware/rate-limit.middleware.ts';
import { optionalUserAuthMiddleware } from '../../middleware/auth.middleware.ts';

const router = Router();

// GET /api/health
router.get('/health', (req, res) => downloaderController.getHealth(req, res));

// GET /api/providers
router.get('/providers', (req, res, next) => downloaderController.getProviders(req, res, next));

// POST /api/info
router.post(
  '/info',
  optionalUserAuthMiddleware,
  downloadRateLimiter,
  validateBody(InfoRequestSchema),
  (req, res, next) => downloaderController.getInfo(req, res, next)
);

// POST /api/download
router.post(
  '/download',
  optionalUserAuthMiddleware,
  downloadRateLimiter,
  validateBody(DownloadRequestSchema),
  (req, res, next) => downloaderController.postDownload(req, res, next)
);

// GET /api/job/:id
router.get('/job/:id', (req, res, next) => downloaderController.getJobById(req, res, next));

// GET /api/job/:id/file
router.get('/job/:id/file', (req, res, next) => downloaderController.getJobFile(req, res, next));

// GET /api/media/:token
router.get('/media/:token', (req, res, next) => downloaderController.getMediaFile(req, res, next));

// POST /api/search
router.post(
  '/search',
  optionalUserAuthMiddleware,
  validateBody(SearchRequestSchema),
  (req, res, next) => downloaderController.postSearch(req, res, next)
);

export default router;
