import { getDefaultAssetsPath } from "./paths.js";

/**
 * Storage backend selection. Mirrors `StorageConfig` in `@nodetool-ai/storage`
 * but kept structurally compatible to avoid a config → storage dependency.
 */
export type StorageConfig =
  | { kind: "file"; rootDir: string }
  | { kind: "s3"; bucket: string; region?: string; endpoint?: string }
  | { kind: "supabase"; url: string; apiKey: string; bucket: string };

function requireEnv(key: string, backend: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required env var ${key} for NODETOOL_STORAGE_BACKEND=${backend}`
    );
  }
  return value;
}

function buildConfig(backend: string, bucketEnv: string): StorageConfig {
  switch (backend) {
    case "file":
      return { kind: "file", rootDir: getDefaultAssetsPath() };
    case "s3":
      return {
        kind: "s3",
        bucket: requireEnv(bucketEnv, "s3"),
        region: process.env.S3_REGION,
        endpoint: process.env.S3_ENDPOINT ?? process.env.S3_ENDPOINT_URL
      };
    case "supabase":
      return {
        kind: "supabase",
        url: requireEnv("SUPABASE_URL", "supabase"),
        apiKey: requireEnv("SUPABASE_KEY", "supabase"),
        bucket: requireEnv(bucketEnv, "supabase")
      };
    default:
      throw new Error(
        `Unknown NODETOOL_STORAGE_BACKEND: "${backend}". Expected file|s3|supabase.`
      );
  }
}

/** 7 days — S3/Supabase maximum. Long enough that no browser or CDN cache
 *  will hold a redirect past expiry. */
export const SIGNED_URL_TTL = 604800;

const backend = (): string =>
  (process.env.NODETOOL_STORAGE_BACKEND ?? "file").toLowerCase();

/**
 * Asset storage config — permanent user files.
 *
 * Env vars:
 *   NODETOOL_STORAGE_BACKEND  file | s3 | supabase  (default: file)
 *   ASSET_BUCKET              bucket name (s3 / supabase)
 *   SUPABASE_URL              Supabase project URL
 *   SUPABASE_KEY              Supabase API key
 *   S3_REGION                 AWS region (s3)
 *   S3_ENDPOINT               custom S3 endpoint (s3, optional)
 */
export function loadAssetStorageConfig(): StorageConfig {
  return buildConfig(backend(), "ASSET_BUCKET");
}

/**
 * Temp storage config — ephemeral workflow outputs.
 *
 * Same backend as assets; uses a separate bucket so temp files can have
 * different retention / access policies.
 *
 * Env vars:
 *   TEMP_BUCKET               bucket name (s3 / supabase)
 *   (all other vars shared with loadAssetStorageConfig)
 */
export function loadTempStorageConfig(): StorageConfig {
  return buildConfig(backend(), "TEMP_BUCKET");
}
