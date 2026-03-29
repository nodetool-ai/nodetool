/**
 * Environment loader — T-CFG-1.
 *
 * Loads .env files in order: .env, .env.{NODE_ENV}, .env.{NODE_ENV}.local
 * Later files override earlier ones. System env vars always win.
 */
import { config as dotenvConfig } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

let loaded = false;
const envStore = new Map<string, string>();

/**
 * Load environment files in the correct order.
 * System env vars always take precedence over file values.
 *
 * @param rootDir - Directory containing .env files. Defaults to cwd.
 */
export function loadEnvironment(rootDir?: string): void {
  const root = rootDir ?? process.cwd();
  const nodeEnv = process.env.NODE_ENV ?? "development";

  // Load files in order: .env, .env.{NODE_ENV}, .env.{NODE_ENV}.local
  const files = [
    resolve(root, ".env"),
    resolve(root, `.env.${nodeEnv}`),
    resolve(root, `.env.${nodeEnv}.local`),
  ];

  // Start fresh
  envStore.clear();

  // Snapshot system env before loading files
  const systemEnv = { ...process.env };

  for (const file of files) {
    if (existsSync(file)) {
      const result = dotenvConfig({ path: file, override: true });
      if (result.parsed) {
        for (const [key, value] of Object.entries(result.parsed)) {
          envStore.set(key, value);
        }
      }
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
  return process.env[key] ?? defaultValue;
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
