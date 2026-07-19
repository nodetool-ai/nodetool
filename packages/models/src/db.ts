/**
 * Database connection manager for Drizzle ORM.
 *
 * Supports both SQLite (via better-sqlite3) and PostgreSQL (via postgres.js).
 * Use initDb() for SQLite and initPostgresDb() for Supabase/PostgreSQL.
 */

import Database from "better-sqlite3";
import {
  drizzle as drizzleSqlite,
  type BetterSQLite3Database
} from "drizzle-orm/better-sqlite3";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";
import * as schema from "./schema/index.js";
import * as pgSchema from "./schema-pg/index.js";
import {
  MigrationRunner,
  SQLiteMigrationAdapter
} from "./migrations/index.js";

export type DbDialect = "sqlite" | "postgres";

/**
 * A Drizzle database instance backed by either SQLite (better-sqlite3) or
 * PostgreSQL (postgres.js). The two dialects expose the same query-builder
 * surface (`select`/`insert`/`update`/`delete`), so callers can work with
 * either transparently.
 */
export type NodetoolDatabase =
  | BetterSQLite3Database<typeof schema>
  | PostgresJsDatabase<typeof pgSchema>;

let _db: NodetoolDatabase | null = null;
let _sqlite: Database.Database | null = null;
let _pgClient: Sql | null = null;
let _dbType: DbDialect = "sqlite";

/**
 * Initialize a SQLite database connection with a file path.
 * Configures WAL mode, busy timeout, and synchronous mode.
 */
export function initDb(dbPath: string): BetterSQLite3Database<typeof schema> {
  if (_db && _dbType === "sqlite") return _db as BetterSQLite3Database<typeof schema>;
  if (_db && _dbType === "postgres") {
    throw new Error(
      "A PostgreSQL connection is already active. Call closeDb() before switching to SQLite."
    );
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 30000");
  sqlite.pragma("synchronous = NORMAL");
  _sqlite = sqlite;
  _db = drizzleSqlite(sqlite, { schema });
  _dbType = "sqlite";

  sqlite.exec(getCreateTableStatementsSql());
  addMissingColumns(sqlite);
  sqlite.exec(getCreateIndexStatementsSql());

  return _db as BetterSQLite3Database<typeof schema>;
}

/**
 * Initialize a PostgreSQL database connection.
 * Accepts a connection string (e.g. Supabase DATABASE_URL or DIRECT_URL).
 *
 * For Supabase, use the connection pooler URL (port 6543, transaction mode)
 * for the application, and the direct URL (port 5432) for migrations.
 * Migrations must be run separately via MigrationRunner + PostgresJsMigrationAdapter.
 */
export async function initPostgresDb(connectionString: string): Promise<void> {
  if (_db && _dbType === "postgres") return;
  if (_db && _dbType === "sqlite") {
    throw new Error(
      "A SQLite connection is already active. Call closeDb() before switching to PostgreSQL."
    );
  }

  // Dynamic import so that the `postgres` package is only loaded when needed,
  // keeping the SQLite-only path free of the extra dependency at runtime.
  const { default: postgres } = await import("postgres");
  const { drizzle: drizzlePg } = await import("drizzle-orm/postgres-js");

  const client = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10
  });

  _pgClient = client;
  _db = drizzlePg(client, { schema: pgSchema });
  _dbType = "postgres";
}

/**
 * Initialize an in-memory SQLite database for testing.
 * Creates all tables from the Drizzle schema.
 */
export function initTestDb(): BetterSQLite3Database<typeof schema> {
  if (_sqlite) {
    try {
      _sqlite.close();
    } catch {
      /* ignore */
    }
  }
  const sqlite = new Database(":memory:");
  _sqlite = sqlite;
  _db = drizzleSqlite(sqlite, { schema });
  _dbType = "sqlite";

  sqlite.exec(getCreateTableStatementsSql());
  sqlite.exec(getCreateIndexStatementsSql());

  return _db as BetterSQLite3Database<typeof schema>;
}

/**
 * Get the current database instance.
 *
 * Typed as the SQLite query builder because the two dialects expose the same
 * `select`/`insert`/`update`/`delete` surface and the model layer is written
 * against it (a PostgreSQL connection returns the same API, with promises that
 * the existing `await`s resolve transparently). Throws if not initialized.
 */
export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!_db)
    throw new Error(
      "Database not initialized. Call initDb() or initPostgresDb() first."
    );
  return _db as BetterSQLite3Database<typeof schema>;
}

/**
 * Get the current database dialect.
 */
export function getDbType(): DbDialect {
  return _dbType;
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

/**
 * Verify the database connection is alive with a lightweight query.
 * Dialect-aware: runs `select 1` over the PostgreSQL client, or a
 * `quick_check` pragma against the SQLite connection. Throws if the
 * database is not initialized or the check fails.
 */
export async function pingDb(): Promise<void> {
  if (!_db)
    throw new Error(
      "Database not initialized. Call initDb() or initPostgresDb() first."
    );
  if (_dbType === "postgres") {
    if (!_pgClient) throw new Error("PostgreSQL client not initialized.");
    await _pgClient`select 1`;
    return;
  }
  if (!_sqlite) throw new Error("SQLite database not initialized.");
  // Fast integrity check — just verifies the connection is alive.
  _sqlite.pragma("quick_check(1)");
}

/**
 * Apply pending SQLite migrations to a database file without initializing the
 * global Drizzle connection. Used by local backend startup before initDb().
 */
export async function migrateSqliteDb(dbPath: string): Promise<string[]> {
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
  _db = null;
  _dbType = "sqlite";
}

/**
 * Expected columns per table, used for additive migration on existing SQLite DBs.
 */
const TABLE_COLUMNS: Record<string, Record<string, string>> = {
  nodetool_workflows: {
    id: "text",
    user_id: "text",
    name: "text",
    tool_name: "text",
    description: "text",
    tags: "text",
    thumbnail: "text",
    thumbnail_url: "text",
    graph: "text",
    settings: "text",
    package_name: "text",
    path: "text",
    run_mode: "text",
    workspace_id: "text",
    html_app: "text",
    app_doc: "text",
    receive_clipboard: "integer",
    access: "text",
    created_at: "text",
    updated_at: "text"
  },
  nodetool_jobs: {
    id: "text",
    user_id: "text",
    job_type: "text",
    workflow_id: "text",
    status: "text",
    name: "text",
    graph: "text",
    params: "text",
    worker_id: "text",
    heartbeat_at: "text",
    started_at: "text",
    finished_at: "text",
    completed_at: "text",
    failed_at: "text",
    error: "text",
    error_message: "text",
    cost: "real",
    logs: "text",
    retry_count: "integer",
    max_retries: "integer",
    version: "integer",
    suspended_node_id: "text",
    suspension_reason: "text",
    suspension_state_json: "text",
    suspension_metadata_json: "text",
    execution_strategy: "text",
    execution_id: "text",
    metadata_json: "text",
    created_at: "text",
    updated_at: "text"
  },
  nodetool_messages: {
    id: "text",
    user_id: "text",
    thread_id: "text",
    role: "text",
    name: "text",
    content: "text",
    tool_calls: "text",
    tool_call_id: "text",
    input_files: "text",
    output_files: "text",
    provider: "text",
    model: "text",
    cost: "real",
    workflow_id: "text",
    graph: "text",
    tools: "text",
    collections: "text",
    agent_mode: "integer",
    help_mode: "integer",
    agent_execution_id: "text",
    execution_event_type: "text",
    workflow_target: "text",
    media_generation: "text",
    provider_session: "text",
    created_at: "text"
  },
  nodetool_threads: {
    id: "text",
    user_id: "text",
    workflow_id: "text",
    title: "text",
    created_at: "text",
    updated_at: "text"
  },
  nodetool_assets: {
    id: "text",
    user_id: "text",
    parent_id: "text",
    file_id: "text",
    name: "text",
    content_type: "text",
    size: "real",
    duration: "real",
    metadata: "text",
    sketch_document_id: "text",
    workflow_id: "text",
    node_id: "text",
    job_id: "text",
    timeline_id: "text",
    created_at: "text",
    updated_at: "text"
  },
  nodetool_secrets: {
    id: "text",
    user_id: "text",
    key: "text",
    encrypted_value: "text",
    description: "text",
    created_at: "text",
    updated_at: "text"
  },
  nodetool_workspaces: {
    id: "text",
    user_id: "text",
    name: "text",
    path: "text",
    is_default: "integer",
    created_at: "text",
    updated_at: "text"
  },
  nodetool_workflow_versions: {
    id: "text",
    workflow_id: "text",
    user_id: "text",
    name: "text",
    description: "text",
    graph: "text",
    version: "integer",
    save_type: "text",
    autosave_metadata: "text",
    created_at: "text"
  },
  nodetool_oauth_credentials: {
    id: "text",
    user_id: "text",
    provider: "text",
    account_id: "text",
    encrypted_access_token: "text",
    encrypted_refresh_token: "text",
    username: "text",
    token_type: "text",
    scope: "text",
    received_at: "text",
    expires_at: "text",
    created_at: "text",
    updated_at: "text"
  },
  run_node_state: {
    id: "text",
    run_id: "text",
    node_id: "text",
    status: "text",
    attempt: "integer",
    scheduled_at: "text",
    started_at: "text",
    completed_at: "text",
    failed_at: "text",
    suspended_at: "text",
    updated_at: "text",
    last_error: "text",
    retryable: "integer",
    suspension_reason: "text",
    resume_state_json: "text",
    outputs_json: "text"
  },
  nodetool_predictions: {
    id: "text",
    user_id: "text",
    node_id: "text",
    node_type: "text",
    provider: "text",
    model: "text",
    workflow_id: "text",
    error: "text",
    logs: "text",
    status: "text",
    cost: "real",
    input_tokens: "integer",
    output_tokens: "integer",
    total_tokens: "integer",
    cached_tokens: "integer",
    reasoning_tokens: "integer",
    billing_unit: "text",
    quantity: "real",
    unit_price: "real",
    currency: "text",
    provider_request_id: "text",
    created_at: "text",
    started_at: "text",
    completed_at: "text",
    duration: "real",
    hardware: "text",
    input_size: "integer",
    output_size: "integer",
    parameters: "text",
    metadata: "text"
  },
  run_events: {
    id: "text",
    run_id: "text",
    seq: "integer",
    event_type: "text",
    event_time: "text",
    node_id: "text",
    payload: "text"
  },
  run_leases: {
    run_id: "text",
    worker_id: "text",
    acquired_at: "text",
    expires_at: "text"
  },
  nodetool_team_tasks: {
    id: "text",
    team_id: "text",
    title: "text",
    description: "text",
    status: "text",
    created_by: "text",
    claimed_by: "text",
    depends_on: "text",
    required_skills: "text",
    priority: "integer",
    artifacts: "text",
    parent_task_id: "text",
    result: "text",
    failure_reason: "text",
    created_at: "text",
    updated_at: "text"
  },
  nodetool_settings: {
    id: "text",
    user_id: "text",
    key: "text",
    value: "text",
    description: "text",
    created_at: "text",
    updated_at: "text"
  },
  timeline_sequences: {
    id: "text",
    user_id: "text",
    project_id: "text",
    workflow_id: "text",
    name: "text",
    fps: "integer",
    width: "integer",
    height: "integer",
    duration_ms: "integer",
    document: "text",
    created_at: "text",
    updated_at: "text"
  },
  nodetool_workflow_collaborators: {
    id: "text",
    workflow_id: "text",
    user_id: "text",
    role: "text",
    invited_by: "text",
    created_at: "text"
  },
  nodetool_workflow_shares: {
    id: "text",
    workflow_id: "text",
    token: "text",
    role: "text",
    created_by: "text",
    created_at: "text",
    revoked_at: "text"
  }
};

function addMissingColumns(sqlite: Database.Database): void {
  for (const [tableName, expectedCols] of Object.entries(TABLE_COLUMNS)) {
    const existingCols = new Set(
      (
        sqlite.pragma(`table_info("${tableName}")`) as Array<{ name: string }>
      ).map((row) => row.name)
    );

    for (const [colName, colType] of Object.entries(expectedCols)) {
      if (!existingCols.has(colName)) {
        sqlite.exec(
          `ALTER TABLE "${tableName}" ADD COLUMN "${colName}" ${colType}`
        );
      }
    }
  }
}

function getCreateSchemaSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS "nodetool_workflows" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "name" text NOT NULL DEFAULT '',
      "tool_name" text,
      "description" text DEFAULT '',
      "tags" text,
      "thumbnail" text,
      "thumbnail_url" text,
      "graph" text NOT NULL,
      "settings" text,
      "package_name" text,
      "path" text,
      "run_mode" text,
      "workspace_id" text,
      "html_app" text,
      "app_doc" text,
      "receive_clipboard" integer,
      "access" text NOT NULL DEFAULT 'private',
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_workflows_user_id" ON "nodetool_workflows" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_workflows_access" ON "nodetool_workflows" ("access");

    CREATE TABLE IF NOT EXISTS "nodetool_jobs" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "job_type" text NOT NULL DEFAULT '',
      "workflow_id" text NOT NULL,
      "status" text NOT NULL DEFAULT 'scheduled',
      "name" text DEFAULT '',
      "graph" text,
      "params" text,
      "worker_id" text,
      "heartbeat_at" text,
      "started_at" text,
      "finished_at" text,
      "completed_at" text,
      "failed_at" text,
      "error" text,
      "error_message" text,
      "cost" real,
      "logs" text,
      "retry_count" integer NOT NULL DEFAULT 0,
      "max_retries" integer NOT NULL DEFAULT 3,
      "version" integer NOT NULL DEFAULT 0,
      "suspended_node_id" text,
      "suspension_reason" text,
      "suspension_state_json" text,
      "suspension_metadata_json" text,
      "execution_strategy" text,
      "execution_id" text,
      "metadata_json" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_jobs_status" ON "nodetool_jobs" ("status");
    CREATE INDEX IF NOT EXISTS "idx_jobs_updated_at" ON "nodetool_jobs" ("updated_at");
    CREATE INDEX IF NOT EXISTS "idx_jobs_worker_id" ON "nodetool_jobs" ("worker_id");
    CREATE INDEX IF NOT EXISTS "idx_jobs_heartbeat_at" ON "nodetool_jobs" ("heartbeat_at");
    CREATE INDEX IF NOT EXISTS "idx_jobs_recovery" ON "nodetool_jobs" ("status", "heartbeat_at");

    CREATE TABLE IF NOT EXISTS "nodetool_messages" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "thread_id" text NOT NULL,
      "role" text NOT NULL DEFAULT 'user',
      "name" text,
      "content" text,
      "tool_calls" text,
      "tool_call_id" text,
      "input_files" text,
      "output_files" text,
      "provider" text,
      "model" text,
      "cost" real,
      "workflow_id" text,
      "graph" text,
      "tools" text,
      "collections" text,
      "agent_mode" integer,
      "help_mode" integer,
      "agent_execution_id" text,
      "execution_event_type" text,
      "workflow_target" text,
      "media_generation" text,
      "provider_session" text,
      "created_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_messages_thread_id" ON "nodetool_messages" ("thread_id");

    CREATE TABLE IF NOT EXISTS "nodetool_threads" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "workflow_id" text,
      "title" text NOT NULL DEFAULT '',
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_threads_user_id" ON "nodetool_threads" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_threads_user_workflow" ON "nodetool_threads" ("user_id", "workflow_id");

    CREATE TABLE IF NOT EXISTS "nodetool_assets" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "parent_id" text,
      "file_id" text,
      "name" text NOT NULL DEFAULT '',
      "content_type" text NOT NULL DEFAULT 'application/octet-stream',
      "size" real,
      "duration" real,
      "metadata" text,
      "sketch_document_id" text,
      "workflow_id" text,
      "node_id" text,
      "job_id" text,
      "timeline_id" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_assets_user_parent" ON "nodetool_assets" ("user_id", "parent_id");

    CREATE TABLE IF NOT EXISTS "nodetool_secrets" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "key" text NOT NULL,
      "encrypted_value" text NOT NULL,
      "description" text DEFAULT '',
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_secrets_user_key" ON "nodetool_secrets" ("user_id", "key");
    CREATE INDEX IF NOT EXISTS "idx_secrets_user_id" ON "nodetool_secrets" ("user_id");

    CREATE TABLE IF NOT EXISTS "nodetool_workspaces" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "name" text NOT NULL DEFAULT '',
      "path" text NOT NULL DEFAULT '',
      "is_default" integer DEFAULT 0,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_workspaces_user_id" ON "nodetool_workspaces" ("user_id");

    CREATE TABLE IF NOT EXISTS "nodetool_workflow_versions" (
      "id" text PRIMARY KEY NOT NULL,
      "workflow_id" text NOT NULL,
      "user_id" text NOT NULL,
      "name" text,
      "description" text,
      "graph" text NOT NULL,
      "version" integer NOT NULL DEFAULT 1,
      "save_type" text NOT NULL DEFAULT 'manual',
      "autosave_metadata" text,
      "created_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_wv_workflow_id" ON "nodetool_workflow_versions" ("workflow_id");
    CREATE INDEX IF NOT EXISTS "idx_wv_user_id" ON "nodetool_workflow_versions" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_nodetool_workflow_versions_workflow_id_save_type_created_at" ON "nodetool_workflow_versions" ("workflow_id", "save_type", "created_at");

    CREATE TABLE IF NOT EXISTS "nodetool_oauth_credentials" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "provider" text NOT NULL,
      "account_id" text NOT NULL,
      "encrypted_access_token" text NOT NULL,
      "encrypted_refresh_token" text,
      "username" text,
      "token_type" text NOT NULL DEFAULT 'Bearer',
      "scope" text,
      "received_at" text NOT NULL,
      "expires_at" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_oauth_user_id" ON "nodetool_oauth_credentials" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_oauth_user_provider" ON "nodetool_oauth_credentials" ("user_id", "provider");
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_oauth_user_provider_account" ON "nodetool_oauth_credentials" ("user_id", "provider", "account_id");

    CREATE TABLE IF NOT EXISTS "run_node_state" (
      "id" text PRIMARY KEY NOT NULL,
      "run_id" text NOT NULL,
      "node_id" text NOT NULL,
      "status" text NOT NULL DEFAULT 'idle',
      "attempt" integer NOT NULL DEFAULT 1,
      "scheduled_at" text,
      "started_at" text,
      "completed_at" text,
      "failed_at" text,
      "suspended_at" text,
      "updated_at" text NOT NULL,
      "last_error" text,
      "retryable" integer NOT NULL DEFAULT 0,
      "suspension_reason" text,
      "resume_state_json" text,
      "outputs_json" text
    );
    CREATE INDEX IF NOT EXISTS "idx_run_node_state_run_status" ON "run_node_state" ("run_id", "status");
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_run_node_state_run_node" ON "run_node_state" ("run_id", "node_id");

    CREATE TABLE IF NOT EXISTS "nodetool_predictions" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "node_id" text NOT NULL DEFAULT '',
      "node_type" text NOT NULL DEFAULT '',
      "provider" text NOT NULL DEFAULT '',
      "model" text NOT NULL DEFAULT '',
      "workflow_id" text,
      "error" text,
      "logs" text,
      "status" text NOT NULL DEFAULT 'pending',
      "cost" real,
      "input_tokens" integer,
      "output_tokens" integer,
      "total_tokens" integer,
      "cached_tokens" integer,
      "reasoning_tokens" integer,
      "billing_unit" text,
      "quantity" real,
      "unit_price" real,
      "currency" text,
      "provider_request_id" text,
      "created_at" text,
      "started_at" text,
      "completed_at" text,
      "duration" real,
      "hardware" text,
      "input_size" integer,
      "output_size" integer,
      "parameters" text,
      "metadata" text
    );
    CREATE INDEX IF NOT EXISTS "idx_predictions_user_id" ON "nodetool_predictions" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_predictions_user_provider" ON "nodetool_predictions" ("user_id", "provider");
    CREATE INDEX IF NOT EXISTS "idx_prediction_created_at" ON "nodetool_predictions" ("created_at");
    CREATE INDEX IF NOT EXISTS "idx_prediction_user_model" ON "nodetool_predictions" ("user_id", "model");

    CREATE TABLE IF NOT EXISTS "run_events" (
      "id" text PRIMARY KEY NOT NULL,
      "run_id" text NOT NULL,
      "seq" integer NOT NULL,
      "event_type" text NOT NULL,
      "event_time" text NOT NULL,
      "node_id" text,
      "payload" text
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_run_events_run_seq" ON "run_events" ("run_id", "seq");
    CREATE INDEX IF NOT EXISTS "idx_run_events_run_node" ON "run_events" ("run_id", "node_id");
    CREATE INDEX IF NOT EXISTS "idx_run_events_run_type" ON "run_events" ("run_id", "event_type");

    CREATE TABLE IF NOT EXISTS "run_leases" (
      "run_id" text PRIMARY KEY NOT NULL,
      "worker_id" text NOT NULL,
      "acquired_at" text NOT NULL,
      "expires_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_run_leases_expires" ON "run_leases" ("expires_at");

    CREATE TABLE IF NOT EXISTS "nodetool_team_tasks" (
      "id" text PRIMARY KEY NOT NULL,
      "team_id" text NOT NULL,
      "title" text NOT NULL,
      "description" text NOT NULL DEFAULT '',
      "status" text NOT NULL DEFAULT 'open',
      "created_by" text NOT NULL,
      "claimed_by" text,
      "depends_on" text NOT NULL,
      "required_skills" text NOT NULL,
      "priority" integer NOT NULL DEFAULT 5,
      "artifacts" text NOT NULL,
      "parent_task_id" text,
      "result" text,
      "failure_reason" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_team_tasks_team_id" ON "nodetool_team_tasks" ("team_id");
    CREATE INDEX IF NOT EXISTS "idx_team_tasks_status" ON "nodetool_team_tasks" ("status");
    CREATE INDEX IF NOT EXISTS "idx_team_tasks_team_status" ON "nodetool_team_tasks" ("team_id", "status");
    CREATE INDEX IF NOT EXISTS "idx_team_tasks_parent" ON "nodetool_team_tasks" ("parent_task_id");

    CREATE TABLE IF NOT EXISTS "nodetool_settings" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "key" text NOT NULL,
      "value" text NOT NULL,
      "description" text DEFAULT '',
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_settings_user_key" ON "nodetool_settings" ("user_id", "key");
    CREATE INDEX IF NOT EXISTS "idx_settings_user_id" ON "nodetool_settings" ("user_id");

    CREATE TABLE IF NOT EXISTS "timeline_sequences" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "project_id" text NOT NULL,
      "workflow_id" text,
      "name" text NOT NULL,
      "fps" integer NOT NULL DEFAULT 30,
      "width" integer NOT NULL DEFAULT 1920,
      "height" integer NOT NULL DEFAULT 1080,
      "duration_ms" integer NOT NULL DEFAULT 0,
      "document" text NOT NULL,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_timeline_sequence_user" ON "timeline_sequences" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_timeline_sequence_project" ON "timeline_sequences" ("project_id");
    CREATE INDEX IF NOT EXISTS "idx_timeline_sequence_updated" ON "timeline_sequences" ("updated_at");
    CREATE TABLE IF NOT EXISTS "image_documents" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "project_id" text NOT NULL,
      "workflow_id" text,
      "name" text NOT NULL,
      "width" integer NOT NULL DEFAULT 1024,
      "height" integer NOT NULL DEFAULT 1024,
      "background_color" text NOT NULL DEFAULT '#ffffff',
      "document" text NOT NULL,
      "thumbnail_asset_id" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_image_document_user" ON "image_documents" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_image_document_project" ON "image_documents" ("project_id");
    CREATE INDEX IF NOT EXISTS "idx_image_document_updated" ON "image_documents" ("updated_at");
    CREATE TABLE IF NOT EXISTS "worker_profiles" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "target" text NOT NULL,
      "image" text NOT NULL,
      "spec" text NOT NULL,
      "token_policy" text NOT NULL,
      "idle_timeout_minutes" integer,
      "max_lifetime_minutes" integer,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_worker_profiles_name" ON "worker_profiles" ("name");
    CREATE TABLE IF NOT EXISTS "worker_instances" (
      "id" text PRIMARY KEY NOT NULL,
      "profile_name" text NOT NULL,
      "target" text NOT NULL,
      "provider_ref" text NOT NULL,
      "ws_url" text NOT NULL,
      "encrypted_token" text,
      "status" text NOT NULL,
      "attached_to" text,
      "created_at" text NOT NULL,
      "last_activity_at" text NOT NULL,
      "estimated_cost_usd" real
    );
    CREATE INDEX IF NOT EXISTS "idx_worker_instances_status" ON "worker_instances" ("status");
    CREATE INDEX IF NOT EXISTS "idx_worker_instances_profile_name" ON "worker_instances" ("profile_name");

    CREATE TABLE IF NOT EXISTS "run_inbox_messages" (
      "id" text PRIMARY KEY NOT NULL,
      "message_id" text NOT NULL,
      "run_id" text NOT NULL,
      "node_id" text NOT NULL,
      "handle" text NOT NULL,
      "msg_seq" integer NOT NULL,
      "payload_json" text,
      "payload_ref" text,
      "status" text NOT NULL,
      "claim_worker_id" text,
      "claim_expires_at" text,
      "consumed_at" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_inbox_run_node_handle_seq" ON "run_inbox_messages" ("run_id", "node_id", "handle", "msg_seq");
    CREATE INDEX IF NOT EXISTS "idx_inbox_run_node_handle_status" ON "run_inbox_messages" ("run_id", "node_id", "handle", "status");
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_inbox_message_id" ON "run_inbox_messages" ("message_id");

    CREATE TABLE IF NOT EXISTS "trigger_inputs" (
      "id" text PRIMARY KEY NOT NULL,
      "input_id" text NOT NULL,
      "run_id" text NOT NULL,
      "node_id" text NOT NULL,
      "payload_json" text,
      "processed" integer NOT NULL DEFAULT 0,
      "processed_at" text,
      "cursor" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_trigger_input_run_node_processed" ON "trigger_inputs" ("run_id", "node_id", "processed");
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_trigger_input_id" ON "trigger_inputs" ("input_id");

    CREATE TABLE IF NOT EXISTS "trigger_registrations" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "workflow_id" text NOT NULL,
      "node_id" text NOT NULL,
      "kind" text NOT NULL,
      "config_json" text,
      "enabled" integer NOT NULL DEFAULT 1,
      "cursor" text,
      "last_fired_at" text,
      "last_error" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_trigger_reg_workflow" ON "trigger_registrations" ("workflow_id");
    CREATE INDEX IF NOT EXISTS "idx_trigger_reg_kind_enabled" ON "trigger_registrations" ("kind", "enabled");
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_trigger_reg_workflow_node" ON "trigger_registrations" ("workflow_id", "node_id");

    CREATE TABLE IF NOT EXISTS "nodetool_workflow_collaborators" (
      "id" text PRIMARY KEY NOT NULL,
      "workflow_id" text NOT NULL,
      "user_id" text NOT NULL,
      "role" text NOT NULL DEFAULT 'viewer',
      "invited_by" text NOT NULL,
      "created_at" text NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_wcol_workflow_user" ON "nodetool_workflow_collaborators" ("workflow_id", "user_id");
    CREATE INDEX IF NOT EXISTS "idx_wcol_user_id" ON "nodetool_workflow_collaborators" ("user_id");

    CREATE TABLE IF NOT EXISTS "nodetool_workflow_shares" (
      "id" text PRIMARY KEY NOT NULL,
      "workflow_id" text NOT NULL,
      "token" text NOT NULL,
      "role" text NOT NULL DEFAULT 'viewer',
      "created_by" text NOT NULL,
      "created_at" text NOT NULL,
      "revoked_at" text
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_wshare_token" ON "nodetool_workflow_shares" ("token");
    CREATE INDEX IF NOT EXISTS "idx_wshare_workflow_id" ON "nodetool_workflow_shares" ("workflow_id");

    CREATE TABLE IF NOT EXISTS "storyboards" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "project_id" text NOT NULL,
      "name" text NOT NULL,
      "document" text NOT NULL,
      "timeline_id" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_storyboard_user" ON "storyboards" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_storyboard_project" ON "storyboards" ("project_id");
    CREATE INDEX IF NOT EXISTS "idx_storyboard_updated" ON "storyboards" ("updated_at");

    CREATE TABLE IF NOT EXISTS "scripts" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "project_id" text NOT NULL,
      "name" text NOT NULL,
      "document" text NOT NULL,
      "timeline_id" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_script_user" ON "scripts" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_script_project" ON "scripts" ("project_id");
    CREATE INDEX IF NOT EXISTS "idx_script_updated" ON "scripts" ("updated_at");
  `;
}

function getCreateTableStatementsSql(): string {
  return getCreateSchemaSql()
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.startsWith("CREATE TABLE"))
    .join(";\n");
}

function getCreateIndexStatementsSql(): string {
  return getCreateSchemaSql()
    .split(";")
    .map((statement) => statement.trim())
    .filter(
      (statement) =>
        statement.startsWith("CREATE INDEX") ||
        statement.startsWith("CREATE UNIQUE INDEX")
    )
    .join(";\n");
}
