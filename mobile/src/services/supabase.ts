import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
