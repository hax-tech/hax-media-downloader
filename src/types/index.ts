export type Platform = 'youtube' | 'instagram' | 'tiktok' | 'facebook' | 'pinterest';

export type MediaType = 'video' | 'audio';

export interface DownloadOptions {
  type?: MediaType;
  quality?: string;
  format?: string;
  timeoutMs?: number;
  [key: string]: unknown;
}

export interface MediaInfo {
  id: string;
  title: string;
  thumbnail?: string;
  duration?: number;
  author?: string;
  platform: Platform;
  availableQualities?: string[];
  availableFormats?: string[];
  url: string;
  originalUrl: string;
}

export interface NormalizedDownloadResult {
  success: boolean;
  platform: Platform;
  provider: string;
  title: string;
  thumbnail?: string;
  duration: number;
  format: string;
  quality: string;
  url: string;
  expiresAt: string;
  jobId: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderHealth {
  provider: string;
  available: boolean;
  latencyMs?: number;
  statusMessage?: string;
  version?: string;
}

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'expired';

export interface DownloadJob {
  id: string;
  userId?: string;
  sourceUrl: string;
  platform: Platform;
  provider: string;
  status: JobStatus;
  title?: string;
  mediaUrl?: string;
  createdAt: string;
  expiresAt: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderStatusRecord {
  name: string;
  isAvailable: boolean;
  lastCheck: string;
  successCount: number;
  failureCount: number;
  avgResponseTimeMs: number;
  lastError?: string;
  supportedPlatforms: Platform[];
}

export interface RateLimitRecord {
  key: string;
  count: number;
  resetAt: number; // timestamp in ms
}

export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  createdAt: string;
  expiresAt: string;
}

export interface CleanupStats {
  expiredJobsDeleted: number;
  staleCacheEntriesRemoved: number;
  abandonedJobsMarkedExpired: number;
  freedMemoryEstimateBytes?: number;
  executedAt: string;
}

export interface SearchResultItem {
  id: string;
  title: string;
  url: string;
  thumbnail?: string;
  duration?: number;
  platform: Platform;
  author?: string;
}
