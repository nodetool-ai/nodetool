/**
 * Build-time Supabase fallbacks, isolated in their own module.
 *
 * `import.meta` cannot be loaded by Jest's CommonJS transform, so any module
 * that reads it directly is untestable and ends up mocked wholesale. Keeping
 * these two reads here leaves `supabaseClient.ts` free of `import.meta` and
 * therefore testable; Jest maps this module to a mock that supplies neither.
 *
 * These remain a fallback for the dev server and pure-static hosting, where
 * `GET /api/config` is not reachable.
 */
export const buildTimeSupabaseUrl: string | undefined = import.meta.env
  .VITE_SUPABASE_URL;

export const buildTimeSupabaseAnonKey: string | undefined = import.meta.env
  .VITE_SUPABASE_ANON_KEY;
