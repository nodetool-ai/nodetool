/**
 * Supabase storage adapter backed by the device keychain (expo-secure-store)
 * instead of plain AsyncStorage, so session tokens are encrypted at rest.
 *
 * SecureStore caps a single value at 2048 bytes on Android, which a Supabase
 * session (JWT + refresh token + user) can exceed, so values are split into
 * chunks. A manifest at the base key records the chunk count; the parts live at
 * `<key>.<i>`. Anything that can't reach SecureStore (e.g. the native module
 * isn't in the build yet) falls back to AsyncStorage so auth never hard-breaks,
 * and a pre-existing AsyncStorage session is migrated on first read.
 */
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Leave headroom under SecureStore's 2048-byte Android limit for multi-byte chars.
const CHUNK_SIZE = 1800;
const MANIFEST_PREFIX = '__chunks__:';

function splitChunks(value: string): string[] {
  if (value.length <= CHUNK_SIZE) {
    return [value];
  }
  const parts: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    parts.push(value.slice(i, i + CHUNK_SIZE));
  }
  return parts;
}

async function secureGet(key: string): Promise<string | null> {
  const head = await SecureStore.getItemAsync(key);
  if (head == null) {
    return null;
  }
  if (!head.startsWith(MANIFEST_PREFIX)) {
    // A value short enough to store directly (not chunked).
    return head;
  }
  const count = Number(head.slice(MANIFEST_PREFIX.length));
  if (!Number.isInteger(count) || count < 1) {
    return null;
  }
  let out = '';
  for (let i = 0; i < count; i++) {
    const part = await SecureStore.getItemAsync(`${key}.${i}`);
    if (part == null) {
      // Partial/corrupt write — treat as missing rather than returning garbage.
      return null;
    }
    out += part;
  }
  return out;
}

async function secureSet(key: string, value: string): Promise<void> {
  const parts = splitChunks(value);

  const prevHead = await SecureStore.getItemAsync(key);
  const prevCount = prevHead?.startsWith(MANIFEST_PREFIX)
    ? Number(prevHead.slice(MANIFEST_PREFIX.length))
    : 0;

  // When the value fits in one chunk we store it directly at the base key and
  // write no `.<i>` parts, so every previous chunk is stale. Otherwise only the
  // chunks past the new count are stale.
  let cleanupStart: number;
  if (parts.length === 1) {
    await SecureStore.setItemAsync(key, parts[0]);
    cleanupStart = 0;
  } else {
    // Write the parts before the manifest so a torn write can't leave a
    // manifest pointing at missing chunks.
    for (let i = 0; i < parts.length; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, parts[i]);
    }
    await SecureStore.setItemAsync(key, `${MANIFEST_PREFIX}${parts.length}`);
    cleanupStart = parts.length;
  }

  for (let i = cleanupStart; i < prevCount; i++) {
    await SecureStore.deleteItemAsync(`${key}.${i}`);
  }
}

async function secureRemove(key: string): Promise<void> {
  const head = await SecureStore.getItemAsync(key);
  const count = head?.startsWith(MANIFEST_PREFIX)
    ? Number(head.slice(MANIFEST_PREFIX.length))
    : 0;
  await SecureStore.deleteItemAsync(key);
  for (let i = 0; i < count; i++) {
    await SecureStore.deleteItemAsync(`${key}.${i}`);
  }
}

export const secureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    try {
      const value = await secureGet(key);
      if (value != null) {
        return value;
      }
      // Migrate a session persisted by the old AsyncStorage-backed adapter.
      const legacy = await AsyncStorage.getItem(key);
      if (legacy != null) {
        try {
          await secureSet(key, legacy);
          await AsyncStorage.removeItem(key);
        } catch {
          // Migration is best-effort; keep returning the legacy value.
        }
      }
      return legacy;
    } catch {
      // SecureStore unavailable — fall back to AsyncStorage so auth still works.
      return AsyncStorage.getItem(key);
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      await secureSet(key, value);
    } catch {
      await AsyncStorage.setItem(key, value);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await secureRemove(key);
    } catch {
      // Ignore SecureStore failure; still clear any AsyncStorage copy below.
    }
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // Nothing persisted there; nothing to clean up.
    }
  },
};
