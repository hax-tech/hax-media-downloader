import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

export const validateBody = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue.path.join('.') || 'body';
      res.status(400).json({
        success: false,
        error: `Validation Error: ${issue.message} at '${field}'`,
        details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
};

export const InfoRequestSchema = z.object({
  url: z.string().url('A valid URL is required').trim().min(1, 'URL cannot be empty'),
});

export const DownloadRequestSchema = z.object({
  url: z.string().url('A valid URL is required').trim().min(1, 'URL cannot be empty'),
  type: z.enum(['video', 'audio']).optional().default('video'),
  quality: z.string().optional().default('720p'),
  format: z.string().optional(),
});

export const SearchRequestSchema = z.object({
  query: z.string().trim().min(1, 'Search query cannot be empty'),
  platform: z.enum(['youtube', 'instagram', 'tiktok', 'facebook', 'pinterest']).optional(),
});
