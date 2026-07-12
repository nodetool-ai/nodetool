/**
 * Environment loader — T-CFG-1.
 *
 * Loads .env files in order: .env, .env.{NODE_ENV}, .env.{NODE_ENV}.local
 * Later files override earlier ones. System env vars always win.
 *
 * `node:fs` and `node:path` are lazy-loaded so the module graph loads
 * on non-Node runtimes (browser, Edge). `loadEnvironment()` is a no-op
 * outside Node.
 */
import { loadEnvFile } from "./env-file.js";
import { IS_NODE, importNodeBuiltin } from "./node-import.js";

type FsApi = {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: "utf8") => string;
};
type PathApi = { resolve: (...parts: string[]) => string };
const fsSync = await importNodeBuiltin<FsApi>("node:fs");
const pathSync = await importNodeBuiltin<PathApi>("node:path");

let loaded = false;
const envStore = new Map<string, string>();

/**
 * Load environment files in the correct order.
 * System env vars always take precedence over file values.
 *
 * @param rootDir - Directory containing .env files. Defaults to cwd.
 */
export function loadEnvironment(rootDir?: string): void {
  if (!IS_NODE || !fsSync || !pathSync) {
    // Outside Node — no .env files to load.
    loaded = true;
    return;
  }
  const root = rootDir ?? process.cwd();
  const nodeEnv = process.env.NODE_ENV ?? "development";

  const files = [
    pathSync.resolve(root, ".env"),
    pathSync.resolve(root, `.env.${nodeEnv}`),
    pathSync.resolve(root, `.env.${nodeEnv}.local`)
  ];

  envStore.clear();

  const systemEnv = { ...process.env };

  for (const file of files) {
    const parsed = loadEnvFile(fsSync, file);
    for (const [key, value] of Object.entries(parsed)) {
      envStore.set(key, value);
    }
  }

  // System env always wins — restore original system values on top
  for (const [key, value] of Object.entries(systemEnv)) {
    if (value !== undefined) {
      envStore.set(key, value);
      process.env[key] = value;
    }
  }

  loaded = true;
}

/**
 * Get an environment variable value.
 * Falls back to process.env if loadEnvironment hasn't been called.
 */
export function getEnv(key: string, defaultValue?: string): string | undefined {
  if (loaded) {
    return envStore.get(key) ?? defaultValue;
  }
  return (IS_NODE ? process.env[key] : undefined) ?? defaultValue;
}

/**
 * Get a required environment variable. Throws if not set.
 */
export function requireEnv(key: string): string {
  const value = getEnv(key);
  if (value === undefined || value === "") {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

/**
 * Reset the loader state (for testing).
 */
export function resetEnvironment(): void {
  envStore.clear();
  loaded = false;
}
