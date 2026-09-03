export type {
  Platform,
  JobStatus,
  DownloadJob,
  ProviderStatusRecord,
  RateLimitRecord,
  CacheEntry,
  CleanupStats,
} from '../../types/index.ts';

export interface User {
  id: string;
  apiKey: string;
  role: 'user' | 'admin';
  createdAt: string;
}
