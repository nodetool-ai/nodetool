# @nodetool-ai/storage

Storage abstraction layer for NodeTool providing a uniform interface over
multiple storage backends: local file system, in-memory (for tests), Amazon S3
(and S3-compatible services), and Supabase Storage.

## Exported symbols

| Symbol | Kind | Description |
|---|---|---|
| `AbstractStorage` | interface | 5-method contract implemented by every backend |
| `FileStorage` | class | Local file system, with path-traversal protection |
| `MemoryStorage` | class | In-memory `Map`, useful in tests |
| `S3Storage` | class | Amazon S3 / S3-compatible (MinIO, etc.) |
| `SupabaseStorage` | class | Supabase Storage buckets |
| `AbstractNodeCache` | interface | Generic async TTL cache contract |
| `MemoryNodeCache` | class | In-memory implementation of `AbstractNodeCache` |
| `MemoryUriCache` | class | Synchronous in-memory TTL cache for signed URLs |

## `AbstractStorage` interface

```ts
interface AbstractStorage {
  upload(key: string, data: Buffer | Uint8Array, contentType?: string): Promise<void>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
  exists(key: string): Promise<boolean>;
}
```

## Design: in-house S3 client, no AWS SDK

S3 access goes through the in-house SigV4 client in `src/s3/` (`S3Client`,
also exported from the package root) instead of `@aws-sdk/client-s3`. It signs
requests with AWS Signature Version 4 over `fetch`, covers exactly the
operations NodeTool uses (Put/Get/Head/Delete/Copy object, ListObjectsV2,
ListBuckets, presigned GET), and supports endpoint overrides with path-style
addressing for MinIO/R2-style services. Credentials come from an explicit
`credentials` option or the `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
(/ `AWS_SESSION_TOKEN`) environment variables — the wider AWS credential
chain (profiles, IMDS) is not supported.

## Usage

### FileStorage

```ts
import { FileStorage } from "@nodetool-ai/storage";

const store = new FileStorage("/var/data/uploads");
await store.upload("images/photo.jpg", buffer, "image/jpeg");
const buf = await store.download("images/photo.jpg");
console.log(store.getUrl("images/photo.jpg")); // file:///var/data/uploads/images/photo.jpg
```

### S3Storage

```ts
import { S3Storage } from "@nodetool-ai/storage";

// Amazon S3
const s3 = new S3Storage("my-bucket", undefined, "us-east-1");

// S3-compatible (e.g. MinIO)
const minio = new S3Storage("my-bucket", "http://localhost:9000");

await s3.upload("assets/logo.png", buffer, "image/png");
console.log(s3.getUrl("assets/logo.png")); // https://my-bucket.s3.us-east-1.amazonaws.com/assets/logo.png
```

### SupabaseStorage

Requires `@supabase/supabase-js` installed in the consuming application.

```ts
import { SupabaseStorage } from "@nodetool-ai/storage";

const store = new SupabaseStorage(
  "https://<project>.supabase.co",
  "<service-role-key>",
  "assets"
);

await store.upload("images/photo.jpg", buffer, "image/jpeg");
console.log(store.getUrl("images/photo.jpg"));
// https://<project>.supabase.co/storage/v1/object/public/assets/images/photo.jpg
```

## Development

```bash
# Type-check (no build needed)
npm run lint

# Run tests (vitest)
npm test

# Build distributable
npm run build
```
