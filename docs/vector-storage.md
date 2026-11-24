---
layout: page
title: "Vector Storage"
description: "Choose where a NodeTool server keeps collections: the local SQLite store or a Supabase project with pgvector."
---

Collections are stored in a vector database. A server keeps them in a local SQLite file by default, or in a Supabase project for a multi-user deployment.

```bash
NODETOOL_VECTOR_PROVIDER=supabase \
SUPABASE_URL=https://xyz.supabase.co \
SUPABASE_KEY=<service-role-key> \
nodetool serve
```

## Choosing a Backend

| `NODETOOL_VECTOR_PROVIDER` | When to use | Setup |
|---|---|---|
| `sqlite-vec` (default) | Desktop app, or a server on one machine | None. First use creates `vectorstore.db` in the NodeTool data folder. |
| `supabase` | A hosted multi-user deployment backed by a Supabase or PostgreSQL project with pgvector | Install the SQL migration once, then set `SUPABASE_URL` and `SUPABASE_KEY`. |

Any other value makes every collection request fail. An unknown name fails with `Unknown NODETOOL_VECTOR_PROVIDER: '<value>'`.

## Local SQLite

| Variable | Purpose |
|---|---|
| `VECTORSTORE_DB_PATH` | The SQLite file. Default `vectorstore.db` in the NodeTool data folder, separate from the main database |

The file needs disk headroom for everything you index. Back it up with the rest of the data folder.

## Supabase

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_KEY` or `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` wins when both are set. An anon key needs row-level security policies that grant access to the two tables below |
| `NODETOOL_VECTOR_SCHEMA` | PostgreSQL schema, default `public` |

These are the variables the Supabase storage backend uses, so one project can hold both assets and collections.

### One-time SQL install

NodeTool creates no tables itself. Run [`packages/vectorstore/sql/supabase-migration.sql`](https://github.com/nodetool-ai/nodetool/blob/main/packages/vectorstore/sql/supabase-migration.sql) once through the Supabase SQL editor or `supabase migration`. It creates:

- `nodetool_vec_collections`, one row per collection (name, metadata, dimension, metric).
- `nodetool_vec_records`, the chunks of every collection with their embeddings. Renaming a collection needs no rewrite of its chunks.
- `nodetool_vec_match`, the function similarity search calls.

Once a collection's dimension is fixed, you can add an `ivfflat` index for faster search. The migration file documents the statement.

## If it fails

- **`NODETOOL_VECTOR_PROVIDER=supabase but SUPABASE_URL and SUPABASE_KEY (or SUPABASE_SERVICE_ROLE_KEY) are not set`**: set both. The message also reminds you to install the migration.
- **Supabase errors on every collection call**: the migration did not run on this project, or ran in another schema than `NODETOOL_VECTOR_SCHEMA`. Set `NODETOOL_VECTOR_PROVIDER=sqlite-vec` to fall back to local storage meanwhile.
- **`UnsupportedFilterError`**: a query node or tool used a metadata filter the backend cannot run. The local store supports only text-contains filters. See [Filters](developer/storage.md#filters).

## Related

- [Collections](collections.md)
- [Storage](storage.md)
- [Supabase Deployment](supabase-deployment.md)
- [Storage and Vector Store APIs](developer/storage.md)
