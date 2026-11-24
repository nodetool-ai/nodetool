---
layout: page
title: "Storage and Vector Store APIs"
description: "The storage adapters, the ProcessingContext asset helpers, node caches, and the @nodetool-ai/vectorstore provider interface, filters and backends."
---

```ts
import { getDefaultVectorProvider } from "@nodetool-ai/vectorstore";

const provider = getDefaultVectorProvider();
const docs = await provider.getOrCreateCollection({
  name: "support_articles",
  dimension: 1536,
  metric: "cosine",
  metadata: { embedding_model: "text-embedding-3-small" }
});
const matches = await docs.query({ text: "I forgot my password", topK: 5 });
```

This page is for code that reads or writes assets and vector collections. Server operators choose backends in [Storage](../storage.md) and [Vector Storage](../vector-storage.md).

## Asset storage adapters

Assets, workflow artifacts and temp files go through the adapters in `@nodetool-ai/storage` (`packages/storage/src/`).

| Backend | Module (`src/`) | Selected by |
|---------|--------|-----------------|
| Local filesystem | `file-storage-adapter.ts` | `NODETOOL_STORAGE_BACKEND=file` or unset |
| Supabase Storage | `supabase-storage-adapter.ts` | `supabase` |
| Amazon S3 or compatible | `s3-storage-adapter.ts` | `s3` |
| In-memory | `memory-storage-adapter.ts` | Tests only. Not selectable by configuration |

- `loadAssetStorageConfig()` and `loadTempStorageConfig()` in `@nodetool-ai/config` (`src/storage-config.ts`) read the variables, and `createStorageAdapter()` (`src/factory.ts`) builds the adapter. The temp adapter is `getTempAdapter()` in `packages/websocket/src/lib/storage.ts`.
- The upload size limit is `getMaxUploadBytes()` (`src/storage-limits.ts`), from `NODETOOL_MAX_UPLOAD_BYTES`.
- S3 credentials come from `src/s3/credentials.ts`: the `AWS_*` variables or a profile. ECS, EC2 IMDS and EKS web identity chains are not built in. Pass a custom `credentialProvider` to `S3Client` for those.
- `createAssetUrlBuilder()` (`src/url-builder.ts`) returns a pre-signed S3 URL or a Supabase signed URL, valid for `SIGNED_URL_TTL` (7 days, from `@nodetool-ai/config`).
- Database history retention is `src/storage-retention.ts` in `@nodetool-ai/websocket`, with its defaults in `src/storage-maintenance.ts` in `@nodetool-ai/models`.

### Linked files

External assets (a file the creator linked instead of copying) store `external_path` on the asset row. `externalAssetsAvailable()` in `packages/websocket/src/lib/external-assets.ts` decides whether a server may create them: the `file` backend outside production.

`assets.collect({ project_id })` copies each linked file of a project into the folder's `Imported/` directory, one asset at a time (`collectLinkedAssets` in `@nodetool-ai/asset-services`). It copies the bytes to a hidden staging file, publishes the copy under a free name in one step that never replaces a file, records it on the row as `metadata.collect_path`, and compares the copy with the linked file by size and partial content hash. Only then does the row get `workspace_path` and lose `external_path`. A run that stops after publishing reuses the recorded copy on the next run when it still holds the linked file's bytes. Any other file at the recorded path stays, and the next run copies under a new name. An offline file is skipped. Project export refuses a project with linked files and names them (HTTP 409), unless it is called with `?linked=collect`, which collects first.

## Accessing storage in a node

`ProcessingContext` (`@nodetool-ai/runtime`, `src/context.ts`) provides:

- `resolveAssetBytes(assetId)` loads an asset's raw bytes. When it cannot read an asset directly, it falls back to `GET <NODETOOL_API_URL>/api/storage/<id>.<ext>`.
- `assetsToStorageUrl(value)` rewrites asset references to storage URLs.
- `downloadFile(url)` fetches file contents from a URL.
- `assetsToWorkspaceFiles(value)` writes asset values to `assets/` in the run's project folder. It needs a folder on local disk.
- `uploadAssetsToTemp(value)` uploads asset values to temp storage and returns temp URLs.

Read and write files in the project folder through `context.workspace`, not through these. See [Project Folder Internals](project-folders.md).

## Caches

- `MemoryNodeCache` (`packages/storage/src/memory-node-cache.ts`) is an in-process cache of node outputs. `ProcessingContext` builds its keys with `generateNodeCacheKey()`.
- `src/memory-uri-cache.ts` caches resolved asset URIs.

## Vector store providers

`@nodetool-ai/vectorstore` exposes one `VectorProvider` / `VectorCollection` interface (`packages/vectorstore/src/provider.ts`) over the local SQLite-vec store and Supabase/pgvector. Every caller goes through it:

- **Workflow nodes**: every node under `vector.*` in `@nodetool-ai/core-nodes` (`packages/core-nodes/src/nodes/vector.ts`) uses the default provider.
- **Collections API**: the tRPC `collections` router (`packages/websocket/src/trpc/routers/collections.ts`) and the upload route (`packages/websocket/src/collection-api.ts`).
- **Agent tools**: the `collections` capability module (`packages/agents/src/capabilities/collections.specs.ts`, `collections.ts`). The collection each tool works on rides on the run (`CapabilityRun.vectorCollection`).

`getDefaultVectorProvider()` calls `createVectorProviderFromEnv()` (`src/provider-factory.ts`) on first use. The `sqlite-vec` provider reuses the process-wide `getDefaultStore()`, so code on the lower-level `SqliteVecStore` API and code on `getDefaultVectorProvider()` share one connection.

For tests or migrations, swap the active provider with `setDefaultVectorProvider(...)`, and release it with `resetDefaultVectorProvider()`. `SupabaseProvider` accepts a pre-built `client` to mock the network layer, and `registryTable`, `recordsTable` and `matchRpc` to rename the two tables and the RPC:

```ts
import { SupabaseProvider } from "@nodetool-ai/vectorstore";

const provider = new SupabaseProvider({
  client: fakePostgrestClient   // any object satisfying PostgrestClientApi
});
```

`src/pinecone-provider.ts` is an unimplemented skeleton. Selecting it with `NODETOOL_VECTOR_PROVIDER=pinecone` requires `PINECONE_API_KEY`, and every collection method then throws `PineconeProvider is not yet implemented`.

### Filters

`VectorFilter` is a MongoDB-style predicate language. Adapters translate the subset they support and **must throw `UnsupportedFilterError`** for anything else, rather than silently dropping conditions.

| Operator | sqlite-vec | supabase |
|---|---|---|
| `{field: scalar}` (equality) | no | yes (jsonb `@>`) |
| `{field: {$eq: v}}` | no | yes |
| `$ne`, `$gt`, `$gte`, `$lt`, `$lte` | no | no |
| `$in` | no | no |
| `{$and: [...]}` | no | yes (flattens into the metadata predicate) |
| `{$or: [...]}` | no | no |
| `{$document: {$contains: "text"}}` | yes | yes (case-insensitive `ILIKE`) |
| `{$document: {$or: [{$contains}, ...]}}` | yes | no |

For a richer Supabase filter, extend the SQL function and the `splitFilter()` translator in `src/supabase-provider.ts` together. The translator is the contract.

### Adding a backend

1. Implement `VectorProvider` and `VectorCollection` in a new `<backend>-provider.ts`.
2. Translate `VectorFilter` to the backend's query language. Throw `UnsupportedFilterError` for predicates it cannot express.
3. Wire it into `createVectorProviderFromEnv()` in `provider-factory.ts` under a new kind.
4. Add a tests file under `tests/` that injects a mock client (no live backend).
5. Re-export the provider class and its options interface from `src/index.ts`.

Keep adapter state mutable so `modify({ name, metadata })` is observable on the same handle, and return `uri` on every read path (part of the `VectorRecord` / `VectorMatch` contract). `SqliteVecProvider` and `SupabaseProvider` are the references.

### The upload route

`POST /api/collections/:name/index` is handled by `handleCollectionRequest()` in `packages/websocket/src/collection-api.ts`. It resolves the collection through `getDefaultVectorProvider().getCollection()` and checks ownership with `canAccessCollection()`. It refuses a collection without `embedding_model` metadata (`400`), reads the file as UTF-8 text (`415` for binary), splits it with `splitDocument()` (2000 characters per chunk, 1000 overlap), and upserts `<file name>#<n>` chunks with `source` and `start_index` metadata through the collection's embedding function, resolved with the caller's provider credentials. A `CollectionNotFoundError` becomes `404`, and any other provider error is logged and returned as a generic `500`, because provider errors carry SQL text, file paths and upstream URLs. The request and response are in the [API Reference](../api-reference.md#indexing-a-file-into-a-collection).

## Related

- [Storage](../storage.md)
- [Vector Storage](../vector-storage.md)
- [Collections](../collections.md)
- [Project Folder Internals](project-folders.md)
