import 'react-native-url-polyfill/auto';
import { AppState, type AppStateStatus } from 'react-native';
import Constants from 'expo-constants';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { secureStorageAdapter } from './secureStorage';

/**
 * Supabase client configuration for the mobile app.
 *
 * Credentials are resolved in the following order:
 *   1. `extra.supabaseUrl` / `extra.supabaseAnonKey` from app.json / app.config.ts
 *   2. `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` env vars
 *      (baked in at bundle time by Expo)
 *
 * A placeholder URL/key is used as a fallback so the module can be imported in
 * test and development environments without credentials — actual calls will
 * fail gracefully and the login screen will show an error.
 */

type ExpoExtra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as ExpoExtra;

export const SUPABASE_URL: string =
  extra.supabaseUrl ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  'http://localhost';

export const SUPABASE_ANON_KEY: string =
  extra.supabaseAnonKey ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'public-anon-key';

export const isSupabaseConfigured: boolean =
  SUPABASE_URL !== 'http://localhost' && SUPABASE_ANON_KEY !== 'public-anon-key';

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      storage: secureStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  }
);

/** The slice of `AppState` that {@link bindAuthRefreshToAppState} needs. */
interface AppStateSource {
  currentState: AppStateStatus | null;
  addEventListener: (
    type: 'change',
    listener: (state: AppStateStatus) => void
  ) => { remove: () => void };
}

/** The slice of `supabase.auth` that {@link bindAuthRefreshToAppState} drives. */
interface AutoRefreshControl {
  startAutoRefresh: () => Promise<void>;
  stopAutoRefresh: () => Promise<void>;
}

/**
 * Run Supabase's token auto-refresh only while the app is in the foreground,
 * as Supabase's React Native guide requires. The refresh timer does not fire
 * while iOS/Android suspend the JS thread, so without this a session that sat
 * in the background past the access token's lifetime comes back expired.
 * `startAutoRefresh` also refreshes immediately when the token is near expiry.
 *
 * Returns a cleanup that removes the listener and stops the timer.
 */
export function bindAuthRefreshToAppState(
  appState: AppStateSource = AppState,
  auth: AutoRefreshControl = supabase.auth
): () => void {
  const apply = (state: AppStateStatus | null): void => {
    const result = state === 'active' ? auth.startAutoRefresh() : auth.stopAutoRefresh();
    result.catch((error: unknown) => {
      console.warn('[supabase] failed to toggle token auto-refresh', error);
    });
  };
  apply(appState.currentState ?? 'active');
  const subscription = appState.addEventListener('change', apply);
  return () => {
    subscription.remove();
    void auth.stopAutoRefresh().catch(() => undefined);
  };
}
