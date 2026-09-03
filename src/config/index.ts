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
  apiKeyHeader: string;
  corsOrigin: string;

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

export const config: AppConfig = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  appName: process.env.APP_NAME || 'hax-media-downloader',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  author: 'Hamza',
  adminApiKey: process.env.ADMIN_API_KEY || 'hax-admin-super-secret-key-change-in-prod',
  apiKeyHeader: (process.env.API_KEY_HEADER || 'x-api-key').toLowerCase(),
  corsOrigin: process.env.CORS_ORIGIN || '*',

  rateLimit: {
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10', 10),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '3600000', 10), // 1 hour
    adminMaxRequests: parseInt(process.env.ADMIN_RATE_LIMIT_MAX_REQUESTS || '1000', 10),
    adminWindowMs: parseInt(process.env.ADMIN_RATE_LIMIT_WINDOW_MS || '3600000', 10),
  },

  cache: {
    enabled: process.env.CACHE_ENABLED !== 'false',
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '1800', 10), // 30 minutes
    jobExpirationSeconds: parseInt(process.env.JOB_EXPIRATION_SECONDS || '3600', 10), // 1 hour
  },

  providers: {
    priority: parsePriority(process.env.PROVIDER_PRIORITY),
    defaultTimeoutMs: parseInt(process.env.PROVIDER_TIMEOUT_MS || '15000', 10),
    ytdlp: {
      enabled: process.env.YTDLP_ENABLED !== 'false',
      binaryPath: process.env.YTDLP_PATH || 'yt-dlp',
      timeoutMs: parseInt(process.env.YTDLP_TIMEOUT_MS || '30000', 10),
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
