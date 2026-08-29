/**
 * All migration version definitions.
 *
 * Port of Python's `nodetool.migrations.versions/` directory.
 * Each migration is defined as an object with async up/down functions
 * instead of separate Python module files.
 */

import { randomUUID } from "node:crypto";

import {
  liftLegacyAppDoc,
  type ApplicationDocument
} from "@nodetool-ai/app-runtime";

import type { MigrationDBAdapter } from "./db-adapter.js";

export interface MigrationDef {
  version: string;
  name: string;
  createsTables: string[];
  modifiesTables: string[];
  up: (db: MigrationDBAdapter) => Promise<void>;
  down: (db: MigrationDBAdapter) => Promise<void>;
}

const newRowId = (): string => randomUUID().replace(/-/g, "");

/**
 * The capability summary an `application_versions` row carries, derived from
 * the document's bindings. Duplicated from `deriveCapabilities` in
 * `application.ts` on purpose: a migration must keep writing the shape it was
 * written against even after the model layer moves on.
 */
const capabilitiesOf = (document: ApplicationDocument): string => {
  const workflows = new Map<
    string,
    { workflowId: string; version?: number }
  >();
  for (const operation of document.operations) {
    workflows.set(`${operation.workflowId}@${operation.workflowVersion ?? ""}`, {
      workflowId: operation.workflowId,
      version: operation.workflowVersion
    });
  }
  const resources = new Map<string, Set<string>>();
  for (const binding of document.resources) {
    const seen = resources.get(binding.kind) ?? new Set<string>();
    for (const op of binding.operations) seen.add(op);
    resources.set(binding.kind, seen);
  }
  return JSON.stringify({
    workflows: [...workflows.values()],
    resources: [...resources.entries()].map(([kind, ops]) => ({
      kind,
      operations: [...ops]
    }))
  });
};

/** The workflows an application's stored document binds. */
const boundWorkflowIds = (rawDocument: unknown): string[] => {
  let value: unknown = rawDocument;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (typeof value !== "object" || value === null) return [];
  // SAFETY: `value` is a non-null object (guarded on the line above). The
  // assertion only declares `operations` optional and `unknown`, which holds of
  // any object, and the value read is re-checked with `Array.isArray` below.
  const operations = (value as { operations?: unknown }).operations;
  if (!Array.isArray(operations)) return [];
  return operations
    .map((op) =>
      typeof op === "object" && op !== null
        ? (op as { workflowId?: unknown }).workflowId
        : undefined
    )
    .filter((id): id is string => typeof id === "string" && id.length > 0);
};

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
      const tableColumns = {
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
          app_doc: "TEXT",
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
      } satisfies Record<string, Record<string, string>>;

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
  },

  // ── Create timeline_sequences ──────────────────────────────────────
  {
    version: "20260505_000000",
    name: "create_timeline_sequences",
    createsTables: ["timeline_sequences"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS timeline_sequences (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          workflow_id TEXT,
          name TEXT NOT NULL,
          fps INTEGER NOT NULL DEFAULT 30,
          width INTEGER NOT NULL DEFAULT 1920,
          height INTEGER NOT NULL DEFAULT 1080,
          duration_ms INTEGER NOT NULL DEFAULT 0,
          document TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_timeline_sequence_user
        ON timeline_sequences (user_id)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_timeline_sequence_project
        ON timeline_sequences (project_id)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_timeline_sequence_updated
        ON timeline_sequences (updated_at)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_timeline_sequence_user");
      await db.execute("DROP INDEX IF EXISTS idx_timeline_sequence_project");
      await db.execute("DROP INDEX IF EXISTS idx_timeline_sequence_updated");
      await db.execute("DROP TABLE IF EXISTS timeline_sequences");
    }
  },

  // ── Create image_documents ──────────────────────────────────────
  {
    version: "20260509_000000",
    name: "create_image_documents",
    createsTables: ["image_documents"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS image_documents (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          workflow_id TEXT,
          name TEXT NOT NULL,
          width INTEGER NOT NULL DEFAULT 1024,
          height INTEGER NOT NULL DEFAULT 1024,
          background_color TEXT NOT NULL DEFAULT '#ffffff',
          document TEXT NOT NULL,
          thumbnail_asset_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_image_document_user
        ON image_documents (user_id)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_image_document_project
        ON image_documents (project_id)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_image_document_updated
        ON image_documents (updated_at)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_image_document_user");
      await db.execute("DROP INDEX IF EXISTS idx_image_document_project");
      await db.execute("DROP INDEX IF EXISTS idx_image_document_updated");
      await db.execute("DROP TABLE IF EXISTS image_documents");
    }
  },

  // ── Add unit-based billing columns to predictions ───────────────────
  // Lets non-token providers (FAL image/video/audio generation, etc.) record
  // how an estimated cost was derived: cost = unit_price * quantity (currency).
  {
    version: "20260529_000000",
    name: "add_prediction_billing_fields",
    createsTables: [],
    modifiesTables: ["nodetool_predictions"],
    async up(db) {
      const columns = {
        billing_unit: "TEXT",
        quantity: "REAL",
        unit_price: "REAL",
        currency: "TEXT"
      } satisfies Record<string, string>;
      if (!(await db.tableExists("nodetool_predictions"))) return;
      for (const [columnName, columnType] of Object.entries(columns)) {
        if (!(await db.columnExists("nodetool_predictions", columnName))) {
          await db.execute(
            `ALTER TABLE nodetool_predictions ADD COLUMN ${columnName} ${columnType}`
          );
        }
      }
    },
    async down() {
      // no-op: dropping columns is unsafe across dialects and versions
    }
  },

  // ── Add node_type to predictions ───────────────────────────────
  {
    version: "20260531_000000",
    name: "add_prediction_node_type",
    createsTables: [],
    modifiesTables: ["nodetool_predictions"],
    async up(db) {
      if (!(await db.tableExists("nodetool_predictions"))) return;
      if (!(await db.columnExists("nodetool_predictions", "node_type"))) {
        await db.execute(
          `ALTER TABLE nodetool_predictions ADD COLUMN node_type TEXT NOT NULL DEFAULT ''`
        );
      }
    },
    async down() {
      // no-op: dropping columns is unsafe across dialects and versions
    }
  },

  // ── Add provider_request_id for cost reconciliation ────────────
  // Lets the runner refine an estimated provider cost into the actual billed
  // amount by looking the charge up via the provider's request id (e.g. FAL).
  {
    version: "20260601_000000",
    name: "add_prediction_provider_request_id",
    createsTables: [],
    modifiesTables: ["nodetool_predictions"],
    async up(db) {
      if (!(await db.tableExists("nodetool_predictions"))) return;
      if (
        !(await db.columnExists("nodetool_predictions", "provider_request_id"))
      ) {
        await db.execute(
          `ALTER TABLE nodetool_predictions ADD COLUMN provider_request_id TEXT`
        );
      }
    },
    async down() {
      // no-op: dropping columns is unsafe across dialects and versions
    }
  },

  // ── Link rendered videos back to their source timeline ───────────
  // A video exported from the timeline editor stores the sequence id here so
  // "edit" on the video can reopen its underlying timeline.
  {
    version: "20260601_000001",
    name: "add_timeline_id_to_assets",
    createsTables: [],
    modifiesTables: ["nodetool_assets"],
    async up(db) {
      if (!(await db.tableExists("nodetool_assets"))) return;
      if (!(await db.columnExists("nodetool_assets", "timeline_id"))) {
        await db.execute(
          "ALTER TABLE nodetool_assets ADD COLUMN timeline_id TEXT"
        );
      }
    },
    async down() {
      // no-op: dropping columns is unsafe across dialects and versions
    }
  },

  // ── Promote the sketch→asset link to a first-class column ────────
  // The sketch document backing an image asset used to live in the asset's
  // `metadata` JSON under `sketchDocumentId`. Hoist it into a dedicated
  // `sketch_document_id` column and backfill existing rows from metadata.
  {
    version: "20260602_000000",
    name: "add_sketch_document_id_to_assets",
    createsTables: [],
    modifiesTables: ["nodetool_assets"],
    async up(db) {
      if (!(await db.tableExists("nodetool_assets"))) return;
      if (!(await db.columnExists("nodetool_assets", "sketch_document_id"))) {
        await db.execute(
          "ALTER TABLE nodetool_assets ADD COLUMN sketch_document_id TEXT"
        );
      }
      // Backfill from the legacy metadata key. `metadata` is stored as JSON
      // text in both dialects, so extract dialect-appropriately.
      const extract =
        db.dbType === "postgres"
          ? "metadata::json->>'sketchDocumentId'"
          : "json_extract(metadata, '$.sketchDocumentId')";
      await db.execute(
        `UPDATE nodetool_assets
           SET sketch_document_id = ${extract}
         WHERE sketch_document_id IS NULL
           AND metadata IS NOT NULL
           AND ${extract} IS NOT NULL`
      );
    },
    async down() {
      // no-op: dropping columns is unsafe across dialects and versions
    }
  },

  // ── Create worker_profiles and worker_instances ─────────────────────
  // GPU-worker provisioning is DB-native: profiles are declarative presets,
  // instances are ephemeral, billing-sensitive live handles. See spec §5.
  {
    version: "20260608_000000",
    name: "create_worker_tables",
    createsTables: ["worker_profiles", "worker_instances"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS worker_profiles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          target TEXT NOT NULL,
          image TEXT NOT NULL,
          spec TEXT NOT NULL,
          token_policy TEXT NOT NULL,
          idle_timeout_minutes INTEGER,
          max_lifetime_minutes INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_profiles_name
        ON worker_profiles (name)
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS worker_instances (
          id TEXT PRIMARY KEY,
          profile_name TEXT NOT NULL,
          target TEXT NOT NULL,
          provider_ref TEXT NOT NULL,
          ws_url TEXT NOT NULL,
          encrypted_token TEXT,
          status TEXT NOT NULL,
          attached_to TEXT,
          created_at TEXT NOT NULL,
          last_activity_at TEXT NOT NULL,
          estimated_cost_usd REAL
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_worker_instances_status
        ON worker_instances (status)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_worker_instances_profile_name
        ON worker_instances (profile_name)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_worker_instances_profile_name");
      await db.execute("DROP INDEX IF EXISTS idx_worker_instances_status");
      await db.execute("DROP TABLE IF EXISTS worker_instances");
      await db.execute("DROP INDEX IF EXISTS idx_worker_profiles_name");
      await db.execute("DROP TABLE IF EXISTS worker_profiles");
    }
  },

  // ── Add provider_session to messages ───────────────────────────────
  // Durable per-message continuation token (ProviderSession) so session-based
  // providers (Claude Agent SDK, future OpenAI Responses) resume an upstream
  // conversation across turns instead of replaying the whole transcript.
  // Dialect-agnostic: runs for both SQLite and Postgres via the runner.
  {
    version: "20260624_000000",
    name: "add_provider_session_to_messages",
    createsTables: [],
    modifiesTables: ["nodetool_messages"],
    async up(db) {
      if (!(await db.tableExists("nodetool_messages"))) return;
      if (!(await db.columnExists("nodetool_messages", "provider_session"))) {
        await db.execute(
          "ALTER TABLE nodetool_messages ADD COLUMN provider_session TEXT"
        );
      }
    },
    async down() {
      // no-op: dropping columns is unsafe across dialects and versions
    }
  },

  // ── Scope chat threads to a workflow ───────────────────────────────
  // Threads gain a nullable `workflow_id` so the node editor can list only
  // the conversations for the open workflow and reopen the last one. Null
  // means workflow-agnostic (e.g. the global chat).
  {
    version: "20260701_000001",
    name: "add_workflow_id_to_threads",
    createsTables: [],
    modifiesTables: ["nodetool_threads"],
    async up(db) {
      if (!(await db.tableExists("nodetool_threads"))) return;
      if (!(await db.columnExists("nodetool_threads", "workflow_id"))) {
        await db.execute(
          "ALTER TABLE nodetool_threads ADD COLUMN workflow_id TEXT"
        );
      }
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_threads_user_workflow
         ON nodetool_threads (user_id, workflow_id)`
      );
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_threads_user_workflow");
    }
  },

  // ── Add app_doc to workflows ───────────────────────────────────────
  // First-class storage for the app-builder document (Puck layout + bindings),
  // replacing the legacy `settings.__appbuilder__` JSON string.
  // Dialect-agnostic: runs for both SQLite and Postgres via the runner.
  //
  // Version note: this migration originally shipped as `20260701_000000`,
  // which collided with `add_workflow_id_to_threads` — that version had
  // already been recorded as applied on existing databases, so the runner
  // (which tracks by version string) silently skipped app_doc and the column
  // was never created. Renumbered to a unique, never-applied version so the
  // migration runs everywhere; the `columnExists` guard keeps it idempotent
  // on databases where the column was already added out of band.
  {
    version: "20260705_000000",
    name: "add_app_doc_to_workflows",
    createsTables: [],
    modifiesTables: ["nodetool_workflows"],
    async up(db) {
      if (!(await db.tableExists("nodetool_workflows"))) return;
      if (!(await db.columnExists("nodetool_workflows", "app_doc"))) {
        await db.execute(
          "ALTER TABLE nodetool_workflows ADD COLUMN app_doc TEXT"
        );
      }
    },
    async down() {
      // no-op: dropping columns is unsafe across dialects and versions
    }
  },

  // ── Create trigger_registrations ───────────────────────────────────
  {
    version: "20260710_000000",
    name: "create_trigger_registrations",
    createsTables: ["trigger_registrations"],
    modifiesTables: [],
    async up(db) {
      if (await db.tableExists("trigger_registrations")) return;
      await db.execute(`
        CREATE TABLE IF NOT EXISTS trigger_registrations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          workflow_id TEXT NOT NULL,
          node_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          config_json TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          cursor TEXT,
          last_fired_at TEXT,
          last_error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_trigger_reg_workflow
        ON trigger_registrations(workflow_id)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_trigger_reg_kind_enabled
        ON trigger_registrations(kind, enabled)
      `);
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_trigger_reg_workflow_node
        ON trigger_registrations(workflow_id, node_id)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_trigger_reg_workflow");
      await db.execute("DROP INDEX IF EXISTS idx_trigger_reg_kind_enabled");
      await db.execute("DROP INDEX IF EXISTS idx_trigger_reg_workflow_node");
      await db.execute("DROP TABLE IF EXISTS trigger_registrations");
    }
  },

  // ── Create workflow sharing tables ─────────────────────────────────
  {
    version: "20260711_000000",
    name: "create_workflow_sharing_tables",
    createsTables: [
      "nodetool_workflow_collaborators",
      "nodetool_workflow_shares"
    ],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS nodetool_workflow_collaborators (
          id TEXT PRIMARY KEY,
          workflow_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'viewer',
          invited_by TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_wcol_workflow_user
        ON nodetool_workflow_collaborators(workflow_id, user_id)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_wcol_user_id
        ON nodetool_workflow_collaborators(user_id)
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS nodetool_workflow_shares (
          id TEXT PRIMARY KEY,
          workflow_id TEXT NOT NULL,
          token TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'viewer',
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          revoked_at TEXT
        )
      `);
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_wshare_token
        ON nodetool_workflow_shares(token)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_wshare_workflow_id
        ON nodetool_workflow_shares(workflow_id)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_wcol_workflow_user");
      await db.execute("DROP INDEX IF EXISTS idx_wcol_user_id");
      await db.execute("DROP TABLE IF EXISTS nodetool_workflow_collaborators");
      await db.execute("DROP INDEX IF EXISTS idx_wshare_token");
      await db.execute("DROP INDEX IF EXISTS idx_wshare_workflow_id");
      await db.execute("DROP TABLE IF EXISTS nodetool_workflow_shares");
    }
  },

  // ── Create storyboards ──────────────────────────────────────
  {
    version: "20260718_000000",
    name: "create_storyboards",
    createsTables: ["storyboards"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS storyboards (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          name TEXT NOT NULL,
          document TEXT NOT NULL,
          timeline_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_storyboard_user
        ON storyboards (user_id)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_storyboard_project
        ON storyboards (project_id)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_storyboard_updated
        ON storyboards (updated_at)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_storyboard_user");
      await db.execute("DROP INDEX IF EXISTS idx_storyboard_project");
      await db.execute("DROP INDEX IF EXISTS idx_storyboard_updated");
      await db.execute("DROP TABLE IF EXISTS storyboards");
    }
  },

  // ── Create scripts ──────────────────────────────────────────
  {
    version: "20260719_000000",
    name: "create_scripts",
    createsTables: ["scripts"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS scripts (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          name TEXT NOT NULL,
          document TEXT NOT NULL,
          timeline_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_script_user
        ON scripts (user_id)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_script_project
        ON scripts (project_id)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_script_updated
        ON scripts (updated_at)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_script_user");
      await db.execute("DROP INDEX IF EXISTS idx_script_project");
      await db.execute("DROP INDEX IF EXISTS idx_script_updated");
      await db.execute("DROP TABLE IF EXISTS scripts");
    }
  },

  // ── Create thread_memories ──────────────────────────────────────────
  // Durable, per-conversation memory. Rows are scoped to a chat thread and
  // can reference assets (generated images/videos) so an agent can record
  // and reuse the media it produces across a creative project.
  //
  // Superseded by 20260827_000001, which drops the thread boundary and
  // renames the table. This one keeps writing the shape it was written
  // against — a migration is history, not a description of today's schema.
  {
    version: "20260722_000000",
    name: "create_thread_memories",
    createsTables: ["nodetool_thread_memories"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS nodetool_thread_memories (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          thread_id TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'note',
          title TEXT NOT NULL DEFAULT '',
          content TEXT NOT NULL DEFAULT '',
          resources TEXT,
          metadata TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_thread_memory_thread_created
        ON nodetool_thread_memories (thread_id, created_at)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_thread_memory_user
        ON nodetool_thread_memories (user_id)
      `);
    },
    async down(db) {
      await db.execute(
        "DROP INDEX IF EXISTS idx_thread_memory_thread_created"
      );
      await db.execute("DROP INDEX IF EXISTS idx_thread_memory_user");
      await db.execute("DROP TABLE IF EXISTS nodetool_thread_memories");
    }
  },

  // ── Create applications ─────────────────────────────────────────────
  // Mini apps get their own identity. Before this, an app *was* a workflow
  // (`workflow.app_doc`), so it could expose exactly one operation and had no
  // history. An application row owns a UI document plus typed bindings, and
  // each binding names a workflow.
  {
    version: "20260725_000000",
    name: "create_applications",
    createsTables: ["applications", "application_versions"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS applications (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          document TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_application_user
        ON applications (user_id)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_application_project
        ON applications (project_id)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_application_updated
        ON applications (updated_at)
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS application_versions (
          id TEXT PRIMARY KEY,
          application_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          document TEXT NOT NULL,
          capabilities TEXT NOT NULL,
          released INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_application_version_app
        ON application_versions (application_id)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_application_version_released
        ON application_versions (released)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_application_version_released");
      await db.execute("DROP INDEX IF EXISTS idx_application_version_app");
      await db.execute("DROP TABLE IF EXISTS application_versions");
      await db.execute("DROP INDEX IF EXISTS idx_application_updated");
      await db.execute("DROP INDEX IF EXISTS idx_application_project");
      await db.execute("DROP INDEX IF EXISTS idx_application_user");
      await db.execute("DROP TABLE IF EXISTS applications");
    }
  },

  // ── Add revision to the resource document tables ────────────────────
  // Mini-app resource bindings hand widgets a `ResourceRef { kind, id,
  // revision }`. A write carrying a stale revision is rejected, so an
  // interactive editing widget cannot silently clobber a concurrent edit.
  {
    version: "20260725_000001",
    name: "add_revision_to_resource_documents",
    createsTables: [],
    modifiesTables: ["timeline_sequences", "storyboards", "image_documents"],
    async up(db) {
      for (const table of [
        "timeline_sequences",
        "storyboards",
        "image_documents"
      ]) {
        if (!(await db.columnExists(table, "revision"))) {
          await db.execute(
            `ALTER TABLE ${table} ADD COLUMN revision INTEGER NOT NULL DEFAULT 0`
          );
        }
      }
    },
    async down(db) {
      for (const table of [
        "timeline_sequences",
        "storyboards",
        "image_documents"
      ]) {
        if (await db.columnExists(table, "revision")) {
          await db.execute(`ALTER TABLE ${table} DROP COLUMN revision`);
        }
      }
    }
  },

  // ── Create application budgets and the invocation ledger ────────────
  // A published app runs on the creator's secrets, so runs are checked against
  // a hard budget before the job is created and settled from the run's actual
  // provider cost afterwards. The ledger doubles as release telemetry, keyed by
  // (application_id, invocation_id).
  {
    version: "20260725_000002",
    name: "create_application_budgets",
    createsTables: ["application_budgets", "application_invocations"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS application_budgets (
          application_id TEXT PRIMARY KEY,
          period TEXT NOT NULL DEFAULT 'month',
          max_usd REAL,
          max_invocations INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS application_invocations (
          id TEXT PRIMARY KEY,
          application_id TEXT NOT NULL,
          version INTEGER,
          invocation_id TEXT NOT NULL,
          operation_id TEXT NOT NULL DEFAULT '',
          estimated_usd REAL NOT NULL DEFAULT 0,
          actual_usd REAL,
          status TEXT NOT NULL DEFAULT 'running',
          created_at TEXT NOT NULL,
          settled_at TEXT
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_application_invocation_app
        ON application_invocations (application_id)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_application_invocation_created
        ON application_invocations (created_at)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_application_invocation_invocation
        ON application_invocations (invocation_id)
      `);
    },
    async down(db) {
      await db.execute(
        "DROP INDEX IF EXISTS idx_application_invocation_invocation"
      );
      await db.execute("DROP INDEX IF EXISTS idx_application_invocation_created");
      await db.execute("DROP INDEX IF EXISTS idx_application_invocation_app");
      await db.execute("DROP TABLE IF EXISTS application_invocations");
      await db.execute("DROP TABLE IF EXISTS application_budgets");
    }
  },

  // ── Pin the graphs an application release runs ──────────────────────
  // A release used to copy the draft document and nothing else, so it ran
  // whatever the workflow happened to hold at run time. Publishing now freezes
  // each referenced workflow's graph onto the snapshot.
  {
    version: "20260726_000000",
    name: "add_workflow_graphs_to_application_versions",
    createsTables: [],
    modifiesTables: ["application_versions"],
    async up(db) {
      if (!(await db.columnExists("application_versions", "workflow_graphs"))) {
        await db.execute(
          "ALTER TABLE application_versions ADD COLUMN workflow_graphs TEXT"
        );
      }
    },
    async down() {
      // SQLite cannot drop a column on older engines; the column is nullable
      // and unread by prior code, so leaving it is harmless.
    }
  },

  // ── Operational safety columns on trigger_registrations ────────────
  // A trigger that fails every time used to keep firing forever. These
  // columns hold the counters the dispatcher settles against so it can
  // disarm a registration and say why (PRD O1), plus the two bounds a
  // registration may carry (F8).
  {
    version: "20260726_000001",
    name: "add_trigger_registration_safety_columns",
    createsTables: [],
    modifiesTables: ["trigger_registrations"],
    async up(db) {
      if (!(await db.tableExists("trigger_registrations"))) return;
      const columns: Array<[string, string]> = [
        ["disabled_reason", "TEXT"],
        ["consecutive_failures", "INTEGER NOT NULL DEFAULT 0"],
        ["run_count", "INTEGER NOT NULL DEFAULT 0"],
        ["expires_at", "TEXT"],
        ["max_runs", "INTEGER"]
      ];
      for (const [name, type] of columns) {
        if (await db.columnExists("trigger_registrations", name)) continue;
        await db.execute(
          `ALTER TABLE trigger_registrations ADD COLUMN ${name} ${type}`
        );
      }
    },
    async down() {
      // no-op: SQLite cannot drop columns portably, and leaving them is inert.
    }
  },

  // ── Lift workflow.app_doc into the applications table ───────────────
  // An app used to live on the workflow that hosted it. Every stored
  // `app_doc` becomes an application row of its own and the column is
  // cleared; the column itself is dropped a release later, once old clients
  // that still read it have upgraded.
  //
  // A workflow that was already turned into an application by
  // `create({ fromWorkflowId })` has a fork in the wild: two documents, the
  // application's possibly newer. The application wins — its draft is left
  // untouched — and the `app_doc` is written as an unreleased
  // `application_versions` row so the divergent copy shows up in the app's
  // version history instead of vanishing.
  //
  // Idempotent by construction: a lifted workflow's `app_doc` is NULL, so a
  // second run sees nothing to migrate.
  {
    version: "20260726_000002",
    name: "lift_workflow_app_docs_to_applications",
    createsTables: [],
    modifiesTables: [
      "nodetool_workflows",
      "applications",
      "application_versions"
    ],
    async up(db) {
      if (!(await db.tableExists("nodetool_workflows"))) return;
      if (!(await db.tableExists("applications"))) return;
      if (!(await db.columnExists("nodetool_workflows", "app_doc"))) return;

      const hosts = await db.fetchall(
        `SELECT id, user_id, name, description, app_doc, created_at, updated_at
           FROM nodetool_workflows
          WHERE app_doc IS NOT NULL AND app_doc <> ''`
      );
      if (hosts.length === 0) return;

      // Which application already binds which workflow. Read once and matched
      // in memory so the migration needs no dialect-specific JSON operators.
      const existing = await db.fetchall(
        "SELECT id, document, created_at FROM applications"
      );
      const appsByWorkflow = new Map<string, string>();
      for (const row of [...existing].sort((a, b) =>
        String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) ||
        String(a.id).localeCompare(String(b.id))
      )) {
        for (const workflowId of boundWorkflowIds(row.document)) {
          if (!appsByWorkflow.has(workflowId)) {
            appsByWorkflow.set(workflowId, String(row.id));
          }
        }
      }

      for (const host of hosts) {
        const workflowId = String(host.id);
        const document = liftLegacyAppDoc({
          id: workflowId,
          app_doc: host.app_doc
        });
        const now = new Date().toISOString();

        if (document) {
          const applicationId = appsByWorkflow.get(workflowId);
          if (applicationId) {
            // The application wins. Archive the fork as an unreleased version.
            const highest = await db.fetchone(
              "SELECT MAX(version) AS value FROM application_versions WHERE application_id = ?",
              [applicationId]
            );
            const nextVersion = Number(highest?.value ?? 0) + 1;
            await db.execute(
              `INSERT INTO application_versions
                 (id, application_id, version, document, capabilities, released, created_at)
               VALUES (?, ?, ?, ?, ?, 0, ?)`,
              [
                newRowId(),
                applicationId,
                nextVersion,
                JSON.stringify(document),
                capabilitiesOf(document),
                now
              ]
            );
          } else {
            const createdId = newRowId();
            await db.execute(
              `INSERT INTO applications
                 (id, user_id, project_id, name, description, document, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                createdId,
                String(host.user_id ?? ""),
                "default",
                String(host.name || "Untitled app"),
                String(host.description ?? ""),
                JSON.stringify(document),
                String(host.created_at ?? now),
                String(host.updated_at ?? now)
              ]
            );
            appsByWorkflow.set(workflowId, createdId);
          }
        }

        // Cleared whether or not the document parsed: an `app_doc` no code
        // reads and no parser accepts is not worth carrying forward.
        await db.execute(
          "UPDATE nodetool_workflows SET app_doc = NULL WHERE id = ?",
          [workflowId]
        );
      }
    },
    async down() {
      // no-op: the lifted documents are the canonical copy now, and pushing
      // them back onto workflows would resurrect the storage this removes.
    }
  },

  // ── Tie an application's children to the application ────────────────
  // `application_versions`, `application_invocations` and
  // `application_budgets` referenced `applications.id` by convention only:
  // no foreign key, no owner of their own. Deleting an app removed the parent
  // row and left the children behind, and an application id is
  // client-supplied — so recreating a deleted id handed the previous owner's
  // snapshots, ledger and budget to whoever claimed it next.
  //
  // Orphans are removed, the children gain the owner they were written for,
  // duplicate versions are collapsed so `(application_id, version)` can be
  // unique, and the tables get real ON DELETE CASCADE foreign keys.
  {
    version: "20260801_000000",
    name: "cascade_and_own_application_children",
    createsTables: [],
    modifiesTables: [
      "application_versions",
      "application_invocations",
      "application_budgets"
    ],
    async up(db) {
      if (!(await db.tableExists("applications"))) return;

      const children = [
        "application_versions",
        "application_invocations",
        "application_budgets"
      ];
      const present: string[] = [];
      for (const table of children) {
        if (await db.tableExists(table)) present.push(table);
      }

      // Children whose parent is already gone. These are exactly the rows a
      // recreated id would inherit.
      for (const table of present) {
        await db.execute(
          `DELETE FROM ${table}
            WHERE application_id NOT IN (SELECT id FROM applications)`
        );
      }

      // Ownership, backfilled from the parent.
      for (const table of ["application_versions", "application_invocations"]) {
        if (!present.includes(table)) continue;
        if (!(await db.columnExists(table, "user_id"))) {
          await db.execute(`ALTER TABLE ${table} ADD COLUMN user_id TEXT`);
        }
        await db.execute(
          `UPDATE ${table}
              SET user_id = (
                SELECT user_id FROM applications
                 WHERE applications.id = ${table}.application_id
              )
            WHERE user_id IS NULL`
        );
      }

      if (present.includes("application_versions")) {
        await dedupeApplicationVersions(db);
        await db.execute(
          `CREATE UNIQUE INDEX IF NOT EXISTS idx_application_version_app_version
             ON application_versions (application_id, version)`
        );
      }

      for (const table of present) {
        await addApplicationForeignKey(db, table);
      }
    },
    async down(db) {
      await db.execute(
        "DROP INDEX IF EXISTS idx_application_version_app_version"
      );
      if (db.dbType !== "postgres") return;
      for (const table of [
        "application_versions",
        "application_invocations",
        "application_budgets"
      ]) {
        await db.execute(
          `ALTER TABLE IF EXISTS ${table}
             DROP CONSTRAINT IF EXISTS ${table}_application_id_fkey`
        );
      }
      // The `user_id` columns stay: SQLite cannot drop a column portably and
      // the column is inert to code that does not read it.
    }
  },

  // ── Workflow supervision opt-in on trigger_registrations ───────────
  // A trigger run can be supervised: a failing node escalates to a model
  // instead of failing the run outright. The column defaults to 0 and no
  // existing registration is touched — enabling supervision shares failure
  // context with a model, so consent is per-registration and forward-looking
  // (docs/workflow-supervisor-design.md §6.1).
  {
    version: "20260801_000001",
    name: "add_trigger_registration_supervise",
    createsTables: [],
    modifiesTables: ["trigger_registrations"],
    async up(db) {
      if (!(await db.tableExists("trigger_registrations"))) return;
      if (await db.columnExists("trigger_registrations", "supervise")) return;
      await db.execute(
        "ALTER TABLE trigger_registrations ADD COLUMN supervise INTEGER NOT NULL DEFAULT 0"
      );
    },
    async down() {
      // no-op: SQLite cannot drop columns portably, and leaving it is inert.
    }
  },

  // ── Timeline version history ───────────────────────────────────────
  // Snapshots of a timeline sequence: the document plus the render settings it
  // was written against, so restoring one restores what the editor showed.
  // `save_type` separates manual saves from autosaves and the snapshot taken
  // before a restore — only autosaves are pruned. The unique index on
  // (timeline_id, version) is what keeps two concurrent writers from minting
  // the same version number; the foreign key keeps a deleted sequence's
  // history from outliving it.
  {
    version: "20260804_000000",
    name: "create_timeline_sequence_versions",
    createsTables: ["timeline_sequence_versions"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS timeline_sequence_versions (
          id TEXT PRIMARY KEY NOT NULL,
          timeline_id TEXT NOT NULL REFERENCES timeline_sequences (id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          name TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          save_type TEXT NOT NULL DEFAULT 'manual',
          fps INTEGER NOT NULL DEFAULT 30,
          width INTEGER NOT NULL DEFAULT 1920,
          height INTEGER NOT NULL DEFAULT 1080,
          duration_ms INTEGER NOT NULL DEFAULT 0,
          document TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);
      await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_tsv_timeline ON timeline_sequence_versions (timeline_id)"
      );
      await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_tsv_user ON timeline_sequence_versions (user_id)"
      );
      await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_tsv_timeline_save_type_created ON timeline_sequence_versions (timeline_id, save_type, created_at)"
      );
      await db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_tsv_timeline_version ON timeline_sequence_versions (timeline_id, version)"
      );
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_tsv_timeline_version");
      await db.execute("DROP INDEX IF EXISTS idx_tsv_timeline_save_type_created");
      await db.execute("DROP INDEX IF EXISTS idx_tsv_user");
      await db.execute("DROP INDEX IF EXISTS idx_tsv_timeline");
      await db.execute("DROP TABLE IF EXISTS timeline_sequence_versions");
    }
  },

  // ── Stamp the machine executing a run onto its job row ─────────────
  // With more than one server instance behind the Fly proxy, a reconnecting
  // client lands on a random machine while the run lives on exactly one. The
  // row records which, so the upgrade can be replayed to the owner and a
  // cancel can be addressed at it. Null everywhere on a single-machine
  // deployment, where the column is inert.
  {
    version: "20260805_000000",
    name: "add_runner_instance_to_jobs",
    createsTables: [],
    modifiesTables: ["nodetool_jobs"],
    async up(db) {
      if (!(await db.tableExists("nodetool_jobs"))) return;
      if (await db.columnExists("nodetool_jobs", "runner_instance")) return;
      await db.execute(
        "ALTER TABLE nodetool_jobs ADD COLUMN runner_instance TEXT"
      );
    },
    async down() {
      // no-op: dropping columns is unsafe across dialects and versions
    }
  },

  // ── Sketch version history ─────────────────────────────────────────
  // Snapshots of an image document: the document plus the canvas settings it
  // was written against, so restoring one restores what the editor showed.
  // `save_type` separates manual saves from autosaves and the snapshot taken
  // before a restore — only autosaves are pruned. The unique index on
  // (image_document_id, version) is what keeps two concurrent writers from
  // minting the same version number; the foreign key keeps a deleted
  // document's history from outliving it.
  {
    version: "20260805_000001",
    name: "create_image_document_versions",
    createsTables: ["image_document_versions"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS image_document_versions (
          id TEXT PRIMARY KEY NOT NULL,
          image_document_id TEXT NOT NULL REFERENCES image_documents (id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          name TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          save_type TEXT NOT NULL DEFAULT 'manual',
          width INTEGER NOT NULL DEFAULT 1024,
          height INTEGER NOT NULL DEFAULT 1024,
          background_color TEXT NOT NULL DEFAULT '#ffffff',
          document TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);
      await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_idv_document ON image_document_versions (image_document_id)"
      );
      await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_idv_user ON image_document_versions (user_id)"
      );
      await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_idv_document_save_type_created ON image_document_versions (image_document_id, save_type, created_at)"
      );
      await db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_idv_document_version ON image_document_versions (image_document_id, version)"
      );
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_idv_document_version");
      await db.execute("DROP INDEX IF EXISTS idx_idv_document_save_type_created");
      await db.execute("DROP INDEX IF EXISTS idx_idv_user");
      await db.execute("DROP INDEX IF EXISTS idx_idv_document");
      await db.execute("DROP TABLE IF EXISTS image_document_versions");
    }
  },

  // ── User credits and subscription plans ────────────────────────────
  // The Studio product's billing veneer. The ledger holds grants only
  // (plan accruals, top-ups, adjustments); spend already lives in
  // nodetool_predictions, so balance = sum(delta) - spend-in-credits.
  // Plan grants use the id `plan:<userId>:<periodKey>` so the lazy monthly
  // accrual is idempotent by primary key. One subscription row per user;
  // payment state stays out until a payment provider is wired in.
  {
    version: "20260806_000000",
    name: "create_credit_ledger_and_subscriptions",
    createsTables: ["nodetool_credit_ledger", "nodetool_user_subscriptions"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS nodetool_credit_ledger (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          delta INTEGER NOT NULL,
          kind TEXT NOT NULL,
          description TEXT,
          period_key TEXT,
          created_at TEXT NOT NULL
        )
      `);
      await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_credit_ledger_user ON nodetool_credit_ledger (user_id)"
      );
      await db.execute(`
        CREATE TABLE IF NOT EXISTS nodetool_user_subscriptions (
          user_id TEXT PRIMARY KEY NOT NULL,
          plan_id TEXT NOT NULL DEFAULT 'free',
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
    },
    async down(db) {
      await db.execute("DROP TABLE IF EXISTS nodetool_user_subscriptions");
      await db.execute("DROP INDEX IF EXISTS idx_credit_ledger_user");
      await db.execute("DROP TABLE IF EXISTS nodetool_credit_ledger");
    }
  },

  // ── Create js_scripts ───────────────────────────────────────────────
  // A JS script document: a named, user-owned script with declared ports,
  // sandbox packages, secrets and saved test cases. Distinct from `scripts`,
  // which holds video/voiceover scripts.
  {
    version: "20260812_000000",
    name: "create_js_scripts",
    createsTables: ["js_scripts"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS js_scripts (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          name TEXT NOT NULL,
          document TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_js_script_user
        ON js_scripts (user_id)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_js_script_project
        ON js_scripts (project_id)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_js_script_updated
        ON js_scripts (updated_at)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_js_script_user");
      await db.execute("DROP INDEX IF EXISTS idx_js_script_project");
      await db.execute("DROP INDEX IF EXISTS idx_js_script_updated");
      await db.execute("DROP TABLE IF EXISTS js_scripts");
    }
  },

  // ── Create js_script_versions ───────────────────────────────────────
  // Whole-document snapshot history for a JS script, mirroring
  // image_document_versions.
  {
    version: "20260812_000001",
    name: "create_js_script_versions",
    createsTables: ["js_script_versions"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS js_script_versions (
          id TEXT PRIMARY KEY NOT NULL,
          js_script_id TEXT NOT NULL REFERENCES js_scripts (id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          name TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          save_type TEXT NOT NULL DEFAULT 'manual',
          document TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);
      await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_jsv_script ON js_script_versions (js_script_id)"
      );
      await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_jsv_user ON js_script_versions (user_id)"
      );
      await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_jsv_script_save_type_created ON js_script_versions (js_script_id, save_type, created_at)"
      );
      await db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_jsv_script_version ON js_script_versions (js_script_id, version)"
      );
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_jsv_script_version");
      await db.execute("DROP INDEX IF EXISTS idx_jsv_script_save_type_created");
      await db.execute("DROP INDEX IF EXISTS idx_jsv_user");
      await db.execute("DROP INDEX IF EXISTS idx_jsv_script");
      await db.execute("DROP TABLE IF EXISTS js_script_versions");
    }
  },

  // ── Link a script back to its storyboard ────────────────────────────
  // The storyboard owns the link (it projects line text into shots); the
  // script keeps a back-pointer so "open storyboard" works from the script
  // editor, exactly like the existing timeline_id back-pointer.
  {
    version: "20260816_000000",
    name: "add_storyboard_id_to_scripts",
    createsTables: [],
    modifiesTables: ["scripts"],
    async up(db) {
      if (!(await db.tableExists("scripts"))) return;
      if (!(await db.columnExists("scripts", "storyboard_id"))) {
        await db.execute("ALTER TABLE scripts ADD COLUMN storyboard_id TEXT");
      }
    },
    async down() {
      // no-op: dropping columns is unsafe across dialects and versions
    }
  },

  // ── Create external_identities ──────────────────────────────────────
  // Messaging-platform accounts bound to NodeTool users. `provider` is a
  // column, so a second adapter adds a string rather than a table.
  {
    version: "20260818_000000",
    name: "create_external_identities",
    createsTables: ["external_identities"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS external_identities (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          external_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          linked_at TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_external_identity_provider_external
        ON external_identities (provider, external_id)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_external_identity_user
        ON external_identities (user_id)
      `);
    },
    async down(db) {
      await db.execute(
        "DROP INDEX IF EXISTS idx_external_identity_provider_external"
      );
      await db.execute("DROP INDEX IF EXISTS idx_external_identity_user");
      await db.execute("DROP TABLE IF EXISTS external_identities");
    }
  },

  // ── Create access_tokens ────────────────────────────────────────────
  // Revocable bearer tokens an external agent presents instead of a session.
  // Only a hash of the secret half is stored; the row id is the token's
  // public half, so verification is one indexed read.
  {
    version: "20260822_000000",
    name: "create_access_tokens",
    createsTables: ["access_tokens"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS access_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          secret_hash TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT,
          last_used_at TEXT
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_access_token_user
        ON access_tokens (user_id)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_access_token_user");
      await db.execute("DROP TABLE IF EXISTS access_tokens");
    }
  },

  // ── Create MCP OAuth tables ─────────────────────────────────────────
  // DCR clients, per-(user, client) grants, and the access/refresh tokens
  // minted for a grant. Same secret-hash scheme as access_tokens; see
  // docs/mcp-oauth-design.md § "Token model and storage".
  {
    version: "20260823_000000",
    name: "create_mcp_oauth_tables",
    createsTables: [
      "mcp_oauth_clients",
      "mcp_oauth_grants",
      "mcp_oauth_tokens"
    ],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
          id TEXT PRIMARY KEY,
          client_name TEXT NOT NULL,
          redirect_uris TEXT NOT NULL,
          created_at TEXT NOT NULL,
          last_used_at TEXT
        )
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS mcp_oauth_grants (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          client_id TEXT NOT NULL,
          client_name TEXT NOT NULL,
          scope TEXT NOT NULL,
          resource TEXT NOT NULL,
          created_at TEXT NOT NULL,
          revoked_at TEXT
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_mcp_oauth_grant_user
        ON mcp_oauth_grants (user_id)
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS mcp_oauth_tokens (
          id TEXT PRIMARY KEY,
          grant_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          secret_hash TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          rotated_from TEXT,
          last_used_at TEXT
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_mcp_oauth_token_grant
        ON mcp_oauth_tokens (grant_id)
      `);
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_oauth_token_rotated_from
        ON mcp_oauth_tokens (rotated_from)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_mcp_oauth_token_rotated_from");
      await db.execute("DROP INDEX IF EXISTS idx_mcp_oauth_token_grant");
      await db.execute("DROP TABLE IF EXISTS mcp_oauth_tokens");
      await db.execute("DROP INDEX IF EXISTS idx_mcp_oauth_grant_user");
      await db.execute("DROP TABLE IF EXISTS mcp_oauth_grants");
      await db.execute("DROP TABLE IF EXISTS mcp_oauth_clients");
    }
  },

  // ── Drop the unwired durable-execution tables ──────────────────────
  // `run_leases` and `run_node_state` were ported from the Python codebase
  // for a resume-from-suspension runtime that was never built. Nothing read
  // or wrote either table. The suspend/resume code they belonged to is gone;
  // these follow it.
  {
    version: "20260826_000000",
    name: "drop_run_leases_and_run_node_state",
    createsTables: [],
    modifiesTables: [],
    async up(db) {
      await db.execute("DROP INDEX IF EXISTS idx_run_leases_expires");
      await db.execute("DROP TABLE IF EXISTS run_leases");
      await db.execute("DROP INDEX IF EXISTS idx_run_node_state_run_status");
      await db.execute("DROP INDEX IF EXISTS idx_run_node_state_run_node");
      await db.execute("DROP TABLE IF EXISTS run_node_state");
    },
    async down() {
      // One-way: the tables held no data any code ever wrote.
    }
  },

  // ── Create skills ────────────────────────────────────────────────────
  // DB-backed agent skills, replacing filesystem SKILL.md files. Name and
  // description are columns (no frontmatter), content is markdown.
  {
    version: "20260827_000000",
    name: "create_skills",
    createsTables: ["skills"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS skills (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          content TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_skills_user
        ON skills (user_id)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_skills_user_name
        ON skills (user_id, name)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_skills_updated
        ON skills (updated_at)
      `);
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_user_name_unique
        ON skills (user_id, name)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_skills_user_name_unique");
      await db.execute("DROP INDEX IF EXISTS idx_skills_updated");
      await db.execute("DROP INDEX IF EXISTS idx_skills_user_name");
      await db.execute("DROP INDEX IF EXISTS idx_skills_user");
      await db.execute("DROP TABLE IF EXISTS skills");
    }
  },

  // ── Rename thread_memories → memories ────────────────────────────────
  // Memory stops being per-conversation. The rows are user-scoped now and
  // every thread reads all of them, so `thread_id` becomes provenance and
  // the hot index moves to (user_id, created_at). A fresh install already
  // has the new table from the create-schema DDL, so the rename is skipped.
  {
    version: "20260827_000001",
    name: "rename_thread_memories_to_memories",
    createsTables: [],
    modifiesTables: ["nodetool_memories"],
    async up(db) {
      if (await db.tableExists("nodetool_thread_memories")) {
        if (await db.tableExists("nodetool_memories")) {
          // Both present: the new table came from the create-schema DDL on a
          // database that also carries the old one. Move the rows over rather
          // than failing the rename, then retire the old table.
          await db.execute(`
            INSERT INTO nodetool_memories (
              id, user_id, thread_id, kind, title, content,
              resources, metadata, created_at, updated_at
            )
            SELECT id, user_id, thread_id, kind, title, content,
                   resources, metadata, created_at, updated_at
              FROM nodetool_thread_memories
             WHERE id NOT IN (SELECT id FROM nodetool_memories)
          `);
          await db.execute("DROP TABLE nodetool_thread_memories");
        } else {
          await db.execute(
            "ALTER TABLE nodetool_thread_memories RENAME TO nodetool_memories"
          );
        }
      }
      await db.execute("DROP INDEX IF EXISTS idx_thread_memory_thread_created");
      await db.execute("DROP INDEX IF EXISTS idx_thread_memory_user");
      // Neither table is present when a `down()` sequence has torn the schema
      // back past the create step; there is nothing to index.
      if (!(await db.tableExists("nodetool_memories"))) return;
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_memory_user_created
        ON nodetool_memories (user_id, created_at)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_memory_thread_created
        ON nodetool_memories (thread_id, created_at)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_memory_user_created");
      await db.execute("DROP INDEX IF EXISTS idx_memory_thread_created");
      if (!(await db.tableExists("nodetool_memories"))) return;
      await db.execute(
        "ALTER TABLE nodetool_memories RENAME TO nodetool_thread_memories"
      );
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_thread_memory_thread_created
        ON nodetool_thread_memories (thread_id, created_at)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_thread_memory_user
        ON nodetool_thread_memories (user_id)
      `);
    }
  },

  // ── Create projects ──────────────────────────────────────────────────
  // The project is the unit of the workspace. Every document table already
  // carries `project_id`; this is the row it points at. `"default"` stays the
  // loose-documents bucket and gets no row — nothing is migrated into one.
  {
    version: "20260829_000000",
    name: "create_projects",
    createsTables: ["projects"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_project_user ON projects (user_id)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_project_updated ON projects (updated_at)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_project_updated");
      await db.execute("DROP INDEX IF EXISTS idx_project_user");
      await db.execute("DROP TABLE IF EXISTS projects");
    }
  },

  // ── Attribute ledger rows to a project and a document ────────────────
  // A project's spend is the sum of the prediction rows that name it. Both
  // columns are nullable and every existing row keeps a null: a run outside a
  // project has no project, and saying so beats inventing one.
  {
    version: "20260829_000001",
    name: "add_prediction_project_attribution",
    createsTables: [],
    modifiesTables: ["nodetool_predictions"],
    async up(db) {
      if (!(await db.columnExists("nodetool_predictions", "project_id"))) {
        await db.execute(
          "ALTER TABLE nodetool_predictions ADD COLUMN project_id TEXT"
        );
      }
      if (!(await db.columnExists("nodetool_predictions", "document_id"))) {
        await db.execute(
          "ALTER TABLE nodetool_predictions ADD COLUMN document_id TEXT"
        );
      }
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_prediction_user_project
        ON nodetool_predictions (user_id, project_id)
      `);
    },
    async down(db) {
      await db.execute("DROP INDEX IF EXISTS idx_prediction_user_project");
      // SQLite before 3.35 cannot drop a column, and the data in these two is
      // attribution nothing else reads. Leaving them is the safe direction.
    }
  },

  // ── Create application_deployments ───────────────────────────────────
  // An app served from a hidden URL with no login. One live row per app; the
  // token is the whole secret, so it is unique across every app on the
  // server, and revoking sets `revoked_at` rather than deleting the row.
  {
    version: "20260829_000003",
    name: "create_application_deployments",
    createsTables: ["application_deployments"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS application_deployments (
          id TEXT PRIMARY KEY,
          application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          token TEXT NOT NULL,
          created_at TEXT NOT NULL,
          revoked_at TEXT
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_application_deployment_app
        ON application_deployments (application_id)
      `);
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_application_deployment_token
        ON application_deployments (token)
      `);
    },
    async down(db) {
      await db.execute(
        "DROP INDEX IF EXISTS idx_application_deployment_token"
      );
      await db.execute("DROP INDEX IF EXISTS idx_application_deployment_app");
      await db.execute("DROP TABLE IF EXISTS application_deployments");
    }
  },

  // ── Constrain public deployment and invocation identities ───────────
  {
    version: "20260829_000004",
    name: "constrain_application_deployments_and_invocations",
    createsTables: [],
    modifiesTables: ["application_deployments", "application_invocations"],
    async up(db) {
      const revokedAt = new Date().toISOString();
      const duplicateDeployments = await db.fetchall(
        `SELECT application_id
           FROM application_deployments
          WHERE revoked_at IS NULL
          GROUP BY application_id
         HAVING COUNT(*) > 1`
      );
      for (const duplicate of duplicateDeployments) {
        const rows = await db.fetchall(
          `SELECT id
             FROM application_deployments
            WHERE application_id = ? AND revoked_at IS NULL
            ORDER BY created_at DESC, id DESC`,
          [duplicate.application_id]
        );
        for (const row of rows.slice(1)) {
          await db.execute(
            "UPDATE application_deployments SET revoked_at = ? WHERE id = ?",
            [revokedAt, row.id]
          );
        }
      }

      const duplicateInvocations = await db.fetchall(
        `SELECT application_id, invocation_id
           FROM application_invocations
          GROUP BY application_id, invocation_id
         HAVING COUNT(*) > 1`
      );
      for (const duplicate of duplicateInvocations) {
        const rows = await db.fetchall(
          `SELECT id
             FROM application_invocations
            WHERE application_id = ? AND invocation_id = ?
            ORDER BY created_at DESC, id DESC`,
          [duplicate.application_id, duplicate.invocation_id]
        );
        for (const row of rows.slice(1)) {
          await db.execute(
            "UPDATE application_invocations SET invocation_id = ? WHERE id = ?",
            [`legacy:${row.id}`, row.id]
          );
        }
      }

      await db.execute(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_application_deployment_one_live
           ON application_deployments (application_id)
         WHERE revoked_at IS NULL`
      );
      await db.execute(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_application_invocation_app_invocation
           ON application_invocations (application_id, invocation_id)`
      );
    },
    async down(db) {
      await db.execute(
        "DROP INDEX IF EXISTS idx_application_invocation_app_invocation"
      );
      await db.execute(
        "DROP INDEX IF EXISTS idx_application_deployment_one_live"
      );
    }
  },

  // ── Bind a project to its agent thread ───────────────────────────────
  // The overview's left column is the conversation that built the project.
  // Nullable: a project made by hand has never been talked to, and a null
  // says so where a fabricated empty thread row would not.
  //
  // Numbered _000005 rather than _000002, which it held on the branch that
  // introduced it. The deployments branch used _000002 for
  // `create_application_deployments` before both merged, so a database
  // migrated on either branch has _000002 recorded already and the runner —
  // which keys on the version alone — would skip this one forever, leaving
  // `projects` without the column. A version no database has consumed runs
  // everywhere.
  {
    version: "20260829_000005",
    name: "add_project_thread",
    createsTables: [],
    modifiesTables: ["projects"],
    async up(db) {
      if (!(await db.columnExists("projects", "thread_id"))) {
        await db.execute("ALTER TABLE projects ADD COLUMN thread_id TEXT");
      }
    },
    async down(db) {
      // SQLite before 3.35 cannot drop a column; the value is one id nothing
      // else reads, so leaving it is the safe direction.
      void db;
    }
  }
];

/**
 * Collapse what the missing constraints allowed: two snapshots sharing a
 * version number, and two snapshots flagged released. The newest row wins in
 * both cases, which is the one a client last saw.
 */
async function dedupeApplicationVersions(
  db: MigrationDBAdapter
): Promise<void> {
  const duplicates = await db.fetchall(
    `SELECT application_id, version
       FROM application_versions
      GROUP BY application_id, version
     HAVING COUNT(*) > 1`
  );
  for (const duplicate of duplicates) {
    const rows = await db.fetchall(
      `SELECT id FROM application_versions
        WHERE application_id = ? AND version = ?
        ORDER BY created_at DESC, id DESC`,
      [duplicate.application_id, duplicate.version]
    );
    for (const row of rows.slice(1)) {
      await db.execute("DELETE FROM application_versions WHERE id = ?", [
        row.id
      ]);
    }
  }

  const multiReleased = await db.fetchall(
    `SELECT application_id
       FROM application_versions
      WHERE released = 1
      GROUP BY application_id
     HAVING COUNT(*) > 1`
  );
  for (const app of multiReleased) {
    const rows = await db.fetchall(
      `SELECT id FROM application_versions
        WHERE application_id = ? AND released = 1
        ORDER BY version DESC`,
      [app.application_id]
    );
    for (const row of rows.slice(1)) {
      await db.execute(
        "UPDATE application_versions SET released = 0 WHERE id = ?",
        [row.id]
      );
    }
  }
}

/** The columns and indexes each child table is rebuilt with under SQLite. */
const SQLITE_CHILD_TABLES: Record<
  string,
  { definition: string; columns: string[]; indexes: string[] }
> = {
  application_versions: {
    definition: `
      id TEXT PRIMARY KEY NOT NULL,
      application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
      user_id TEXT,
      version INTEGER NOT NULL,
      document TEXT NOT NULL,
      capabilities TEXT NOT NULL,
      workflow_graphs TEXT,
      released INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    `,
    columns: [
      "id",
      "application_id",
      "user_id",
      "version",
      "document",
      "capabilities",
      "workflow_graphs",
      "released",
      "created_at"
    ],
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_application_version_app ON application_versions (application_id)",
      "CREATE INDEX IF NOT EXISTS idx_application_version_released ON application_versions (released)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_application_version_app_version ON application_versions (application_id, version)"
    ]
  },
  application_invocations: {
    definition: `
      id TEXT PRIMARY KEY NOT NULL,
      application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
      user_id TEXT,
      version INTEGER,
      invocation_id TEXT NOT NULL,
      operation_id TEXT NOT NULL DEFAULT '',
      estimated_usd REAL NOT NULL DEFAULT 0,
      actual_usd REAL,
      status TEXT NOT NULL DEFAULT 'running',
      created_at TEXT NOT NULL,
      settled_at TEXT
    `,
    columns: [
      "id",
      "application_id",
      "user_id",
      "version",
      "invocation_id",
      "operation_id",
      "estimated_usd",
      "actual_usd",
      "status",
      "created_at",
      "settled_at"
    ],
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_application_invocation_app ON application_invocations (application_id)",
      "CREATE INDEX IF NOT EXISTS idx_application_invocation_created ON application_invocations (created_at)",
      "CREATE INDEX IF NOT EXISTS idx_application_invocation_invocation ON application_invocations (invocation_id)"
    ]
  },
  application_budgets: {
    definition: `
      application_id TEXT PRIMARY KEY NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
      period TEXT NOT NULL DEFAULT 'month',
      max_usd REAL,
      max_invocations INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    `,
    columns: [
      "application_id",
      "period",
      "max_usd",
      "max_invocations",
      "created_at",
      "updated_at"
    ],
    indexes: []
  }
};

/**
 * Point a child table at `applications.id` with ON DELETE CASCADE.
 *
 * PostgreSQL takes the constraint directly. SQLite cannot add one to an
 * existing table, so the table is rebuilt — the standard copy/drop/rename —
 * and skipped entirely once the declaration is there.
 */
async function addApplicationForeignKey(
  db: MigrationDBAdapter,
  table: string
): Promise<void> {
  if (db.dbType === "postgres") {
    const existing = await db.fetchone(
      "SELECT 1 AS found FROM pg_constraint WHERE conname = ?",
      [`${table}_application_id_fkey`]
    );
    if (existing) return;
    await db.execute(
      `ALTER TABLE ${table}
         ADD CONSTRAINT ${table}_application_id_fkey
         FOREIGN KEY (application_id) REFERENCES applications (id)
         ON DELETE CASCADE`
    );
    return;
  }

  const spec = SQLITE_CHILD_TABLES[table];
  if (!spec) return;
  const current = await db.fetchone(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
    [table]
  );
  if (String(current?.sql ?? "").includes("REFERENCES")) return;

  const columns = spec.columns.join(", ");
  await db.execute(`CREATE TABLE ${table}__new (${spec.definition})`);
  await db.execute(
    `INSERT INTO ${table}__new (${columns}) SELECT ${columns} FROM ${table}`
  );
  await db.execute(`DROP TABLE ${table}`);
  await db.execute(`ALTER TABLE ${table}__new RENAME TO ${table}`);
  for (const index of spec.indexes) await db.execute(index);
}
