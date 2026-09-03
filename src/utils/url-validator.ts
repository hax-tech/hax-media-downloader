import { isSafeUrl } from './ssrf.ts';
import { detectPlatform } from './platform-detector.ts';
import { Platform } from '../types/index.ts';

export interface ValidationResult {
  isValid: boolean;
  platform?: Platform;
  normalizedUrl?: string;
  error?: string;
}

export function validateMediaUrl(rawUrl: string): ValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isValid: false, error: 'A valid URL string is required.' };
  }

  const trimmed = rawUrl.trim();

  // SSRF and protocol check
  const safeCheck = isSafeUrl(trimmed);
  if (!safeCheck.safe) {
    return { isValid: false, error: safeCheck.reason || 'Restricted or invalid URL.' };
  }

  // Platform detection
  const platform = detectPlatform(trimmed);
  if (!platform) {
    return {
      isValid: false,
      error: 'Unsupported platform. Supported platforms: YouTube, Instagram, TikTok, Facebook, Pinterest.',
    };
  }

  return {
    isValid: true,
    platform,
    normalizedUrl: trimmed,
  };
}
