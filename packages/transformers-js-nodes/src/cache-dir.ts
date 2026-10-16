import { getDefaultTransformersJsCacheDir } from "@nodetool-ai/config";

let cacheDirOverride: string | null = null;

/**
 * Override the Transformers.js cache directory at runtime. Pass `null` to
 * revert to the default resolved by `getDefaultTransformersJsCacheDir()`.
 *
 * Must be called before the first `loadTransformers()` to take effect, since
 * `env.cacheDir` is set on the singleton module on first import.
 */
export function setTransformersJsCacheDir(dir: string | null): void {
  cacheDirOverride = dir;
}

/** Resolve the cache directory: explicit override → env var → data-dir default. */
export function getTransformersJsCacheDir(): string {
  return cacheDirOverride ?? getDefaultTransformersJsCacheDir();
}
