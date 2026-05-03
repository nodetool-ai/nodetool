# @nodetool-ai/models

Data models for NodeTool, backed by [Drizzle ORM](https://orm.drizzle.team/).

Supports both **SQLite** (local / Electron) and **PostgreSQL / Supabase** (cloud).

## Models

| Model | Table | Description |
|-------|-------|-------------|
| `Workflow` | `nodetool_workflows` | DAG-based workflow definitions |
| `Job` | `nodetool_jobs` | Workflow execution state |
| `Asset` | `nodetool_assets` | User-uploaded files |
| `Message` | `nodetool_messages` | Chat messages |
| `Thread` | `nodetool_threads` | Chat threads |
| `Secret` | `nodetool_secrets` | Encrypted user secrets |
| `OAuthCredential` | `nodetool_oauth_credentials` | Encrypted OAuth tokens |
| `Workspace` | `nodetool_workspaces` | File-system workspace directories |
| `WorkflowVersion` | `nodetool_workflow_versions` | Versioned workflow snapshots |
| `Prediction` | `nodetool_predictions` | LLM/AI call records |
| `RunNodeState` | `run_node_state` | Per-node execution state for a run |
| `RunEvent` | `run_events` | Append-only execution event log |
| `RunLease` | `run_leases` | Worker lease records |
| `Setting` | `nodetool_settings` | Per-user key/value settings |
| `TeamTask` | `nodetool_team_tasks` | Multi-agent task coordination |

## Quick Start

### SQLite (default)

```typescript
import { initDb } from "@nodetool-ai/models";

initDb("/path/to/nodetool.db");
```

SQLite creates all tables on first use and applies additive column migrations automatically (no external migration tool needed for local development).

### PostgreSQL / Supabase

```typescript
import { initPostgresDb } from "@nodetool-ai/models";

await initPostgresDb(process.env.DATABASE_URL!);
```

`DATABASE_URL` should be the **connection pooler URL** (port 6543, transaction mode) for the application. For migration runs, use the **direct URL** (port 5432).

For Supabase, both URLs are on the project's *Settings → Database* page.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (Supabase pooler or direct) |
| `NODETOOL_DB_PATH` | SQLite file path (defaults to `~/.nodetool/nodetool.db`) |

## Running Supabase Migrations

Use the CLI with your Supabase **direct connection URL** (port `5432`):

```bash
DIRECT_URL="postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres" \
  nodetool db migrate

nodetool db status --direct-url "$DIRECT_URL"
```

Use the pooler URL (port `6543`, transaction mode) only for the running app, not migration runs.

## Schema Generation (drizzle-kit)

```bash
# SQLite – generate or push schema changes
npx drizzle-kit generate --config packages/models/drizzle.config.ts
npx drizzle-kit push    --config packages/models/drizzle.config.ts

# PostgreSQL / Supabase
DATABASE_URL=postgres://... npx drizzle-kit generate --config packages/models/drizzle.pg.config.ts
DATABASE_URL=postgres://... npx drizzle-kit push    --config packages/models/drizzle.pg.config.ts

# Supabase Studio (schema browser)
DATABASE_URL=postgres://... npx drizzle-kit studio  --config packages/models/drizzle.pg.config.ts
```

## Programmatic Migrations

The migration system works on both dialects and is used by the server at startup:

```typescript
import {
  initPostgresDb, getDb, getDbType,
  MigrationRunner, PostgresJsMigrationAdapter
} from "@nodetool-ai/models";
import postgres from "postgres";

await initPostgresDb(process.env.DIRECT_URL!); // use direct URL for migrations

const sql = postgres(process.env.DIRECT_URL!);
const adapter = new PostgresJsMigrationAdapter(sql);
try {
  const runner = new MigrationRunner(adapter);
  await runner.migrate();
} finally {
  await adapter.release();
  await sql.end();
}
```

For SQLite, the `SQLiteMigrationAdapter` accepts a `better-sqlite3` `Database` instance.

## Dialects

```typescript
import { getDbType } from "@nodetool-ai/models";

getDbType(); // "sqlite" | "postgres"
```

### Schema files

| Path | Dialect |
|------|---------|
| `src/schema/` | SQLite (`sqliteTable` from `drizzle-orm/sqlite-core`) |
| `src/schema-pg/` | PostgreSQL (`pgTable` from `drizzle-orm/pg-core`) |

Both schema sets use a `jsonText<T>()` custom column type that stores JSON as `TEXT` (not `JSONB`) for cross-dialect compatibility.

## Architecture

### `DBModel`

Base class for all models. Provides:

- `static get<T>(id)` — fetch by primary key
- `static create<T>(data)` — insert and return new instance
- `save()` — upsert (insert or replace)
- `delete()` — remove row
- `beforeSave()` — lifecycle hook (override to set `updated_at`, etc.)
- `ModelObserver` — subscribe to create/update/delete events

All query methods are `async` and work transparently with both SQLite and PostgreSQL.

### CAS (Compare-and-Swap)

`Job.acquireWithCas(workerId, expectedVersion)` uses `.returning()` to atomically claim a job only if `version` matches — no dialect-specific `.changes` property needed.

### Transactions

```typescript
const db = getDb();
await db.transaction(async (tx) => {
  // works on both SQLite and PostgreSQL
});
```

## Testing

```bash
npm run test --workspace=packages/models
```

Tests use an in-memory SQLite database (`initTestDb()`). No PostgreSQL instance is required to run the test suite.

```typescript
import { initTestDb } from "@nodetool-ai/models";

beforeEach(() => initTestDb());
```
