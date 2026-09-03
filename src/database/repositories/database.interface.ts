import {
  DownloadJob,
  JobStatus,
  CacheEntry,
  RateLimitRecord,
  ProviderStatusRecord,
} from '../models/index.ts';

export interface IDatabase {
  // Download Jobs
  saveJob(job: DownloadJob): Promise<DownloadJob>;
  getJobById(id: string): Promise<DownloadJob | null>;
  getJobs(limit?: number): Promise<DownloadJob[]>;
  updateJobStatus(id: string, status: JobStatus, updates?: Partial<DownloadJob>): Promise<DownloadJob | null>;
  deleteJob(id: string): Promise<boolean>;
  deleteExpiredJobs(beforeIso: string): Promise<number>;
  markAbandonedJobs(beforeIso: string): Promise<number>;

  // Cache
  getCache<T>(key: string): Promise<CacheEntry<T> | null>;
  setCache<T>(key: string, value: T, ttlSeconds: number): Promise<CacheEntry<T>>;
  deleteCache(key: string): Promise<boolean>;
  deleteExpiredCache(beforeIso: string): Promise<number>;
  getCacheStats(): Promise<{ count: number; activeCount: number }>;

  // Rate Limiting
  getRateLimit(key: string): Promise<RateLimitRecord | null>;
  incrementRateLimit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
  resetRateLimit(key: string): Promise<void>;
  cleanExpiredRateLimits(nowMs: number): Promise<number>;

  // Provider Status
  getProviderStatus(name: string): Promise<ProviderStatusRecord | null>;
  getAllProviderStatuses(): Promise<ProviderStatusRecord[]>;
  updateProviderStatus(name: string, updates: Partial<ProviderStatusRecord>): Promise<ProviderStatusRecord>;
  recordProviderCall(name: string, success: boolean, durationMs: number, error?: string): Promise<void>;
}
