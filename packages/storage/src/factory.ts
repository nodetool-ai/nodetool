import { FileStorageAdapter } from "./file-storage-adapter.js";
import { S3StorageAdapter } from "./s3-storage-adapter.js";
import { SupabaseStorageAdapter } from "./supabase-storage-adapter.js";
import type { StorageAdapter } from "./storage-adapter.js";

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

export function createStorageAdapter(config: StorageConfig): StorageAdapter {
  switch (config.kind) {
    case "file":
      return new FileStorageAdapter(config.rootDir);
    case "s3":
      return new S3StorageAdapter({
        bucket: config.bucket,
        region: config.region,
        endpoint: config.endpoint,
        prefix: config.prefix
      });
    case "supabase":
      return new SupabaseStorageAdapter({
        url: config.url,
        serviceKey: config.serviceKey,
        bucket: config.bucket,
        prefix: config.prefix
      });
  }
}
