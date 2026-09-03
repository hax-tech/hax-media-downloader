export type ErrorCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_PLATFORM'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_FAILED'
  | 'YTDLP_NOT_FOUND'
  | 'YTDLP_FAILED'
  | 'COBALT_UNAVAILABLE'
  | 'EXTERNAL_API_UNAVAILABLE'
  | 'DOWNLOAD_TIMEOUT'
  | 'FILE_TOO_LARGE'
  | 'INVALID_MEDIA'
  | 'DOWNLOAD_EXPIRED'
  | 'RATE_LIMITED'
  | 'JOB_NOT_FOUND'
  | 'CONCURRENCY_LIMIT_REACHED'
  | 'INTERNAL_ERROR';

export class DownloaderError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, code: ErrorCode, statusCode = 400, details?: unknown) {
    super(message);
    this.name = 'DownloaderError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, DownloaderError.prototype);
  }

  static invalidUrl(message = 'Invalid URL supplied.'): DownloaderError {
    return new DownloaderError(message, 'INVALID_URL', 400);
  }

  static unsupportedPlatform(message = 'Unsupported platform.'): DownloaderError {
    return new DownloaderError(message, 'UNSUPPORTED_PLATFORM', 400);
  }

  static ytdlpNotFound(message = 'yt-dlp binary is not installed or available on the host system.'): DownloaderError {
    return new DownloaderError(message, 'YTDLP_NOT_FOUND', 503);
  }

  static ytdlpFailed(message: string, details?: unknown): DownloaderError {
    return new DownloaderError(message, 'YTDLP_FAILED', 502, details);
  }

  static cobaltUnavailable(message = 'Cobalt provider is not configured or unreachable.'): DownloaderError {
    return new DownloaderError(message, 'COBALT_UNAVAILABLE', 503);
  }

  static externalApiUnavailable(message = 'External API provider is not configured or unreachable.'): DownloaderError {
    return new DownloaderError(message, 'EXTERNAL_API_UNAVAILABLE', 503);
  }

  static providerUnavailable(message: string): DownloaderError {
    return new DownloaderError(message, 'PROVIDER_UNAVAILABLE', 503);
  }

  static providerFailed(message: string, details?: unknown): DownloaderError {
    return new DownloaderError(message, 'PROVIDER_FAILED', 502, details);
  }

  static timeout(message = 'The download operation timed out.'): DownloaderError {
    return new DownloaderError(message, 'DOWNLOAD_TIMEOUT', 504);
  }

  static fileTooLarge(message = 'File exceeds maximum allowed download size.'): DownloaderError {
    return new DownloaderError(message, 'FILE_TOO_LARGE', 413);
  }

  static invalidMedia(message = 'The downloaded file is corrupted or not a valid media file.'): DownloaderError {
    return new DownloaderError(message, 'INVALID_MEDIA', 502);
  }

  static expired(message = 'Download has expired.'): DownloaderError {
    return new DownloaderError(message, 'DOWNLOAD_EXPIRED', 410);
  }

  static rateLimited(message = 'Rate limit exceeded.'): DownloaderError {
    return new DownloaderError(message, 'RATE_LIMITED', 429);
  }

  static jobNotFound(jobId: string): DownloaderError {
    return new DownloaderError(`Download job '${jobId}' was not found.`, 'JOB_NOT_FOUND', 404);
  }
}
