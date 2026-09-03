import { IDatabase } from './database.interface.ts';
import {
  DownloadJob,
  JobStatus,
  CacheEntry,
  RateLimitRecord,
  ProviderStatusRecord,
} from '../models/index.ts';

export class MemoryDatabase implements IDatabase {
  private jobs: Map<string, DownloadJob> = new Map();
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private rateLimits: Map<string, RateLimitRecord> = new Map();
  private providerStatuses: Map<string, ProviderStatusRecord> = new Map();

  // Jobs
  async saveJob(job: DownloadJob): Promise<DownloadJob> {
    this.jobs.set(job.id, { ...job });
    return job;
  }

  async getJobById(id: string): Promise<DownloadJob | null> {
    const job = this.jobs.get(id);
    if (!job) return null;
    return { ...job };
  }

  async getJobs(limit = 50): Promise<DownloadJob[]> {
    const all = Array.from(this.jobs.values());
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return all.slice(0, limit);
  }

  async updateJobStatus(
    id: string,
    status: JobStatus,
    updates: Partial<DownloadJob> = {}
  ): Promise<DownloadJob | null> {
    const existing = this.jobs.get(id);
    if (!existing) return null;

    const updated: DownloadJob = {
      ...existing,
      ...updates,
      status,
    };
    this.jobs.set(id, updated);
    return { ...updated };
  }

  async deleteJob(id: string): Promise<boolean> {
    return this.jobs.delete(id);
  }

  async deleteExpiredJobs(beforeIso: string): Promise<number> {
    const cutoff = new Date(beforeIso).getTime();
    let deletedCount = 0;

    for (const [id, job] of this.jobs.entries()) {
      const jobExpiresAt = new Date(job.expiresAt).getTime();
      if (jobExpiresAt <= cutoff) {
        this.jobs.delete(id);
        deletedCount++;
      }
    }
    return deletedCount;
  }

  async markAbandonedJobs(beforeIso: string): Promise<number> {
    const cutoff = new Date(beforeIso).getTime();
    let updatedCount = 0;

    for (const [id, job] of this.jobs.entries()) {
      if ((job.status === 'processing' || job.status === 'queued') && new Date(job.createdAt).getTime() <= cutoff) {
        job.status = 'expired';
        job.error = job.error || 'Job marked expired due to timeout/inactivity';
        this.jobs.set(id, job);
        updatedCount++;
      }
    }
    return updatedCount;
  }

  // Cache
  async getCache<T>(key: string): Promise<CacheEntry<T> | null> {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;

    // Check expiration
    if (new Date(entry.expiresAt).getTime() <= Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return { ...entry };
  }

  async setCache<T>(key: string, value: T, ttlSeconds: number): Promise<CacheEntry<T>> {
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const entry: CacheEntry<T> = {
      key,
      value,
      createdAt,
      expiresAt,
    };
    this.cache.set(key, entry as CacheEntry<unknown>);
    return entry;
  }

  async deleteCache(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }

  async deleteExpiredCache(beforeIso: string): Promise<number> {
    const cutoff = new Date(beforeIso).getTime();
    let deleted = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (new Date(entry.expiresAt).getTime() <= cutoff) {
        this.cache.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  async getCacheStats(): Promise<{ count: number; activeCount: number }> {
    const now = Date.now();
    let active = 0;
    for (const entry of this.cache.values()) {
      if (new Date(entry.expiresAt).getTime() > now) {
        active++;
      }
    }
    return {
      count: this.cache.size,
      activeCount: active,
    };
  }

  // Rate Limiting
  async getRateLimit(key: string): Promise<RateLimitRecord | null> {
    const record = this.rateLimits.get(key);
    if (!record) return null;

    if (Date.now() > record.resetAt) {
      this.rateLimits.delete(key);
      return null;
    }

    return { ...record };
  }

  async incrementRateLimit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const now = Date.now();
    const existing = this.rateLimits.get(key);

    if (!existing || now > existing.resetAt) {
      const newRecord: RateLimitRecord = {
        key,
        count: 1,
        resetAt: now + windowMs,
      };
      this.rateLimits.set(key, newRecord);
      return { count: 1, resetAt: newRecord.resetAt };
    }

    existing.count += 1;
    this.rateLimits.set(key, existing);
    return { count: existing.count, resetAt: existing.resetAt };
  }

  async resetRateLimit(key: string): Promise<void> {
    this.rateLimits.delete(key);
  }

  async cleanExpiredRateLimits(nowMs: number): Promise<number> {
    let cleaned = 0;
    for (const [key, record] of this.rateLimits.entries()) {
      if (nowMs > record.resetAt) {
        this.rateLimits.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }

  // Provider Status
  async getProviderStatus(name: string): Promise<ProviderStatusRecord | null> {
    const status = this.providerStatuses.get(name);
    return status ? { ...status } : null;
  }

  async getAllProviderStatuses(): Promise<ProviderStatusRecord[]> {
    return Array.from(this.providerStatuses.values()).map((s) => ({ ...s }));
  }

  async updateProviderStatus(
    name: string,
    updates: Partial<ProviderStatusRecord>
  ): Promise<ProviderStatusRecord> {
    const existing = this.providerStatuses.get(name) || {
      name,
      isAvailable: false,
      lastCheck: new Date().toISOString(),
      successCount: 0,
      failureCount: 0,
      avgResponseTimeMs: 0,
      supportedPlatforms: [],
    };

    const updated: ProviderStatusRecord = {
      ...existing,
      ...updates,
      lastCheck: new Date().toISOString(),
    };

    this.providerStatuses.set(name, updated);
    return { ...updated };
  }

  async recordProviderCall(
    name: string,
    success: boolean,
    durationMs: number,
    error?: string
  ): Promise<void> {
    const existing = this.providerStatuses.get(name) || {
      name,
      isAvailable: true,
      lastCheck: new Date().toISOString(),
      successCount: 0,
      failureCount: 0,
      avgResponseTimeMs: 0,
      supportedPlatforms: [],
    };

    if (success) {
      existing.successCount += 1;
      const totalCalls = existing.successCount + existing.failureCount;
      existing.avgResponseTimeMs = Math.round(
        (existing.avgResponseTimeMs * (totalCalls - 1) + durationMs) / totalCalls
      );
    } else {
      existing.failureCount += 1;
      existing.lastError = error;
    }

    existing.lastCheck = new Date().toISOString();
    this.providerStatuses.set(name, existing);
  }
}

export const db: IDatabase = new MemoryDatabase();
