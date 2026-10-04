# @nodetool-ai/models — Agent Guidelines

**Navigation**: [packages/AGENTS.md](../AGENTS.md) | [Root AGENTS.md](../../AGENTS.md)

This package is the persistence layer. It owns all database tables, schema definitions, migrations, and the `DBModel` base class.

## Dialect Support

The package supports two database backends. The active dialect is set at startup and cannot change at runtime:

| Dialect | Init function | Schema path | Driver |
|---------|--------------|-------------|--------|
| SQLite | `initDb(path)` | `src/schema/` | `better-sqlite3` |
| PostgreSQL | `await initPostgresDb(url)` | `src/schema-pg/` | `postgres` (postgres.js) |

Use `getDatabase()` to narrow the active driver together with its own schema.
`getDb()` and `DbTransaction` retain a SQLite projection for unmigrated models.
That projection is compatibility debt. Use the narrowed transaction callback for
new PostgreSQL paths, including `.for("update")` locking.

## Adding a Column

1. Add the column to **both** schema files:
   - `src/schema/<table>.ts` — `sqliteTable`, e.g. `text("my_col")`
   - `src/schema-pg/<table>.ts` — `pgTable`, same column name and semantics

2. Add a versioned migration in `src/migrations/versions.ts` for both dialects.
   The SQLite baseline in `src/migrations/sqlite-baseline.ts` is frozen at
   `SQLITE_BASELINE_VERSION`. Do not add new columns to that historical baseline.

3. Add a `declare my_col: ...` field to the model class.

4. Update the constructor to set a default: `this.my_col ??= null;`

`initPostgresDb` creates no tables. Run migrations separately before cloud startup.

`TABLE_COLUMNS` is derived from the frozen SQLite baseline. Its additive repair
is a recorded compatibility migration, not an automatic repair from live schema.
`initDb()` remains synchronous and applies only that compatibility migration.
Run `await migrateSqliteDb(path)` before `initDb(path)` for normal application
startup so historical data transformations and subsequent migrations run.
Direct synchronous callers leave those migrations pending.

Three tests relate the remaining declaration sites, each by building the schema and
reading it back rather than by matching text:

- `tests/schema-parity.test.ts` — migrated baseline against the Drizzle tables:
  column names, types, NOT NULL, primary keys, defaults, indexes, foreign keys.
  It also verifies compatibility columns against the frozen baseline.
- `tests/schema-dialect-parity.test.ts` — `src/schema/` against `src/schema-pg/`: tables,
  columns, declaration types, constraints, defaults, index names.
- `tests/migration-schema-parity.test.ts` — applies the migration chain to a real
  database and checks it creates every Drizzle table and column. Forget step 5 and it
  fails.

## Adding a New Model

1. Create `src/schema/<name>.ts` (SQLite) and `src/schema-pg/<name>.ts` (PostgreSQL).
2. Export both from their respective `index.ts` barrel files.
3. Add a `createsTables` migration entry in `src/migrations/versions.ts` with
   table and index SQL for both dialects. Keep the historical baseline unchanged.
4. Create `src/<model-name>.ts` extending `DBModel`. Set `static override table = <sqliteTable>`.
5. Export the new model from `src/index.ts`.

## Writing Query Methods

All query methods must be `async`. Use Drizzle's promise-based API — it works on both dialects:

Use Drizzle-inferred row and insert types in converted models. `Asset` and
`ExternalIdentity` are the initial examples. Keep dialect-specific builder calls
in explicit branches and share conditions and business rules above those branches.
Avoid passing a SQLite table into a PostgreSQL query.

`DBModel.create()` emits one `CREATED` notification after persistence.
`save()` and `update()` emit `UPDATED`, and `delete()` emits `DELETED`.
The observer receives the same model instance used by resource broadcasting.

Outside an explicitly narrowed synchronous SQLite transaction, use awaited
queries. `.get()`, `.run()`, and `.all()` are SQLite-only methods.

### Returning pattern for CAS

When you need to know if an `UPDATE` matched a row (e.g. optimistic locking), use `.returning()`:

```typescript
const updated = await db
  .update(myTable)
  .set({ version: newVersion })
  .where(and(eq(myTable.id, id), eq(myTable.version, expected)))
  .returning({ id: myTable.id });

if (updated.length === 0) return false; // row was already modified
```

## JSON Columns

Document and capabilities columns that the model serializes use `text()` in both
schemas. Keep serialization in the model so the JSON string reaches the driver
once. Other structured fields use `jsonText<T>()` in both schemas to encode and
decode JSON as `TEXT`. Do not use `json()` or `jsonb()`.

```typescript
// SQLite schema:
import { jsonText } from "./helpers.js";
graph: jsonText<WorkflowGraph>()("graph").notNull()

// PostgreSQL schema (same helper, pg-core version):
import { jsonText } from "./helpers.js";
graph: jsonText<WorkflowGraph>()("graph").notNull()
```

## Boolean Columns

SQLite uses `integer("col", { mode: "boolean" })`. PostgreSQL uses
`integerBoolean("col")` from `src/schema-pg/helpers.ts`. Both expose TypeScript
booleans and store `0` or `1`. Use `true` and `false` in queries against either
schema.

For PostgreSQL defaults, use ``.default(sql`0`)`` for false and
``.default(sql`1`)`` for true. Drizzle Kit renders defaults without applying
the custom column encoder, so `.default(false)` would emit `DEFAULT false`
for an integer column.

## Migrations

Migrations live in `src/migrations/versions.ts` as an ordered list of `MigrationDef` objects. Each migration has a `version` string, a `name`, the `createsTables` / `modifiesTables` it touches, and `up` / `down` functions that take a `MigrationDBAdapter`.

The `MigrationRunner` applies pending migrations in order and records them in `_nodetool_migrations` (`MIGRATION_TRACKING_TABLE` in `src/migrations/state.ts`). It works on both dialects via the `MigrationDBAdapter` interface:

- `SQLiteMigrationAdapter` — uses `better-sqlite3` synchronous API
- `PostgresMigrationAdapter` — uses `pg` (node-postgres) pool
- `PostgresJsMigrationAdapter` — uses `postgres.js` reserved connection (preferred for Supabase)

### drizzle-kit

Use `drizzle-kit` to introspect schema changes and auto-generate migration SQL:

```bash
# Generate migration SQL from schema changes
DATABASE_URL=postgres://... npx drizzle-kit generate --config packages/models/drizzle.pg.config.ts

# Push schema directly (dev/staging only — never production without review)
DATABASE_URL=postgres://... npx drizzle-kit push --config packages/models/drizzle.pg.config.ts
```

The generated SQL in `src/drizzle-migrations-pg/` should be reviewed and then added as a `MigrationDef` entry in `versions.ts` for auditability.

## Tests

Tests live in `tests/`. Most suites use `initTestDb()` for an in-memory SQLite
connection. The recording-driver suites inspect PostgreSQL SQL and parameters.
`tests/db-dialect-execution.test.ts` runs the same model fixtures on SQLite and
PGlite, an in-process PostgreSQL engine. Its `initPgliteTestDb()` helper applies
the production PostgreSQL migration chain through `MigrationRunner` before
installing the test connection. These tests need no external database server.

```bash
npm run test --workspace=packages/models
```

Call `initTestDb()` in `beforeEach` for SQLite fixtures. Dual-dialect fixtures
close the active connection before initializing the next engine. Call
`closeDb()` after PGlite tests to release the engine and reset global state.

## Rules

- All public query methods must be `async`.
- Keep inferred query row types through `.map()` rather than widening rows to
  `Record<string, unknown>`. Leave the dynamic base model compatibility boundary
  explicit until a model is converted.
- Never import from `dist/`. Use `@nodetool-ai/models` for cross-package imports.
- Keep `src/schema/` (SQLite) and `src/schema-pg/` (PostgreSQL) in sync — columns, names, and types must match.
- The SQLite baseline is versioned compatibility SQL. `TABLE_COLUMNS` is derived
  from that SQL, not the live schema. Preserve legacy nullable additions where
  SQLite cannot add a required column without a constant default. New constraints
  need explicit versioned migrations that preserve existing data.
