import Constants from 'expo-constants';

/**
 * Google OAuth client IDs for native sign-in.
 *
 * These are public client identifiers (they ship inside the app bundle either
 * way), but they're resolved through config rather than hardcoded in a store so
 * a different build/environment can override them without code changes. Order:
 *   1. `extra.googleWebClientId` / `extra.googleIosClientId` (app.json)
 *   2. `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` env vars (baked in at bundle time)
 *   3. the default production ids
 */

type ExpoExtra = {
  googleWebClientId?: string;
  googleIosClientId?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as ExpoExtra;

export const GOOGLE_WEB_CLIENT_ID: string =
  extra.googleWebClientId ||
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  '865599262139-mla1l0bqc3ss0frq085mcdpd6cbftvem.apps.googleusercontent.com';

export const GOOGLE_IOS_CLIENT_ID: string =
  extra.googleIosClientId ||
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
  '865599262139-dmfkvddphs7h1qu6dvrgj0t9aq656h84.apps.googleusercontent.com';
