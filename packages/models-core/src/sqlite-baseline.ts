/** Frozen execution-table subset of SQLite baseline 20261001_000000. */
export const SQLITE_CORE_BASELINE_SQL = `
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
      "project_id" text NOT NULL DEFAULT 'default',
      "html_app" text,
      "app_doc" text,
      "receive_clipboard" integer,
      "access" text NOT NULL DEFAULT 'private',
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_workflows_user_id" ON "nodetool_workflows" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_workflows_access" ON "nodetool_workflows" ("access");
    CREATE INDEX IF NOT EXISTS "idx_workflows_user_project" ON "nodetool_workflows" ("user_id", "project_id");
    CREATE TABLE IF NOT EXISTS "nodetool_jobs" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "job_type" text NOT NULL DEFAULT '',
      "workflow_id" text NOT NULL,
      "project_id" text NOT NULL DEFAULT 'default',
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
      "execution_strategy" text,
      "execution_id" text,
      "runner_instance" text,
      "metadata_json" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_jobs_status" ON "nodetool_jobs" ("status");
    CREATE INDEX IF NOT EXISTS "idx_jobs_updated_at" ON "nodetool_jobs" ("updated_at");
    CREATE INDEX IF NOT EXISTS "idx_jobs_worker_id" ON "nodetool_jobs" ("worker_id");
    CREATE INDEX IF NOT EXISTS "idx_jobs_heartbeat_at" ON "nodetool_jobs" ("heartbeat_at");
    CREATE INDEX IF NOT EXISTS "idx_jobs_recovery" ON "nodetool_jobs" ("status", "heartbeat_at");
    CREATE INDEX IF NOT EXISTS "idx_jobs_user_project" ON "nodetool_jobs" ("user_id", "project_id");
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
      "project_id" text NOT NULL DEFAULT 'default',
      "external_path" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_assets_user_parent" ON "nodetool_assets" ("user_id", "parent_id");
    CREATE INDEX IF NOT EXISTS "idx_assets_user_project" ON "nodetool_assets" ("user_id", "project_id");
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
`;

export const JOB_TRACE_MARKER_DDL = "ALTER TABLE nodetool_jobs ADD COLUMN has_run_trace INTEGER NOT NULL DEFAULT 0";
export const ASSET_FAVORITE_DDL = "ALTER TABLE nodetool_assets ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0";
