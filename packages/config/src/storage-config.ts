import { getDefaultAssetsPath } from "./paths.js";

/**
 * Storage backend selection. Mirrors `StorageConfig` in `@nodetool-ai/storage`
 * but kept structurally compatible to avoid a config → storage dependency.
 */
export type StorageConfig =
  | { kind: "file"; rootDir: string }
  | {
      kind: "s3";
      bucket: string;
      region?: string;
      endpoint?: string;
      prefix?: string;
    }
  | {
      kind: "supabase";
      url: string;
      serviceKey: string;
      bucket: string;
      prefix?: string;
    };

function requireStorageEnv(key: string, backend: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required env var ${key} for NODETOOL_STORAGE_BACKEND=${backend}`
    );
  }
  return value;
}

/**
 * Load asset storage configuration from environment variables.
 *
 * `NODETOOL_STORAGE_BACKEND` selects the backend (default: `file`):
 *   - `file`: uses `getDefaultAssetsPath()` (overridable via `ASSET_FOLDER` /
 *     `STORAGE_PATH`).
 *   - `s3`: requires `S3_BUCKET`. Optional: `S3_REGION`, `S3_ENDPOINT`,
 *     `S3_PREFIX`. AWS credentials come from the standard AWS SDK chain.
 *   - `supabase`: requires `SUPABASE_STORAGE_URL`,
 *     `SUPABASE_STORAGE_SERVICE_KEY`, `SUPABASE_STORAGE_BUCKET`. Optional:
 *     `SUPABASE_STORAGE_PREFIX`.
 */
export function loadStorageConfig(): StorageConfig {
  const backend = (process.env.NODETOOL_STORAGE_BACKEND ?? "file").toLowerCase();
  switch (backend) {
    case "file":
      return { kind: "file", rootDir: getDefaultAssetsPath() };
    case "s3":
      return {
        kind: "s3",
        bucket: requireStorageEnv("S3_BUCKET", "s3"),
        region: process.env.S3_REGION,
        endpoint: process.env.S3_ENDPOINT,
        prefix: process.env.S3_PREFIX
      };
    case "supabase":
      return {
        kind: "supabase",
        url: requireStorageEnv("SUPABASE_STORAGE_URL", "supabase"),
        serviceKey: requireStorageEnv(
          "SUPABASE_STORAGE_SERVICE_KEY",
          "supabase"
        ),
        bucket: requireStorageEnv("SUPABASE_STORAGE_BUCKET", "supabase"),
        prefix: process.env.SUPABASE_STORAGE_PREFIX
      };
    default:
      throw new Error(
        `Unknown NODETOOL_STORAGE_BACKEND: "${backend}". Expected file|s3|supabase.`
      );
  }
}
