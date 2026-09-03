import {
  Platform,
  DownloadOptions,
  MediaInfo,
  NormalizedDownloadResult,
  ProviderHealth,
  SearchResultItem,
} from '../../types/index.ts';

export interface DownloaderProvider {
  /** Unique provider identifier e.g. 'yt-dlp', 'cobalt', 'external-api' */
  readonly name: string;

  /** Platforms this provider supports */
  readonly supportedPlatforms: Platform[];

  /** Checks whether the URL is supported by this provider */
  isSupported(url: string): boolean;

  /** Extracts media metadata */
  getInfo(url: string, options?: DownloadOptions): Promise<MediaInfo>;

  /** Extracts/initiates download and returns normalized download payload */
  download(url: string, options?: DownloadOptions): Promise<NormalizedDownloadResult>;

  /** Checks availability & connectivity of the provider */
  healthCheck(): Promise<ProviderHealth>;

  /** Optional search capability if platform and provider support it */
  search?(query: string, platform?: Platform): Promise<SearchResultItem[]>;
}
