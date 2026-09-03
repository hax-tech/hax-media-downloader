import assert from 'assert';
import { providerManager } from '../src/services/provider-manager/provider-manager.service.ts';

export function runProviderSelectionTests() {
  console.log('--- Testing Provider Selection & Priority ---');

  const ytUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const ordered = providerManager.getOrderedProvidersForUrl(ytUrl);

  assert.ok(ordered.length >= 2, 'Should have multiple candidates for YouTube');

  // Verify priority order aligns with config (yt-dlp, cobalt, external)
  const names = ordered.map((p) => p.name);
  assert.strictEqual(names[0], 'yt-dlp', 'First priority provider should be yt-dlp');
  assert.strictEqual(names[1], 'cobalt', 'Second priority provider should be cobalt');

  // Check supported platforms
  const allProviders = providerManager.getAllProviders();
  assert.ok(allProviders.length >= 3, 'Should have registered 3 default providers');

  console.log('✓ Provider selection tests passed.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runProviderSelectionTests();
}
