# @nodetool-ai/models — Agent Guidelines

**Navigation**: [packages/AGENTS.md](../AGENTS.md) | [Root AGENTS.md](../../AGENTS.md)

This package is the persistence layer. It owns all database tables, schema definitions, migrations, and the `DBModel` base class.

## Dialect Support

The package supports two database backends. The active dialect is set at startup and cannot change at runtime:

| Dialect | Init function | Schema path | Driver |
|---------|--------------|-------------|--------|
| SQLite | `initDb(path)` | `src/schema/` | `better-sqlite3` |
| PostgreSQL | `await initPostgresDb(url)` | `src/schema-pg/` | `postgres` (postgres.js) |

Use `getDbType()` → `"sqlite" | "postgres"` to branch on dialect if unavoidable.

## Adding a Column

1. Add the column to **both** schema files:
   - `src/schema/<table>.ts` — `sqliteTable`, e.g. `text("my_col")`
   - `src/schema-pg/<table>.ts` — `pgTable`, same column name and semantics

2. Add the column to the `CREATE TABLE` for that table in `getCreateSchemaSql()` in
   `src/db.ts` — the DDL a fresh SQLite database is created from.

3. Add a `declare my_col: ...` field to the model class.

4. Update the constructor to set a default: `this.my_col ??= null;`

5. If needed, add a migration entry in `src/migrations/versions.ts`.

`TABLE_COLUMNS` — the map `addMissingColumns()` uses to repair a legacy SQLite install —
is **derived** from the Drizzle tables, so there is nothing to update there.

`tests/schema-parity.test.ts` executes the bootstrap DDL into an in-memory database and
compares the result against the Drizzle tables: column names, types, NOT NULL, primary
keys, defaults, indexes and foreign keys. Forget step 2 and it fails.

## Adding a New Model

1. Create `src/schema/<name>.ts` (SQLite) and `src/schema-pg/<name>.ts` (PostgreSQL).
2. Export both from their respective `index.ts` barrel files.
3. Add the `CREATE TABLE IF NOT EXISTS` and index SQL to `getCreateSchemaSql()` in `src/db.ts`.
   `TABLE_COLUMNS` is derived from the schema and needs no edit.
4. Create `src/<model-name>.ts` extending `DBModel`. Set `static override table = <sqliteTable>`.
5. Export the new model from `src/index.ts`.

## Writing Query Methods

All query methods must be `async`. Use Drizzle's promise-based API — it works on both dialects:

```typescript
// Fetch one row
const [row] = await db.select().from(myTable).where(eq(myTable.id, id)).limit(1);
return row ? new MyModel(row as Record<string, unknown>) : null;

// Fetch many rows
const rows = await db.select().from(myTable).where(eq(myTable.user_id, userId));
return rows.map((r: Record<string, unknown>) => new MyModel(r));

// Insert / upsert — handled by DBModel.save() via onConflictDoUpdate
// Delete — handled by DBModel.delete()
```

Never use `.get()`, `.run()`, or `.all()` — those are synchronous SQLite-only methods.

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

Both schemas use a `jsonText<T>()` custom column that stores JSON as plain `TEXT`. Do **not** use `json()` or `jsonb()` — they behave differently across dialects and complicate cross-backend data sharing.

```typescript
// SQLite schema:
import { jsonText } from "./helpers.js";
graph: jsonText<WorkflowGraph>()("graph").notNull()

// PostgreSQL schema (same helper, pg-core version):
import { jsonText } from "./helpers.js";
graph: jsonText<WorkflowGraph>()("graph").notNull()
```

## Boolean Columns

SQLite schema uses `integer("col", { mode: "boolean" })` — TypeScript type is `boolean`, comparisons use `true`/`false`.

PostgreSQL schema uses plain `integer("col")` — TypeScript type is `number | null`, comparisons use `0`/`1` or filter in application code.

If your query filters on a boolean-like column, pick the right literal for the schema you're querying against.

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

Tests live in `tests/`. All tests use `initTestDb()` which creates an in-memory SQLite database. No PostgreSQL instance is required.

```bash
npm run test --workspace=packages/models
```

When writing tests for new models, call `initTestDb()` in `beforeEach` to reset state between tests.

## Rules

- All public query methods must be `async`.
- Annotate `.map()` callbacks explicitly: `(r: Record<string, unknown>) => new Model(r)` — `getDb()` returns `any`, so TypeScript cannot infer row types.
- Never import from `dist/`. Use `@nodetool-ai/models` for cross-package imports.
- Keep `src/schema/` (SQLite) and `src/schema-pg/` (PostgreSQL) in sync — columns, names, and types must match.
- `TABLE_COLUMNS` in `db.ts` is generated from `src/schema/` — never hand-edit it. The DDL in
  `getCreateSchemaSql()` is still hand-written and must match `src/schema/`;
  `tests/schema-parity.test.ts` enforces that.
