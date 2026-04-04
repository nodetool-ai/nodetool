/**
 * Database connection manager for Drizzle ORM.
 *
 * Replaces SQLiteAdapterFactory + setGlobalAdapterResolver() with a
 * single module-level connection.
 */

import Database from "better-sqlite3";
import {
  drizzle,
  type BetterSQLite3Database
} from "drizzle-orm/better-sqlite3";
import * as schema from "./schema/index.js";

let _db: BetterSQLite3Database<typeof schema> | null = null;
let _sqlite: Database.Database | null = null;

/**
 * Initialize the database connection with a file path.
 * Configures WAL mode, busy timeout, and synchronous mode.
 */
export function initDb(dbPath: string): BetterSQLite3Database<typeof schema> {
  if (_db) return _db;
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 30000");
  sqlite.pragma("synchronous = NORMAL");
  _sqlite = sqlite;
  _db = drizzle(sqlite, { schema });

  sqlite.exec(getCreateTableStatementsSql());

  // Add any columns that exist in the schema but are missing from existing tables.
  // This preserves the old sqlite-adapter's additive migration behavior for upgrades.
  addMissingColumns(sqlite);

  sqlite.exec(getCreateIndexStatementsSql());

  return _db;
}

/**
 * Initialize an in-memory database for testing.
 * Creates all tables from the Drizzle schema.
 */
export function initTestDb(): BetterSQLite3Database<typeof schema> {
  // Close existing connection if any
  if (_sqlite) {
    try {
      _sqlite.close();
    } catch {
      /* ignore */
    }
  }
  const sqlite = new Database(":memory:");
  _sqlite = sqlite;
  _db = drizzle(sqlite, { schema });

  sqlite.exec(getCreateTableStatementsSql());
  sqlite.exec(getCreateIndexStatementsSql());

  return _db;
}

/**
 * Get the current database instance.
 * Throws if not initialized.
 */
export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!_db)
    throw new Error(
      "Database not initialized. Call initDb() or initTestDb() first."
    );
  return _db;
}

/**
 * Get the underlying better-sqlite3 Database instance for raw queries.
 */
export function getRawDb(): Database.Database {
  if (!_sqlite)
    throw new Error(
      "Database not initialized. Call initDb() or initTestDb() first."
    );
  return _sqlite;
}

/**
 * Close the database connection and reset state.
 */
export function closeDb(): void {
  if (_sqlite) {
    try {
      _sqlite.close();
    } catch {
      /* ignore */
    }
    _sqlite = null;
  }
  _db = null;
}

/**
 * Expected columns per table, used for additive migration on existing DBs.
 * Each entry maps column name → SQLite column type string (used in ALTER TABLE ADD COLUMN).
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
    created_at: "text"
  },
  nodetool_threads: {
    id: "text",
    user_id: "text",
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
    workflow_id: "text",
    node_id: "text",
    job_id: "text",
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
  }
};

/**
 * For each table that already exists, add any columns defined in the schema
 * but missing from the on-disk table.  This replicates the old
 * `SQLiteAdapter.createTable()` behaviour that ran
 * `ALTER TABLE … ADD COLUMN` for every new column.
 */
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

/**
 * Generate CREATE TABLE SQL for all schema tables.
 * Used by initTestDb to set up in-memory databases.
 */
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
      "created_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_messages_thread_id" ON "nodetool_messages" ("thread_id");

    CREATE TABLE IF NOT EXISTS "nodetool_threads" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "title" text NOT NULL DEFAULT '',
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_threads_user_id" ON "nodetool_threads" ("user_id");

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
      "workflow_id" text,
      "node_id" text,
      "job_id" text,
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
