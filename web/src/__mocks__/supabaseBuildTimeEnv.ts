/**
 * Under Jest there is no Vite build, so neither build-time fallback exists.
 * This mirrors production, where the credentials come from `/api/config`.
 */
export const buildTimeSupabaseUrl: string | undefined = undefined;
export const buildTimeSupabaseAnonKey: string | undefined = undefined;
