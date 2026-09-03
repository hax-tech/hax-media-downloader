import { Platform } from '../types/index.ts';

interface PlatformRule {
  platform: Platform;
  patterns: RegExp[];
}

const PLATFORM_RULES: PlatformRule[] = [
  {
    platform: 'youtube',
    patterns: [
      /^(https?:\/\/)?(www\.|m\.|music\.)?youtube\.com\/(watch\?|shorts\/|playlist\?|embed\/|v\/)/i,
      /^(https?:\/\/)?youtu\.be\/[a-zA-Z0-9_-]+/i,
    ],
  },
  {
    platform: 'instagram',
    patterns: [
      /^(https?:\/\/)?(www\.)?instagram\.com\/(p|reel|reels|tv|stories)\/[a-zA-Z0-9_-]+/i,
      /^(https?:\/\/)?instagr\.am\/[a-zA-Z0-9_-]+/i,
    ],
  },
  {
    platform: 'tiktok',
    patterns: [
      /^(https?:\/\/)?(www\.|m\.|t\.)?tiktok\.com\/(@[a-zA-Z0-9_.-]+\/video\/\d+|v\/\d+|t\/[a-zA-Z0-9]+)/i,
      /^(https?:\/\/)?(vm|vt)\.tiktok\.com\/[a-zA-Z0-9_-]+/i,
    ],
  },
  {
    platform: 'facebook',
    patterns: [
      /^(https?:\/\/)?(www\.|m\.|web\.)?facebook\.com\/([a-zA-Z0-9_.-]+\/videos\/|watch\/\?v=|reel\/|story\.php\?)/i,
      /^(https?:\/\/)?fb\.watch\/[a-zA-Z0-9_-]+/i,
      /^(https?:\/\/)?fb\.com\/[a-zA-Z0-9_.-]+/i,
    ],
  },
  {
    platform: 'pinterest',
    patterns: [
      /^(https?:\/\/)?([a-z0-9-]+\.)?pinterest\.(com|[a-z]{2,3}(\.[a-z]{2})?)\/pin\/\d+/i,
      /^(https?:\/\/)?pin\.it\/[a-zA-Z0-9_-]+/i,
    ],
  },
];

export function detectPlatform(url: string): Platform | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();

  for (const rule of PLATFORM_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(trimmed))) {
      return rule.platform;
    }
  }

  return null;
}

export function isPlatformSupported(platform: string): platform is Platform {
  return ['youtube', 'instagram', 'tiktok', 'facebook', 'pinterest'].includes(platform);
}
