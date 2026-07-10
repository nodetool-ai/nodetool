// Upload size guard (shared by all backends)
export {
  getMaxUploadBytes,
  assertUploadWithinLimit
} from "./storage-limits.js";

// Low-level key-based storage (bytes in, bytes out)
export type { AbstractStorage } from "./abstract-storage.js";
export { MemoryStorage } from "./memory-storage.js";
export { FileStorage } from "./file-storage.js";
export { S3Storage } from "./s3-storage.js";
export { SupabaseStorage } from "./supabase-storage.js";

// URI-based asset storage (used by the runtime / websocket server)
export type {
  StorageAdapter,
  StorageEntry,
  StorageListResult,
  StorageStat
} from "./storage-adapter.js";
export { InMemoryStorageAdapter } from "./memory-storage-adapter.js";
export { FileStorageAdapter } from "./file-storage-adapter.js";
export {
  S3StorageAdapter,
  type S3StorageAdapterOptions
} from "./s3-storage-adapter.js";
export {
  SupabaseStorageAdapter,
  type SupabaseStorageAdapterOptions
} from "./supabase-storage-adapter.js";
export {
  createSupabaseStorageClient,
  type SupabaseStorageApi,
  type SupabaseBucketApi,
  type SupabaseObjectEntry
} from "./supabase-rest.js";
export { createStorageAdapter, type StorageConfig } from "./factory.js";

// In-house SigV4 S3 client
export {
  S3Client,
  S3Error,
  type S3Api,
  type S3ClientOptions,
  type S3ObjectRef,
  type S3PutObjectInput,
  type S3PutObjectResult,
  type S3GetObjectResult,
  type S3HeadObjectResult,
  type S3CopyObjectInput,
  type S3ListObjectsV2Input,
  type S3ListObjectsV2Result,
  type S3ObjectSummary,
  type S3BucketSummary,
  type S3PresignGetObjectInput,
  type SigV4Credentials
} from "./s3/index.js";

// URL builder
export { createAssetUrlBuilder } from "./url-builder.js";

// Caches
export { MemoryUriCache } from "./memory-uri-cache.js";
export {
  MemoryNodeCache,
  type AbstractNodeCache
} from "./memory-node-cache.js";
