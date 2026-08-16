import { isString } from "../utils/typePredicates";
/**
 * Read a build-time `VITE_*` variable.
 *
 * `import.meta` is a syntax error under Jest's CommonJS transform, and the
 * modules that reference it directly (`BASE_URL.ts`, `env.ts`,
 * `supabaseClient.ts`) are all mocked away in tests for that reason. Modules
 * that are exercised under Jest read their build-time values through here
 * instead: `process.env` first, then `import.meta.env` behind a `Function`
 * constructor so the transformer never sees the token.
 */
export const getBuildEnv = (name: string): string | undefined => {
  if (typeof process !== "undefined" && process.env?.[name]) {
    return process.env[name];
  }
  try {
    const getEnv = new Function(
      'return typeof import.meta !== "undefined" ? import.meta.env : undefined;'
    );
    const env = getEnv() as Record<string, string | undefined> | undefined;
    const value = env?.[name];
    return isString(value) && value.length > 0 ? value : undefined;
  } catch {
    // import.meta is unavailable in this environment (Jest CJS, SSR).
    return undefined;
  }
};
