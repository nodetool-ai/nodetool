/**
 * Tests for the SecureStore-backed Supabase storage adapter.
 * expo-secure-store is mocked with a resettable in-memory store that can also
 * simulate the native module being unavailable.
 */

const mockSecureStore = new Map<string, string>();
const mockState = { fail: false };

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => {
    if (mockState.fail) {
      throw new Error('SecureStore unavailable');
    }
    return mockSecureStore.has(key) ? mockSecureStore.get(key) : null;
  }),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    if (mockState.fail) {
      throw new Error('SecureStore unavailable');
    }
    mockSecureStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    if (mockState.fail) {
      throw new Error('SecureStore unavailable');
    }
    mockSecureStore.delete(key);
  }),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureStorageAdapter } from './secureStorage';

describe('secureStorageAdapter', () => {
  beforeEach(async () => {
    mockSecureStore.clear();
    mockState.fail = false;
    await AsyncStorage.clear();
  });

  it('round-trips a small value', async () => {
    await secureStorageAdapter.setItem('sb-auth', 'hello');
    expect(await secureStorageAdapter.getItem('sb-auth')).toBe('hello');
  });

  it('chunks and reassembles a value larger than the chunk size', async () => {
    const big = 'x'.repeat(5000);
    await secureStorageAdapter.setItem('sb-auth', big);

    // Stored as a manifest plus parts, not one oversized entry.
    expect(mockSecureStore.get('sb-auth')).toMatch(/^__chunks__:/);
    expect(await secureStorageAdapter.getItem('sb-auth')).toBe(big);
  });

  it('cleans up leftover chunks when a value shrinks', async () => {
    await secureStorageAdapter.setItem('sb-auth', 'y'.repeat(5000)); // multiple chunks
    await secureStorageAdapter.setItem('sb-auth', 'z'.repeat(100)); // single direct value

    expect(await secureStorageAdapter.getItem('sb-auth')).toBe('z'.repeat(100));
    expect(mockSecureStore.has('sb-auth.0')).toBe(false);
    expect(mockSecureStore.has('sb-auth.1')).toBe(false);
    expect(mockSecureStore.has('sb-auth.2')).toBe(false);
  });

  it('removes a value and all of its chunks', async () => {
    await secureStorageAdapter.setItem('sb-auth', 'w'.repeat(5000));
    await secureStorageAdapter.removeItem('sb-auth');

    expect(await secureStorageAdapter.getItem('sb-auth')).toBeNull();
    expect(mockSecureStore.size).toBe(0);
  });

  it('migrates a legacy AsyncStorage value into SecureStore on first read', async () => {
    await AsyncStorage.setItem('sb-auth', 'legacy-session');

    expect(await secureStorageAdapter.getItem('sb-auth')).toBe('legacy-session');
    // Promoted into SecureStore and removed from AsyncStorage.
    expect(mockSecureStore.get('sb-auth')).toBe('legacy-session');
    expect(await AsyncStorage.getItem('sb-auth')).toBeNull();
  });

  it('falls back to AsyncStorage when SecureStore is unavailable', async () => {
    mockState.fail = true;

    await secureStorageAdapter.setItem('sb-auth', 'fallback');
    expect(await secureStorageAdapter.getItem('sb-auth')).toBe('fallback');
    expect(await AsyncStorage.getItem('sb-auth')).toBe('fallback');
  });
});
