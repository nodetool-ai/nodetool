let providerCacheVersion = 0;

export function clearProviderCache(): void {
  providerCacheVersion += 1;
}

export function getProviderCacheVersion(): number {
  return providerCacheVersion;
}
