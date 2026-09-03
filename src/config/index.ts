import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

export interface AppConfig {
  env: string;
  port: number;
  host: string;
  appName: string;
  appUrl: string;
  author: string;
  adminApiKey: string;
  cronSecret: string;
  apiKeyHeader: string;
  corsOrigin: string;
  tempDir: string;
  maxConcurrentDownloads: number;
  cleanupIntervalMinutes: number;
  runProviderIntegrationTests: boolean;

  rateLimit: {
    maxRequests: number;
    windowMs: number;
    adminMaxRequests: number;
    adminWindowMs: number;
  };

  cache: {
    enabled: boolean;
    ttlSeconds: number;
    jobExpirationSeconds: number;
  };

  providers: {
    priority: string[];
    defaultTimeoutMs: number;
    ytdlp: {
      enabled: boolean;
      binaryPath: string;
      timeoutMs: number;
      maxFileSize: string; // e.g. "100M"
      maxFileSizeBytes: number;
      jsRuntime: string;
      remoteComponents: string;
      ejsSource: string;
    };
    cobalt: {
      enabled: boolean;
      apiUrl: string;
      apiKey?: string;
      timeoutMs: number;
    };
    external: {
      enabled: boolean;
      apiUrl: string;
      apiKey?: string;
      apiHeader: string;
      timeoutMs: number;
    };
  };
}

const parsePriority = (val?: string): string[] => {
  if (!val) return ['ytdlp', 'cobalt', 'external'];
  return val
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
};

const parseSizeToBytes = (sizeStr: string): number => {
  const match = sizeStr.trim().match(/^(\d+(?:\.\d+)?)\s*([kmgtpezy]?b?)$/i);
  if (!match) return 100 * 1024 * 1024; // Default 100MB
  const num = parseFloat(match[1]);
  const unit = match[2].toUpperCase().charAt(0);
  switch (unit) {
    case 'K':
      return Math.round(num * 1024);
    case 'M':
      return Math.round(num * 1024 * 1024);
    case 'G':
      return Math.round(num * 1024 * 1024 * 1024);
    default:
      return Math.round(num);
  }
};

const maxFileSize = process.env.MAX_FILE_SIZE_MB
  ? `${process.env.MAX_FILE_SIZE_MB}M`
  : (process.env.YTDLP_MAX_FILE_SIZE || '100M');

const remoteComponents = (process.env.YTDLP_REMOTE_COMPONENTS || process.env.YTDLP_EJS_SOURCE || 'ejs:github').trim();

export const config: AppConfig = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  appName: process.env.APP_NAME || 'hax-media-downloader',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  author: 'Hamza',
  adminApiKey: (process.env.ADMIN_API_KEY || '').trim(),
  cronSecret: (process.env.CRON_SECRET || '').trim(),
  apiKeyHeader: (process.env.API_KEY_HEADER || 'x-api-key').toLowerCase(),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  tempDir: process.env.TEMP_DIR || path.join(process.cwd(), 'temp'),
  maxConcurrentDownloads: parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '3', 10),
  cleanupIntervalMinutes: parseInt(process.env.CLEANUP_INTERVAL_MINUTES || '15', 10),
  runProviderIntegrationTests: process.env.RUN_PROVIDER_INTEGRATION_TESTS === 'true',

  rateLimit: {
    // Default: 10 requests per window (1 hour)
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || process.env.RATE_LIMIT_MAX || '10', 10),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || process.env.RATE_LIMIT_WINDOW || '3600000', 10), // 1 hour
    adminMaxRequests: parseInt(process.env.ADMIN_RATE_LIMIT_MAX_REQUESTS || '1000', 10),
    adminWindowMs: parseInt(process.env.ADMIN_RATE_LIMIT_WINDOW_MS || '3600000', 10),
  },

  cache: {
    enabled: process.env.CACHE_ENABLED !== 'false',
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || process.env.CACHE_TTL || '1800', 10), // 30 minutes
    jobExpirationSeconds: parseInt(process.env.JOB_EXPIRATION_SECONDS || process.env.JOB_TTL || '3600', 10), // 1 hour
  },

  providers: {
    priority: parsePriority(process.env.PROVIDER_PRIORITY),
    defaultTimeoutMs: parseInt(process.env.PROVIDER_TIMEOUT_MS || '30000', 10),
    ytdlp: {
      enabled: process.env.YTDLP_ENABLED !== 'false',
      binaryPath: process.env.YTDLP_PATH || 'yt-dlp',
      timeoutMs: parseInt(process.env.YTDLP_TIMEOUT_MS || process.env.YTDLP_TIMEOUT || '45000', 10),
      maxFileSize,
      maxFileSizeBytes: parseSizeToBytes(maxFileSize),
      jsRuntime: (process.env.YTDLP_JS_RUNTIME || 'auto').toLowerCase().trim(),
      remoteComponents,
      ejsSource: remoteComponents,
    },
    cobalt: {
      enabled: process.env.COBALT_ENABLED !== 'false',
      apiUrl: (process.env.COBALT_API_URL || '').trim(),
      apiKey: (process.env.COBALT_API_KEY || '').trim(),
      timeoutMs: parseInt(process.env.COBALT_TIMEOUT_MS || '20000', 10),
    },
    external: {
      enabled: process.env.EXTERNAL_API_ENABLED !== 'false',
      apiUrl: (process.env.EXTERNAL_API_URL || '').trim(),
      apiKey: (process.env.EXTERNAL_API_KEY || '').trim(),
      apiHeader: process.env.EXTERNAL_API_HEADER || 'x-api-key',
      timeoutMs: parseInt(process.env.EXTERNAL_TIMEOUT_MS || '20000', 10),
    },
  },
};
