import { runUrlValidationTests } from './url-validation.test.ts';
import { runPlatformDetectionTests } from './platform-detection.test.ts';
import { runProviderSelectionTests } from './provider-selection.test.ts';
import { runProviderFallbackTests } from './provider-fallback.test.ts';
import { runRateLimitingTests } from './rate-limiting.test.ts';
import { runExpirationAndCleanupTests } from './expiration-and-cleanup.test.ts';
import { runApiValidationTests } from './api-validation.test.ts';
import { runYtDlpProviderTests } from './ytdlp-provider.test.ts';
import { runSecurityAuthTests } from './security-auth.test.ts';
import { runProviderIntegrationTests } from './provider-integration.test.ts';

async function runAllTests() {
  console.log('====================================================');
  console.log('  Running hax-media-downloader Test Suite');
  console.log('  Author: Hamza | Client: Tanu-xai');
  console.log('====================================================\n');

  const start = Date.now();
  let passed = 0;
  let failed = 0;

  const suites: Array<{ name: string; fn: () => Promise<void> | void }> = [
    { name: 'URL Validation & SSRF', fn: runUrlValidationTests },
    { name: 'Platform Detection', fn: runPlatformDetectionTests },
    { name: 'Provider Selection & Priority', fn: runProviderSelectionTests },
    { name: 'Provider Fallback Logic', fn: runProviderFallbackTests },
    { name: 'yt-dlp Provider & File Validation', fn: runYtDlpProviderTests },
    { name: 'Rate Limiting', fn: runRateLimitingTests },
    { name: 'Expiration & Cache Cleanup', fn: runExpirationAndCleanupTests },
    { name: 'API Schema Validation', fn: runApiValidationTests },
    { name: 'Security, Constant-Time Auth & Bounded Memory', fn: runSecurityAuthTests },
    { name: 'Provider Integration (Environment-Controlled)', fn: runProviderIntegrationTests },
  ];

  for (const suite of suites) {
    try {
      await suite.fn();
      passed++;
    } catch (err) {
      failed++;
      console.error(`❌ Suite failed: ${suite.name}`);
      console.error((err as Error).stack || err);
    }
  }

  const duration = Date.now() - start;
  console.log('\n====================================================');
  console.log(`  Tests Complete: ${passed} passed, ${failed} failed in ${duration}ms`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests();
