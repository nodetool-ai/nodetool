/**
 * Shared API host resolution.
 *
 * This tiny module is imported by both the REST ApiService and the tRPC client
 * to avoid a circular dependency: apiService (services/api.ts) → tRPC client
 * (trpc/client.ts) → apiService.
 *
 * All code that needs the current server base URL should call `getApiHost()`
 * from this module rather than going through `apiService.getApiHost()`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const API_HOST_KEY = '@nodetool_api_host';
export const DEFAULT_API_HOST = 'http://localhost:7777';

// In-memory cache — updated whenever ApiService saves/loads the host.
let cachedHost: string = DEFAULT_API_HOST;

/** Read the persisted host from AsyncStorage (used at startup). */
export async function loadApiHost(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(API_HOST_KEY);
    if (saved) {
      cachedHost = saved;
    }
  } catch {
    // ignore storage errors; fall back to the cached/default value
  }
  return cachedHost;
}

/** Persist a new host and update the in-memory cache. */
export async function saveApiHost(host: string): Promise<void> {
  cachedHost = host;
  await AsyncStorage.setItem(API_HOST_KEY, host);
}

/**
 * Return the currently cached host **synchronously**.
 * Before `loadApiHost()` completes the first time this returns the default.
 */
export function getApiHost(): string {
  return cachedHost;
}

/**
 * Update the in-memory cache without persisting to storage.
 * Used by ApiService when it recreates its openapi-fetch client.
 */
export function setCachedApiHost(host: string): void {
  cachedHost = host;
}
