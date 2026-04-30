/**
 * All migration version definitions.
 *
 * Port of Python's `nodetool.migrations.versions/` directory.
 * Each migration is defined as an object with async up/down functions
 * instead of separate Python module files.
 */

import type { MigrationDBAdapter } from "./db-adapter.js";

export interface MigrationDef {
  version: string;
  name: string;
  createsTables: string[];
  modifiesTables: string[];
  up: (db: MigrationDBAdapter) => Promise<void>;
  down: (db: MigrationDBAdapter) => Promise<void>;
}

export const migrations: MigrationDef[] = [
  // ── 001: Create workflows ──────────────────────────────────────────
  {
    version: "20250428_212009_001",
    name: "create_workflows",
    createsTables: ["nodetool_workflows"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS nodetool_workflows (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          access TEXT,
          created_at TEXT,
          updated_at TEXT,
          name TEXT,
          tags TEXT,
          description TEXT,
          thumbnail TEXT,
          graph TEXT,
          settings TEXT,
          receive_clipboard INTEGER
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_nodetool_workflows_user_id
        ON nodetool_workflows (user_id)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_nodetool_workflows_user_id");
      await db.execute("DROP TABLE IF EXISTS nodetool_workflows");
    }
  },

  // ── 002: Create assets ─────────────────────────────────────────────
  {
    version: "20250428_212009_002",
    name: "create_assets",
    createsTables: ["nodetool_assets"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS nodetool_assets (
          id TEXT PRIMARY KEY,
          type TEXT,
          user_id TEXT,
          workflow_id TEXT,
          parent_id TEXT,
          file_id TEXT,
          name TEXT,
          content_type TEXT,
          metadata TEXT,
          created_at TEXT,
          duration REAL
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_nodetool_assets_user_id_parent_id
        ON nodetool_assets (user_id, parent_id)
      `);
    },
    async down(db) {
      await db.execute(
        "DROP INDEX IF EXISTS idx_nodetool_assets_user_id_parent_id"
      );
      await db.execute("DROP TABLE IF EXISTS nodetool_assets");
    }
  },

  // ── 003: Create threads ────────────────────────────────────────────
  {
    version: "20250428_212009_003",
    name: "create_threads",
    createsTables: ["nodetool_threads"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS nodetool_threads (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          title TEXT,
          created_at TEXT,
          updated_at TEXT
        )
      `);
    },
    async down(db) {
      await db.execute("DROP TABLE IF EXISTS nodetool_threads");
    }
  },

  // ── 004: Create messages ───────────────────────────────────────────
  {
    version: "20250428_212009_004",
    name: "create_messages",
    createsTables: ["nodetool_messages"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS nodetool_messages (
          id TEXT PRIMARY KEY,
          user_id TEXT DEFAULT '',
          workflow_id TEXT,
          graph TEXT,
          thread_id TEXT,
          tools TEXT,
          tool_call_id TEXT,
          role TEXT,
          name TEXT,
          content TEXT,
          tool_calls TEXT,
          collections TEXT,
          input_files TEXT,
          output_files TEXT,
          created_at TEXT,
          provider TEXT,
          model TEXT,
          cost REAL,
          agent_mode INTEGER,
          help_mode INTEGER,
          agent_execution_id TEXT,
          execution_event_type TEXT,
          workflow_target TEXT
        )
      `);
    },
    async down(db) {
      await db.execute("DROP TABLE IF EXISTS nodetool_messages");
    }
  },

  // ── 005: Create jobs ───────────────────────────────────────────────
  {
    version: "20250428_212009_005",
    name: "create_jobs",
    createsTables: ["nodetool_jobs"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS nodetool_jobs (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          job_type TEXT,
          status TEXT,
          workflow_id TEXT,
          started_at TEXT,
          finished_at TEXT,
          graph TEXT,
          error TEXT,
          cost REAL
        )
      `);
    },
    async down(db) {
      await db.execute("DROP TABLE IF EXISTS nodetool_jobs");
    }
  },

  // ── 006: Create predictions ────────────────────────────────────────
  {
    version: "20250428_212009_006",
    name: "create_predictions",
    createsTables: ["nodetool_predictions"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS nodetool_predictions (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          node_id TEXT,
          provider TEXT,
          model TEXT,
          workflow_id TEXT,
          error TEXT,
          logs TEXT,
          status TEXT,
          created_at TEXT,
          started_at TEXT,
          completed_at TEXT,
          cost REAL,
          duration REAL,
          hardware TEXT,
          input_tokens INTEGER,
          output_tokens INTEGER
        )
      `);
    },
    async down(db) {
      await db.execute("DROP TABLE IF EXISTS nodetool_predictions");
    }
  },

  // ── Add run_mode to workflows ──────────────────────────────────────
  {
    version: "20250501_000000",
    name: "add_run_mode_to_workflows",
    createsTables: [],
    modifiesTables: ["nodetool_workflows"],
    async up(db) {
      const columns = await db.getColumns("nodetool_workflows");
      if (!columns.includes("run_mode")) {
        await db.execute(
          "ALTER TABLE nodetool_workflows ADD COLUMN run_mode TEXT"
        );
      }
    },
    async down() {
      // no-op
    }
  },

  // ── Add package_name and thumbnail_url to workflows ────────────────
  {
    version: "20250501_000001",
    name: "add_package_name_and_thumbnail_url_to_workflows",
    createsTables: [],
    modifiesTables: ["nodetool_workflows"],
    async up(db) {
      const columns = await db.getColumns("nodetool_workflows");
      if (!columns.includes("package_name")) {
        await db.execute(
          "ALTER TABLE nodetool_workflows ADD COLUMN package_name TEXT"
        );
      }
      if (!columns.includes("thumbnail_url")) {
        await db.execute(
          "ALTER TABLE nodetool_workflows ADD COLUMN thumbnail_url TEXT"
        );
      }
    },
    async down() {
      // no-op
    }
  },

  // ── Add size to assets ─────────────────────────────────────────────
  {
    version: "20250501_000002",
    name: "add_size_to_assets",
    createsTables: [],
    modifiesTables: ["nodetool_assets"],
    async up(db) {
      const columns = await db.getColumns("nodetool_assets");
      if (!columns.includes("size")) {
        await db.execute("ALTER TABLE nodetool_assets ADD COLUMN size INTEGER");
      }
    },
    async down() {
      // no-op
    }
  },

  // ── Add tool_name to workflows ─────────────────────────────────────
  {
    version: "20250928_000000",
    name: "add_tool_name_to_workflows",
    createsTables: [],
    modifiesTables: ["nodetool_workflows"],
    async up(db) {
      const columns = await db.getColumns("nodetool_workflows");
      if (!columns.includes("tool_name")) {
        await db.execute(
          "ALTER TABLE nodetool_workflows ADD COLUMN tool_name TEXT"
        );
      }
    },
    async down() {
      // no-op
    }
  },

  // ── Add params to jobs ─────────────────────────────────────────────
  {
    version: "20251006_000000",
    name: "add_params_to_jobs",
    createsTables: [],
    modifiesTables: ["nodetool_jobs"],
    async up(db) {
      const columns = await db.getColumns("nodetool_jobs");
      if (!columns.includes("params")) {
        await db.execute("ALTER TABLE nodetool_jobs ADD COLUMN params TEXT");
      }
    },
    async down() {
      // no-op
    }
  },

  // ── Add logs to jobs ───────────────────────────────────────────────
  {
    version: "20251010_000000",
    name: "add_logs_to_jobs",
    createsTables: [],
    modifiesTables: ["nodetool_jobs"],
    async up(db) {
      const columns = await db.getColumns("nodetool_jobs");
      if (!columns.includes("logs")) {
        await db.execute("ALTER TABLE nodetool_jobs ADD COLUMN logs TEXT");
      }
    },
    async down() {
      // no-op
    }
  },

  // ── Add agent execution fields to messages ─────────────────────────
  {
    version: "20251011_000000",
    name: "add_agent_execution_fields_to_messages",
    createsTables: [],
    modifiesTables: ["nodetool_messages"],
    async up(db) {
      const columns = await db.getColumns("nodetool_messages");
      if (!columns.includes("agent_execution_id")) {
        await db.execute(
          "ALTER TABLE nodetool_messages ADD COLUMN agent_execution_id TEXT"
        );
      }
      if (!columns.includes("execution_event_type")) {
        await db.execute(
          "ALTER TABLE nodetool_messages ADD COLUMN execution_event_type TEXT"
        );
      }
    },
    async down() {
      // no-op
    }
  },

  // ── Create secrets ─────────────────────────────────────────────────
  {
    version: "20251019_000000",
    name: "create_secrets",
    createsTables: ["nodetool_secrets"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS nodetool_secrets (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          key TEXT NOT NULL,
          encrypted_value TEXT NOT NULL,
          description TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_nodetool_secrets_user_id_key
        ON nodetool_secrets (user_id, key)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_nodetool_secrets_user_id
        ON nodetool_secrets (user_id)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_nodetool_secrets_user_id_key");
      await db.execute("DROP INDEX IF EXISTS idx_nodetool_secrets_user_id");
      await db.execute("DROP TABLE IF EXISTS nodetool_secrets");
    }
  },

  // ── Add cost tracking to predictions ───────────────────────────────
  {
    version: "20251223_000000",
    name: "add_cost_tracking_to_predictions",
    createsTables: [],
    modifiesTables: ["nodetool_predictions"],
    async up(db) {
      const columns = await db.getColumns("nodetool_predictions");
      const newColumns: [string, string][] = [
        ["total_tokens", "INTEGER"],
        ["cached_tokens", "INTEGER"],
        ["reasoning_tokens", "INTEGER"],
        ["input_size", "INTEGER"],
        ["output_size", "INTEGER"],
        ["parameters", "TEXT"],
        ["metadata", "TEXT"]
      ];
      for (const [colName, colType] of newColumns) {
        if (!columns.includes(colName)) {
          await db.execute(
            `ALTER TABLE nodetool_predictions ADD COLUMN ${colName} ${colType}`
          );
        }
      }
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_prediction_user_provider
        ON nodetool_predictions(user_id, provider)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_prediction_user_model
        ON nodetool_predictions(user_id, model)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_prediction_created_at
        ON nodetool_predictions(created_at)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_prediction_user_provider");
      await db.execute("DROP INDEX IF EXISTS idx_prediction_user_model");
      await db.execute("DROP INDEX IF EXISTS idx_prediction_created_at");
    }
  },

  // ── Create oauth_credentials ───────────────────────────────────────
  {
    version: "20251225_000000",
    name: "create_oauth_credentials",
    createsTables: ["nodetool_oauth_credentials"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS nodetool_oauth_credentials (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          account_id TEXT NOT NULL,
          username TEXT,
          encrypted_access_token TEXT NOT NULL,
          encrypted_refresh_token TEXT,
          token_type TEXT DEFAULT 'Bearer',
          scope TEXT,
          received_at TEXT NOT NULL,
          expires_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_oauth_credentials_user_provider
        ON nodetool_oauth_credentials (user_id, provider)
      `);
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_credentials_user_provider_account
        ON nodetool_oauth_credentials (user_id, provider, account_id)
      `);
    },
    async down(db) {
      await db.execute(
        "DROP INDEX IF EXISTS idx_oauth_credentials_user_provider"
      );
      await db.execute(
        "DROP INDEX IF EXISTS idx_oauth_credentials_user_provider_account"
      );
      await db.execute("DROP TABLE IF EXISTS nodetool_oauth_credentials");
    }
  },

  // ── Create run_state ───────────────────────────────────────────────
  {
    version: "20251228_000000",
    name: "create_run_state",
    createsTables: ["run_state"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS run_state (
          run_id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          suspended_node_id TEXT,
          suspension_reason TEXT,
          suspension_state_json TEXT,
          suspension_metadata_json TEXT,
          completed_at TEXT,
          failed_at TEXT,
          error_message TEXT,
          version INTEGER NOT NULL DEFAULT 0
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_run_state_status
        ON run_state(status)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_run_state_updated
        ON run_state(updated_at)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_run_state_status");
      await db.execute("DROP INDEX IF EXISTS idx_run_state_updated");
      await db.execute("DROP TABLE IF EXISTS run_state");
    }
  },

  // ── Create run_node_state ──────────────────────────────────────────
  {
    version: "20251228_000001",
    name: "create_run_node_state",
    createsTables: ["run_node_state"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS run_node_state (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          node_id TEXT NOT NULL,
          status TEXT NOT NULL,
          attempt INTEGER NOT NULL DEFAULT 1,
          scheduled_at TEXT,
          started_at TEXT,
          completed_at TEXT,
          failed_at TEXT,
          suspended_at TEXT,
          updated_at TEXT NOT NULL,
          last_error TEXT,
          retryable INTEGER NOT NULL DEFAULT 0,
          suspension_reason TEXT,
          resume_state_json TEXT,
          outputs_json TEXT
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_run_node_state_run_status
        ON run_node_state(run_id, status)
      `);
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_run_node_state_run_node
        ON run_node_state(run_id, node_id)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_run_node_state_run_status");
      await db.execute("DROP INDEX IF EXISTS idx_run_node_state_run_node");
      await db.execute("DROP TABLE IF EXISTS run_node_state");
    }
  },

  // ── Create run_inbox_messages ──────────────────────────────────────
  {
    version: "20251228_000002",
    name: "create_run_inbox_messages",
    createsTables: ["run_inbox_messages"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS run_inbox_messages (
          id TEXT PRIMARY KEY,
          message_id TEXT NOT NULL UNIQUE,
          run_id TEXT NOT NULL,
          node_id TEXT NOT NULL,
          handle TEXT NOT NULL,
          msg_seq INTEGER NOT NULL,
          payload_json TEXT,
          payload_ref TEXT,
          status TEXT NOT NULL,
          claim_worker_id TEXT,
          claim_expires_at TEXT,
          consumed_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_inbox_run_node_handle_seq
        ON run_inbox_messages(run_id, node_id, handle, msg_seq)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_inbox_run_node_handle_status
        ON run_inbox_messages(run_id, node_id, handle, status)
      `);
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_message_id
        ON run_inbox_messages(message_id)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_inbox_run_node_handle_seq");
      await db.execute("DROP INDEX IF EXISTS idx_inbox_run_node_handle_status");
      await db.execute("DROP INDEX IF EXISTS idx_inbox_message_id");
      await db.execute("DROP TABLE IF EXISTS run_inbox_messages");
    }
  },

  // ── Create trigger_inputs ──────────────────────────────────────────
  {
    version: "20251228_000003",
    name: "create_trigger_inputs",
    createsTables: ["trigger_inputs"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS trigger_inputs (
          id TEXT PRIMARY KEY,
          input_id TEXT NOT NULL UNIQUE,
          run_id TEXT NOT NULL,
          node_id TEXT NOT NULL,
          payload_json TEXT,
          processed INTEGER NOT NULL DEFAULT 0,
          processed_at TEXT,
          cursor TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_trigger_input_run_node_processed
        ON trigger_inputs(run_id, node_id, processed)
      `);
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_trigger_input_id
        ON trigger_inputs(input_id)
      `);
    },
    async down(db) {
      await db.execute(
        "DROP INDEX IF EXISTS idx_trigger_input_run_node_processed"
      );
      await db.execute("DROP INDEX IF EXISTS idx_trigger_input_id");
      await db.execute("DROP TABLE IF EXISTS trigger_inputs");
    }
  },

  // ── Add job execution fields to run_state ──────────────────────────
  {
    version: "20260101_000000",
    name: "add_job_execution_fields",
    createsTables: [],
    modifiesTables: ["run_state"],
    async up(db) {
      const newColumns: [string, string][] = [
        ["execution_strategy", "TEXT"],
        ["execution_id", "TEXT"],
        ["worker_id", "TEXT"],
        ["heartbeat_at", "TEXT"],
        ["retry_count", "INTEGER DEFAULT 0"],
        ["max_retries", "INTEGER DEFAULT 3"],
        ["metadata_json", "TEXT"]
      ];
      for (const [colName, colType] of newColumns) {
        if (!(await db.columnExists("run_state", colName))) {
          await db.execute(
            `ALTER TABLE run_state ADD COLUMN ${colName} ${colType}`
          );
        }
      }
      await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_run_state_worker ON run_state(worker_id)"
      );
      await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_run_state_heartbeat ON run_state(heartbeat_at)"
      );
      await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_run_state_recovery ON run_state(status, heartbeat_at)"
      );
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_run_state_recovery");
      await db.execute("DROP INDEX IF EXISTS idx_run_state_heartbeat");
      await db.execute("DROP INDEX IF EXISTS idx_run_state_worker");
      const columns = [
        "metadata_json",
        "max_retries",
        "retry_count",
        "heartbeat_at",
        "worker_id",
        "execution_id",
        "execution_strategy"
      ];
      for (const col of columns) {
        try {
          if (await db.columnExists("run_state", col)) {
            await db.execute(`ALTER TABLE run_state DROP COLUMN ${col}`);
          }
        } catch {
          // SQLite < 3.35 doesn't support DROP COLUMN
        }
      }
    }
  },

  // ── Create workflow_versions ────────────────────────────────────────
  {
    version: "20260102_000000",
    name: "create_workflow_versions",
    createsTables: ["nodetool_workflow_versions"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS nodetool_workflow_versions (
          id TEXT PRIMARY KEY,
          workflow_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          name TEXT DEFAULT '',
          description TEXT DEFAULT '',
          graph TEXT DEFAULT '{}'
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_nodetool_workflow_versions_workflow_id
        ON nodetool_workflow_versions (workflow_id)
      `);
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_nodetool_workflow_versions_workflow_version
        ON nodetool_workflow_versions (workflow_id, version)
      `);
    },
    async down(db) {
      await db.execute(
        "DROP INDEX IF EXISTS idx_nodetool_workflow_versions_workflow_id"
      );
      await db.execute(
        "DROP INDEX IF EXISTS idx_nodetool_workflow_versions_workflow_version"
      );
      await db.execute("DROP TABLE IF EXISTS nodetool_workflow_versions");
    }
  },

  // ── Create run_events ──────────────────────────────────────────────
  {
    version: "20260103_000000",
    name: "create_run_events",
    createsTables: ["run_events"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS run_events (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          seq INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          event_time TEXT NOT NULL,
          node_id TEXT,
          payload TEXT
        )
      `);
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_run_events_run_seq
        ON run_events(run_id, seq)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_run_events_run_node
        ON run_events(run_id, node_id)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_run_events_run_type
        ON run_events(run_id, event_type)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_run_events_run_seq");
      await db.execute("DROP INDEX IF EXISTS idx_run_events_run_node");
      await db.execute("DROP INDEX IF EXISTS idx_run_events_run_type");
      await db.execute("DROP TABLE IF EXISTS run_events");
    }
  },

  // ── Create run_leases ──────────────────────────────────────────────
  {
    version: "20260103_000001",
    name: "create_run_leases",
    createsTables: ["run_leases"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS run_leases (
          run_id TEXT PRIMARY KEY,
          worker_id TEXT NOT NULL,
          acquired_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_run_leases_expires
        ON run_leases(expires_at)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_run_leases_expires");
      await db.execute("DROP TABLE IF EXISTS run_leases");
    }
  },

  // ── Add autosave fields to workflow_versions ───────────────────────
  {
    version: "20260104_000001",
    name: "add_autosave_fields_to_workflow_versions_v2",
    createsTables: [],
    modifiesTables: ["nodetool_workflow_versions"],
    async up(db) {
      try {
        await db.execute(`
          ALTER TABLE nodetool_workflow_versions
          ADD COLUMN save_type TEXT DEFAULT 'manual' CHECK(save_type IN ('autosave', 'manual', 'checkpoint', 'restore'))
        `);
      } catch {
        // column may already exist
      }
      try {
        await db.execute(`
          ALTER TABLE nodetool_workflow_versions
          ADD COLUMN autosave_metadata TEXT DEFAULT '{}'
        `);
      } catch {
        // column may already exist
      }
      try {
        await db.execute(`
          CREATE INDEX IF NOT EXISTS idx_nodetool_workflow_versions_save_type
          ON nodetool_workflow_versions (workflow_id, save_type, created_at)
        `);
      } catch {
        // index may already exist
      }
    },
    async down(db) {
      await db.execute(
        "DROP INDEX IF EXISTS idx_nodetool_workflow_versions_save_type"
      );
      try {
        await db.execute(
          "ALTER TABLE nodetool_workflow_versions DROP COLUMN autosave_metadata"
        );
      } catch {
        // ignore
      }
      try {
        await db.execute(
          "ALTER TABLE nodetool_workflow_versions DROP COLUMN save_type"
        );
      } catch {
        // ignore
      }
    }
  },

  // ── Create workspaces ──────────────────────────────────────────────
  {
    version: "20260113_000000",
    name: "create_workspaces",
    createsTables: ["nodetool_workspaces"],
    modifiesTables: ["nodetool_workflows"],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS nodetool_workspaces (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          path TEXT NOT NULL,
          is_default INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_nodetool_workspaces_user_id
        ON nodetool_workspaces (user_id)
      `);
      const columns = await db.getColumns("nodetool_workflows");
      if (!columns.includes("workspace_id")) {
        await db.execute(
          "ALTER TABLE nodetool_workflows ADD COLUMN workspace_id TEXT"
        );
      }
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_nodetool_workspaces_user_id");
      await db.execute("DROP TABLE IF EXISTS nodetool_workspaces");
    }
  },

  // ── Add node_id and job_id to assets ───────────────────────────────
  {
    version: "20260124_000000",
    name: "add_node_job_fields_to_assets",
    createsTables: [],
    modifiesTables: ["nodetool_assets"],
    async up(db) {
      try {
        await db.execute(
          "ALTER TABLE nodetool_assets ADD COLUMN node_id TEXT DEFAULT NULL"
        );
      } catch {
        // column may already exist
      }
      try {
        await db.execute(
          "ALTER TABLE nodetool_assets ADD COLUMN job_id TEXT DEFAULT NULL"
        );
      } catch {
        // column may already exist
      }
    },
    async down(db) {
      try {
        await db.execute("ALTER TABLE nodetool_assets DROP COLUMN job_id");
      } catch {
        // ignore
      }
      try {
        await db.execute("ALTER TABLE nodetool_assets DROP COLUMN node_id");
      } catch {
        // ignore
      }
    }
  },

  // ── Add execution state to jobs ────────────────────────────────────
  {
    version: "20260125_000000",
    name: "add_execution_state_to_jobs",
    createsTables: [],
    modifiesTables: ["nodetool_jobs"],
    async up(db) {
      const newColumns: [string, string][] = [
        ["status", "TEXT"],
        ["updated_at", "TEXT"],
        ["suspended_node_id", "TEXT"],
        ["suspension_reason", "TEXT"],
        ["suspension_state_json", "TEXT"],
        ["suspension_metadata_json", "TEXT"],
        ["completed_at", "TEXT"],
        ["failed_at", "TEXT"],
        ["error_message", "TEXT"],
        ["execution_strategy", "TEXT"],
        ["execution_id", "TEXT"],
        ["worker_id", "TEXT"],
        ["heartbeat_at", "TEXT"],
        ["retry_count", "INTEGER DEFAULT 0"],
        ["max_retries", "INTEGER DEFAULT 3"],
        ["metadata_json", "TEXT"],
        ["version", "INTEGER DEFAULT 0"]
      ];
      for (const [colName, colType] of newColumns) {
        if (!(await db.columnExists("nodetool_jobs", colName))) {
          await db.execute(
            `ALTER TABLE nodetool_jobs ADD COLUMN ${colName} ${colType}`
          );
        }
      }
      await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_job_status ON nodetool_jobs(status)"
      );
      await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_job_updated ON nodetool_jobs(updated_at)"
      );
      await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_job_worker ON nodetool_jobs(worker_id)"
      );
      await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_job_heartbeat ON nodetool_jobs(heartbeat_at)"
      );
      await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_job_recovery ON nodetool_jobs(status, heartbeat_at)"
      );
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_job_recovery");
      await db.execute("DROP INDEX IF EXISTS idx_job_heartbeat");
      await db.execute("DROP INDEX IF EXISTS idx_job_worker");
      await db.execute("DROP INDEX IF EXISTS idx_job_updated");
      await db.execute("DROP INDEX IF EXISTS idx_job_status");
      const columns = [
        "status",
        "version",
        "metadata_json",
        "max_retries",
        "retry_count",
        "heartbeat_at",
        "worker_id",
        "execution_id",
        "execution_strategy",
        "error_message",
        "failed_at",
        "completed_at",
        "suspension_metadata_json",
        "suspension_state_json",
        "suspension_reason",
        "suspended_node_id",
        "updated_at"
      ];
      for (const col of columns) {
        try {
          if (await db.columnExists("nodetool_jobs", col)) {
            await db.execute(`ALTER TABLE nodetool_jobs DROP COLUMN ${col}`);
          }
        } catch {
          // SQLite < 3.35 doesn't support DROP COLUMN
        }
      }
    }
  },

  // ── Add html_app to workflows ──────────────────────────────────────
  {
    version: "20260127_000000",
    name: "add_html_app_to_workflows",
    createsTables: [],
    modifiesTables: ["nodetool_workflows"],
    async up(db) {
      const columns = await db.getColumns("nodetool_workflows");
      if (!columns.includes("html_app")) {
        await db.execute(
          "ALTER TABLE nodetool_workflows ADD COLUMN html_app TEXT"
        );
      }
    },
    async down() {
      // no-op
    }
  },

  // ── Add updated_at to assets ───────────────────────────────────────
  {
    version: "20260201_000000",
    name: "add_updated_at_to_assets",
    createsTables: [],
    modifiesTables: ["nodetool_assets"],
    async up(db) {
      const columns = await db.getColumns("nodetool_assets");
      if (!columns.includes("updated_at")) {
        await db.execute(
          "ALTER TABLE nodetool_assets ADD COLUMN updated_at TEXT"
        );
        await db.execute(
          "UPDATE nodetool_assets SET updated_at = created_at WHERE updated_at IS NULL"
        );
      }
    },
    async down() {
      // no-op
    }
  },

  // ── Create settings ─────────────────────────────────────────────────
  {
    version: "20260401_000000",
    name: "create_settings",
    createsTables: ["nodetool_settings"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS nodetool_settings (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          description TEXT DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_user_key
        ON nodetool_settings (user_id, key)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_settings_user_id
        ON nodetool_settings (user_id)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_settings_user_key");
      await db.execute("DROP INDEX IF EXISTS idx_settings_user_id");
      await db.execute("DROP TABLE IF EXISTS nodetool_settings");
    }
  },

  // ── Ensure schema columns match current Drizzle models ─────────────
  {
    version: "20260430_000000",
    name: "add_current_schema_missing_columns",
    createsTables: [],
    modifiesTables: [
      "nodetool_workflows",
      "nodetool_jobs",
      "nodetool_messages",
      "nodetool_threads",
      "nodetool_assets",
      "nodetool_secrets",
      "nodetool_workspaces",
      "nodetool_workflow_versions",
      "nodetool_oauth_credentials",
      "run_node_state",
      "nodetool_predictions",
      "run_events",
      "run_leases",
      "nodetool_team_tasks",
      "nodetool_settings"
    ],
    async up(db) {
      const tableColumns: Record<string, Record<string, string>> = {
        nodetool_workflows: {
          id: "TEXT",
          user_id: "TEXT",
          name: "TEXT",
          tool_name: "TEXT",
          description: "TEXT",
          tags: "TEXT",
          thumbnail: "TEXT",
          thumbnail_url: "TEXT",
          graph: "TEXT",
          settings: "TEXT",
          package_name: "TEXT",
          path: "TEXT",
          run_mode: "TEXT",
          workspace_id: "TEXT",
          html_app: "TEXT",
          receive_clipboard: "INTEGER",
          access: "TEXT",
          created_at: "TEXT",
          updated_at: "TEXT"
        },
        nodetool_jobs: {
          id: "TEXT",
          user_id: "TEXT",
          job_type: "TEXT",
          workflow_id: "TEXT",
          status: "TEXT",
          name: "TEXT",
          graph: "TEXT",
          params: "TEXT",
          worker_id: "TEXT",
          heartbeat_at: "TEXT",
          started_at: "TEXT",
          finished_at: "TEXT",
          completed_at: "TEXT",
          failed_at: "TEXT",
          error: "TEXT",
          error_message: "TEXT",
          cost: "REAL",
          logs: "TEXT",
          retry_count: "INTEGER",
          max_retries: "INTEGER",
          version: "INTEGER",
          suspended_node_id: "TEXT",
          suspension_reason: "TEXT",
          suspension_state_json: "TEXT",
          suspension_metadata_json: "TEXT",
          execution_strategy: "TEXT",
          execution_id: "TEXT",
          metadata_json: "TEXT",
          created_at: "TEXT",
          updated_at: "TEXT"
        },
        nodetool_messages: {
          id: "TEXT",
          user_id: "TEXT",
          thread_id: "TEXT",
          role: "TEXT",
          name: "TEXT",
          content: "TEXT",
          tool_calls: "TEXT",
          tool_call_id: "TEXT",
          input_files: "TEXT",
          output_files: "TEXT",
          provider: "TEXT",
          model: "TEXT",
          cost: "REAL",
          workflow_id: "TEXT",
          graph: "TEXT",
          tools: "TEXT",
          collections: "TEXT",
          agent_mode: "INTEGER",
          help_mode: "INTEGER",
          agent_execution_id: "TEXT",
          execution_event_type: "TEXT",
          workflow_target: "TEXT",
          media_generation: "TEXT",
          created_at: "TEXT"
        },
        nodetool_threads: {
          id: "TEXT",
          user_id: "TEXT",
          title: "TEXT",
          created_at: "TEXT",
          updated_at: "TEXT"
        },
        nodetool_assets: {
          id: "TEXT",
          user_id: "TEXT",
          parent_id: "TEXT",
          file_id: "TEXT",
          name: "TEXT",
          content_type: "TEXT",
          size: "REAL",
          duration: "REAL",
          metadata: "TEXT",
          workflow_id: "TEXT",
          node_id: "TEXT",
          job_id: "TEXT",
          created_at: "TEXT",
          updated_at: "TEXT"
        },
        nodetool_secrets: {
          id: "TEXT",
          user_id: "TEXT",
          key: "TEXT",
          encrypted_value: "TEXT",
          description: "TEXT",
          created_at: "TEXT",
          updated_at: "TEXT"
        },
        nodetool_workspaces: {
          id: "TEXT",
          user_id: "TEXT",
          name: "TEXT",
          path: "TEXT",
          is_default: "INTEGER",
          created_at: "TEXT",
          updated_at: "TEXT"
        },
        nodetool_workflow_versions: {
          id: "TEXT",
          workflow_id: "TEXT",
          user_id: "TEXT",
          name: "TEXT",
          description: "TEXT",
          graph: "TEXT",
          version: "INTEGER",
          save_type: "TEXT",
          autosave_metadata: "TEXT",
          created_at: "TEXT"
        },
        nodetool_oauth_credentials: {
          id: "TEXT",
          user_id: "TEXT",
          provider: "TEXT",
          account_id: "TEXT",
          encrypted_access_token: "TEXT",
          encrypted_refresh_token: "TEXT",
          username: "TEXT",
          token_type: "TEXT",
          scope: "TEXT",
          received_at: "TEXT",
          expires_at: "TEXT",
          created_at: "TEXT",
          updated_at: "TEXT"
        },
        run_node_state: {
          id: "TEXT",
          run_id: "TEXT",
          node_id: "TEXT",
          status: "TEXT",
          attempt: "INTEGER",
          scheduled_at: "TEXT",
          started_at: "TEXT",
          completed_at: "TEXT",
          failed_at: "TEXT",
          suspended_at: "TEXT",
          updated_at: "TEXT",
          last_error: "TEXT",
          retryable: "INTEGER",
          suspension_reason: "TEXT",
          resume_state_json: "TEXT",
          outputs_json: "TEXT"
        },
        nodetool_predictions: {
          id: "TEXT",
          user_id: "TEXT",
          node_id: "TEXT",
          provider: "TEXT",
          model: "TEXT",
          workflow_id: "TEXT",
          error: "TEXT",
          logs: "TEXT",
          status: "TEXT",
          cost: "REAL",
          input_tokens: "INTEGER",
          output_tokens: "INTEGER",
          total_tokens: "INTEGER",
          cached_tokens: "INTEGER",
          reasoning_tokens: "INTEGER",
          created_at: "TEXT",
          started_at: "TEXT",
          completed_at: "TEXT",
          duration: "REAL",
          hardware: "TEXT",
          input_size: "INTEGER",
          output_size: "INTEGER",
          parameters: "TEXT",
          metadata: "TEXT"
        },
        run_events: {
          id: "TEXT",
          run_id: "TEXT",
          seq: "INTEGER",
          event_type: "TEXT",
          event_time: "TEXT",
          node_id: "TEXT",
          payload: "TEXT"
        },
        run_leases: {
          run_id: "TEXT",
          worker_id: "TEXT",
          acquired_at: "TEXT",
          expires_at: "TEXT"
        },
        nodetool_team_tasks: {
          id: "TEXT",
          team_id: "TEXT",
          title: "TEXT",
          description: "TEXT",
          status: "TEXT",
          created_by: "TEXT",
          claimed_by: "TEXT",
          depends_on: "TEXT",
          required_skills: "TEXT",
          priority: "INTEGER",
          artifacts: "TEXT",
          parent_task_id: "TEXT",
          result: "TEXT",
          failure_reason: "TEXT",
          created_at: "TEXT",
          updated_at: "TEXT"
        },
        nodetool_settings: {
          id: "TEXT",
          user_id: "TEXT",
          key: "TEXT",
          value: "TEXT",
          description: "TEXT",
          created_at: "TEXT",
          updated_at: "TEXT"
        }
      };

      for (const [tableName, columns] of Object.entries(tableColumns)) {
        if (!(await db.tableExists(tableName))) {
          continue;
        }
        for (const [columnName, columnType] of Object.entries(columns)) {
          if (!(await db.columnExists(tableName, columnName))) {
            await db.execute(
              `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`
            );
          }
        }
      }
    },
    async down() {
      // no-op: dropping columns is unsafe across dialects and versions
    }
  }
];
