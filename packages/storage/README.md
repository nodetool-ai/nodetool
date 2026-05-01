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

## Design: optional SDK dependencies via dynamic imports

`S3Storage` and `SupabaseStorage` do **not** list `@aws-sdk/client-s3` or
`@supabase/supabase-js` as `dependencies` in `package.json`.  Instead they
declare minimal inline TypeScript interfaces that mirror the SDK surface
actually used (`S3ClientLike`, `SupabaseBucket`, etc.) so that the package
**compiles and type-checks without the SDKs installed**.  At runtime the real
SDK is loaded once via `await import(moduleName)` and then cached.

This means:
- Applications that only use `FileStorage` or `MemoryStorage` pay no SDK
  install cost.
- Applications that need S3 or Supabase add the SDK to *their own*
  `dependencies`.  The dynamic import will resolve it at runtime.

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

Requires `@aws-sdk/client-s3` installed in the consuming application.

```ts
import { S3Storage } from "@nodetool-ai/storage";

// Amazon S3
const s3 = new S3Storage("my-bucket", undefined, "cdn.example.com", "us-east-1");

// S3-compatible (e.g. MinIO)
const minio = new S3Storage("my-bucket", "http://localhost:9000");

await s3.upload("assets/logo.png", buffer, "image/png");
console.log(s3.getUrl("assets/logo.png")); // https://cdn.example.com/assets/logo.png
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
