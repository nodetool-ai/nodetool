/**
 * Database connection manager for Drizzle ORM.
 *
 * Supports both SQLite (via better-sqlite3) and PostgreSQL (via postgres.js).
 * Use initDb() for SQLite and initPostgresDb() for Supabase/PostgreSQL.
 */

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  drizzle as drizzleSqlite,
  type BetterSQLite3Database
} from "drizzle-orm/better-sqlite3";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { Sql } from "postgres";
import * as schema from "./schema/index.js";
import * as pgSchema from "./schema-pg/index.js";
import {
  MIGRATION_TRACKING_TABLE,
  MIGRATION_LOCK_TABLE
} from "./migrations/state.js";
import { MigrationRunner, SQLiteMigrationAdapter } from "./migrations/index.js";
import { POST_BASELINE_TABLE_DDL } from "./migrations/versions.js";
import {
  applySqliteBaseline,
  SQLITE_BASELINE_VERSION
} from "./migrations/sqlite-baseline.js";
export {
  TABLE_COLUMNS,
  getCreateSchemaSql
} from "./migrations/sqlite-baseline.js";

/**
 * better-sqlite3 refuses to create a database file whose parent directory
 * does not exist yet ("Cannot open database because the directory does not
 * exist") — a first run on a fresh machine (a new CI container, a fresh
 * install) hits this before anything else has had a chance to create the
 * data directory. `:memory:` has no parent directory to create.
 */
function ensureDbDirExists(dbPath: string): void {
  if (dbPath === ":memory:") return;
  mkdirSync(dirname(dbPath), { recursive: true });
}

export type DbDialect = "sqlite" | "postgres";

/**
 * A Drizzle database instance backed by either SQLite (better-sqlite3) or
 * PostgreSQL (postgres.js). The two dialects expose the same query-builder
 * surface (`select`/`insert`/`update`/`delete`), so callers can work with
 * either transparently.
 */
export type NodetoolDatabase =
  | BetterSQLite3Database<typeof schema>
  | PgDatabase<PgQueryResultHKT, typeof pgSchema>;

export type DatabaseConnection =
  | {
      dialect: "sqlite";
      db: BetterSQLite3Database<typeof schema>;
      schema: typeof schema;
    }
  | {
      dialect: "postgres";
      db: PgDatabase<PgQueryResultHKT, typeof pgSchema>;
      schema: typeof pgSchema;
    };

let _connection: DatabaseConnection | null = null;
let _sqlite: Database.Database | null = null;
let _pgClient: Sql | null = null;
let _closeTestConnection: (() => Promise<void>) | null = null;
let _allowLegacyProjectWritesForTests = false;

/**
 * Initialize a SQLite database connection with a file path.
 * Configures WAL mode, busy timeout, and synchronous mode.
 */
export function initDb(dbPath: string): BetterSQLite3Database<typeof schema> {
  _allowLegacyProjectWritesForTests = false;
  if (_connection?.dialect === "sqlite") return _connection.db;
  if (_connection?.dialect === "postgres") {
    throw new Error(
      "A PostgreSQL connection is already active. Call closeDb() before switching to SQLite."
    );
  }
  ensureDbDirExists(dbPath);
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 30000");
  sqlite.pragma("synchronous = NORMAL");
  try {
    initializeSqliteBaseline(sqlite);
  } catch (error) {
    sqlite.close();
    throw error;
  }
  _sqlite = sqlite;
  const db = drizzleSqlite(sqlite, { schema });
  _connection = { dialect: "sqlite", db, schema };

  return db;
}

const DEFAULT_PG_POOL_MAX = 10;
const TRANSACTION_POOLER_PORT = "6543";

export interface PostgresClientOptions {
  max: number;
  idle_timeout: number;
  connect_timeout: number;
  prepare: boolean;
}

/**
 * Options for the application's postgres.js client.
 *
 * `DATABASE_POOL_MAX` caps the connections one process opens. A Supabase
 * session-mode pooler gives every client its own server connection and
 * rejects a new one with `EMAXCONNSESSION` once its pool size is reached, so
 * the cap times the number of server processes must stay under that size.
 *
 * Port 6543 is Supabase's transaction-mode pooler, which shares server
 * connections between clients and cannot keep named prepared statements
 * across transactions, so prepared statements are turned off there.
 */
export function resolvePostgresClientOptions(
  connectionString: string,
  env: NodeJS.ProcessEnv = process.env
): PostgresClientOptions {
  const rawMax = env["DATABASE_POOL_MAX"]?.trim();
  let max = DEFAULT_PG_POOL_MAX;
  if (rawMax) {
    max = Number(rawMax);
    if (!Number.isInteger(max) || max < 1) {
      throw new Error(
        `DATABASE_POOL_MAX must be a positive integer, got "${rawMax}".`
      );
    }
  }
  let port = "";
  try {
    port = new URL(connectionString).port;
  } catch {
    /* postgres.js reports a malformed URL itself */
  }
  return {
    max,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: port !== TRANSACTION_POOLER_PORT
  };
}

/**
 * Initialize a PostgreSQL database connection.
 * Accepts a connection string (e.g. Supabase DATABASE_URL or DIRECT_URL).
 *
 * For Supabase, use the connection pooler URL (port 6543, transaction mode)
 * for the application, and the direct URL (port 5432) for migrations.
 * Migrations must be run separately via MigrationRunner + PostgresJsMigrationAdapter.
 * See {@link resolvePostgresClientOptions} for the pool size and pooler mode.
 */
export async function initPostgresDb(connectionString: string): Promise<void> {
  _allowLegacyProjectWritesForTests = false;
  if (_connection?.dialect === "postgres") return;
  if (_connection?.dialect === "sqlite") {
    throw new Error(
      "A SQLite connection is already active. Call closeDb() before switching to PostgreSQL."
    );
  }

  // Dynamic import so that the `postgres` package is only loaded when needed,
  // keeping the SQLite-only path free of the extra dependency at runtime.
  const { default: postgres } = await import("postgres");
  const { drizzle: drizzlePg } = await import("drizzle-orm/postgres-js");

  const client = postgres(
    connectionString,
    resolvePostgresClientOptions(connectionString)
  );

  _pgClient = client;
  _connection = {
    dialect: "postgres",
    db: drizzlePg(client, { schema: pgSchema }),
    schema: pgSchema
  };
}

/**
 * Initialize an in-memory SQLite database for testing.
 * Creates all tables from the Drizzle schema.
 */
export function initTestDb(
  options: { strictProjects?: boolean } = {}
): BetterSQLite3Database<typeof schema> {
  _allowLegacyProjectWritesForTests = options.strictProjects !== true;
  if (_sqlite) {
    try {
      _sqlite.close();
    } catch {
      /* ignore */
    }
  }
  const sqlite = new Database(":memory:");
  try {
    initializeSqliteBaseline(sqlite);
    for (const statement of POST_BASELINE_TABLE_DDL) sqlite.exec(statement);
  } catch (error) {
    sqlite.close();
    throw error;
  }
  _sqlite = sqlite;
  const db = drizzleSqlite(sqlite, { schema });
  _connection = { dialect: "sqlite", db, schema };

  return db;
}

/** Install an isolated test driver without adding it to production dependencies. */
export function setTestDatabaseConnection(
  connection: DatabaseConnection,
  close: () => Promise<void>
): void {
  if (_connection) {
    throw new Error("Call closeDb() before installing a test connection.");
  }
  _allowLegacyProjectWritesForTests = false;
  _connection = connection;
  _closeTestConnection = close;
}

/** Compatibility for old fixtures that predate project rows. Never enabled outside initTestDb. */
export function allowLegacyProjectWritesForTests(): boolean {
  return _allowLegacyProjectWritesForTests;
}

/** The active driver and its own schema. Narrow the dialect before querying. */
export function getDatabase(): DatabaseConnection {
  if (!_connection) {
    throw new Error("Database not initialized. Call initDb() or initPostgresDb() first.");
  }
  return _connection;
}

/**
 * The shared asynchronous query-builder surface implemented by both drivers.
 *
 * The SQLite projection types select, insert, update, delete, where, returning,
 * and onConflictDoUpdate builders. Await their execution. Column codecs match
 * the PostgreSQL declarations, so ordinary CRUD shares the SQLite schema.
 * Synchronous get/run/all methods, transactions, and row locks are outside this
 * contract. Use getDatabase() and narrow its dialect for those operations.
 */
export function getPortableDb(): BetterSQLite3Database<typeof schema> {
  return getDatabase().db as BetterSQLite3Database<typeof schema>;
}

/** @deprecated Use getPortableDb(). Retained for one release for public API compatibility. */
export const getDb = getPortableDb;

/**
 * The transaction handle a `db.transaction` callback receives.
 *
 * This type describes synchronous SQLite callbacks. Use the narrowed
 * getDatabase().db.transaction callback for PostgreSQL transaction types.
 */
export type DbTransaction = Parameters<
  Parameters<BetterSQLite3Database<typeof schema>["transaction"]>[0]
>[0];

/**
 * Adds `FOR UPDATE` row locking to a select, on the Postgres branch.
 *
 * Row locks are outside the {@link getPortableDb} contract. Use this helper
 * only after narrowing the active connection to PostgreSQL. It throws when
 * the query builder cannot lock rows.
 */
export function forUpdate<Q>(query: Q): Q {
  const lockable = query as { for?: (mode: "update") => Q };
  if (!lockable.for) {
    throw new Error(
      "forUpdate() requires a Postgres query builder; branch on getDbType()."
    );
  }
  return lockable.for("update");
}

export function getDbType(): DbDialect {
  return _connection?.dialect ?? "sqlite";
}

/**
 * Get the underlying better-sqlite3 Database instance for raw queries.
 * Only available when using SQLite.
 */
export function getRawDb(): Database.Database {
  if (!_sqlite)
    throw new Error(
      "SQLite database not initialized. Raw access is only available for SQLite."
    );
  return _sqlite;
}

/** Execute dynamic SQL against the active database connection. */
export async function executeRaw(sql: string): Promise<{ rows: unknown[] }> {
  if (_connection?.dialect === "postgres") {
    if (!_pgClient) throw new Error("PostgreSQL database not initialized.");
    return { rows: await _pgClient.unsafe(sql) };
  }
  if (!_sqlite) throw new Error("SQLite database not initialized.");
  return { rows: _sqlite.prepare(sql).all() as unknown[] };
}

/**
 * Verify the database connection is alive with a lightweight query.
 * Dialect-aware: runs `select 1` over the active client. Throws if the
 * database is not initialized or the query fails.
 *
 * This is called by the process watchdog every 30 seconds. Do not use an
 * SQLite integrity pragma here: `quick_check` scans the database and can hold
 * the synchronous connection for several seconds on a large local database.
 */
export async function pingDb(): Promise<void> {
  if (!_connection)
    throw new Error(
      "Database not initialized. Call initDb() or initPostgresDb() first."
    );
  if (_connection?.dialect === "postgres") {
    if (!_pgClient) throw new Error("PostgreSQL client not initialized.");
    await _pgClient`select 1`;
    return;
  }
  if (!_sqlite) throw new Error("SQLite database not initialized.");
  _sqlite.prepare("select 1").get();
}

/**
 * Apply pending SQLite migrations to a database file without initializing the
 * global Drizzle connection. Used by local backend startup before initDb().
 */
export async function migrateSqliteDb(dbPath: string): Promise<string[]> {
  ensureDbDirExists(dbPath);
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 30000");
  sqlite.pragma("synchronous = NORMAL");

  try {
    const adapter = new SQLiteMigrationAdapter(sqlite);
    const runner = new MigrationRunner(adapter);
    return await runner.migrate();
  } finally {
    sqlite.close();
  }
}

/**
 * Close the database connection and reset state.
 * For PostgreSQL, returns a Promise that resolves once the connection pool is drained.
 */
export async function closeDb(): Promise<void> {
  if (_sqlite) {
    try {
      _sqlite.close();
    } catch {
      /* ignore */
    }
    _sqlite = null;
  }
  if (_pgClient) {
    try {
      await _pgClient.end();
    } catch {
      /* ignore */
    }
    _pgClient = null;
  }
  const closeTestConnection = _closeTestConnection;
  _closeTestConnection = null;
  _connection = null;
  if (closeTestConnection) {
    await closeTestConnection();
  }
}

/** Synchronous callers apply only the pinned compatibility migration. Historical data migrations remain pending. */
function initializeSqliteBaseline(sqlite: Database.Database): void {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS ${MIGRATION_TRACKING_TABLE} (
    version TEXT PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL, execution_time_ms INTEGER NOT NULL, baselined INTEGER DEFAULT 0
  )`);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS ${MIGRATION_LOCK_TABLE} (
    id INTEGER PRIMARY KEY CHECK (id = 1), locked_at TEXT, locked_by TEXT
  ); INSERT OR IGNORE INTO ${MIGRATION_LOCK_TABLE} (id) VALUES (1)`);
  if (
    sqlite
      .prepare(
        `SELECT version FROM ${MIGRATION_TRACKING_TABLE} WHERE version = ?`
      )
      .get(SQLITE_BASELINE_VERSION)
  ) {
    return;
  }
  const migration = new MigrationRunner(new SQLiteMigrationAdapter(sqlite))
    .discoverMigrations()
    .find((entry) => entry.version === SQLITE_BASELINE_VERSION);
  if (!migration) {
    throw new Error(
      "The SQLite baseline migration is missing from the migration catalog."
    );
  }
  sqlite.transaction(() => {
    applySqliteBaseline(sqlite);
    sqlite
      .prepare(
        `INSERT INTO ${MIGRATION_TRACKING_TABLE} (version, name, checksum, applied_at, execution_time_ms, baselined) VALUES (?, ?, ?, ?, 0, 0)`
      )
      .run(
        migration.version,
        migration.name,
        migration.checksum,
        new Date().toISOString()
      );
  })();
}
