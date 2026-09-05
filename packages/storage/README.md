# @nodetool-ai/storage

Storage abstraction layer for NodeTool providing a uniform interface over
multiple storage backends: local file system, in-memory (for tests), Amazon S3
(and S3-compatible services), and Supabase Storage.

## Exported symbols

| Symbol | Kind | Description |
|---|---|---|
| `StorageAdapter` | interface | URI-based asset storage contract implemented by every backend |
| `FileStorageAdapter` | class | Local file system, confined to a root directory |
| `InMemoryStorageAdapter` | class | In-memory `Map`, useful in tests |
| `S3StorageAdapter` | class | Amazon S3 / S3-compatible (MinIO, etc.) |
| `SupabaseStorageAdapter` | class | Supabase Storage buckets |
| `createStorageAdapter` | function | Builds one of the four from a `StorageConfig` |
| `AbstractNodeCache` | interface | Generic async TTL cache contract |
| `MemoryNodeCache` | class | In-memory implementation of `AbstractNodeCache` |
| `MemoryUriCache` | class | Synchronous in-memory TTL cache for signed URLs |

## `StorageAdapter` interface

Callers hand a key in and get an opaque URI back; every later call takes that
URI unchanged. `createUploadUrl` / `createDownloadUrl` are optional and return
`null` on backends with no such concept (file, in-memory), which is the signal
to fall back to a server-side transfer.

```ts
interface StorageAdapter {
  store(key: string, data: Uint8Array, contentType?: string): Promise<string>;
  retrieve(uri: string): Promise<Uint8Array | null>;
  exists(uri: string): Promise<boolean>;
  uriForKey(key: string): string;
  list(prefix: string, opts?: { delimiter?: string }): Promise<StorageListResult>;
  delete(uri: string): Promise<boolean>;
  stat(uri: string): Promise<StorageStat | null>;
  createUploadUrl?(key: string, opts?: UploadUrlOptions): Promise<UploadTarget | null>;
  createDownloadUrl?(uri: string, opts?: DownloadUrlOptions): Promise<string | null>;
}
```

## Design: in-house S3 client, no AWS SDK

S3 access goes through the in-house SigV4 client in `src/s3/` (`S3Client`,
also exported from the package root) instead of `@aws-sdk/client-s3`. It signs
requests with AWS Signature Version 4 over `fetch`, covers exactly the
operations NodeTool uses (Put/Get/Head/Delete/Copy object, ListObjectsV2,
ListBuckets, presigned GET), and supports endpoint overrides with path-style
addressing for MinIO/R2-style services (and for dotted AWS bucket names,
which break the wildcard TLS certificate on virtual-hosted URLs).

Credentials resolve through `src/s3/credentials.ts`: an explicit
`credentials` option, the `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
(/ `AWS_SESSION_TOKEN`) environment variables, or a shared credentials file
profile (`~/.aws/credentials`, `AWS_PROFILE`). Providers returning an
`expiration` refresh automatically; for metadata-service environments
(ECS, EC2 IMDS, EKS), pass a custom `credentialProvider`.

Safe/idempotent operations (GET, HEAD, DELETE, ListObjectsV2, ListBuckets,
PutObject) retry transient failures — network errors, 429, 5xx — with
exponential backoff, honoring `Retry-After`.

## Usage

```ts
import { createStorageAdapter } from "@nodetool-ai/storage";

const store = createStorageAdapter({ kind: "file", rootDir: "/var/data/uploads" });
const uri = await store.store("images/photo.jpg", bytes, "image/jpeg");
const bytes2 = await store.retrieve(uri); // file:///var/data/uploads/images/photo.jpg
```

`{ kind: "s3", bucket, region?, endpoint? }` selects `S3StorageAdapter` — pass
`endpoint` for S3-compatible services such as MinIO. `{ kind: "supabase", url,
apiKey, bucket }` selects `SupabaseStorageAdapter`, which talks to the Storage
REST API directly and needs no `@supabase/supabase-js` install. Construct
`InMemoryStorageAdapter` directly in tests; its URIs use the `memory://` scheme.

## Development

```bash
# Type-check (no build needed)
npm run lint

# Run tests (vitest)
npm test

# Build distributable
npm run build
```
