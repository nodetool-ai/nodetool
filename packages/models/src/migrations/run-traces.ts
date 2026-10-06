import type { MigrationDBAdapter } from "./db-adapter.js";

export const RUN_TRACES_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS nodetool_run_traces (
    id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL, source_id TEXT NOT NULL,
    parent_run_id TEXT, canonical_root_id TEXT NOT NULL, trace_id TEXT NOT NULL, root_span_id TEXT,
    origin TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'running', started_at TEXT NOT NULL, ended_at TEXT,
    cost_usd REAL, error TEXT, content_expired INTEGER NOT NULL DEFAULT 0, truncated INTEGER NOT NULL DEFAULT 0,
    incomplete INTEGER NOT NULL DEFAULT 0, parents TEXT NOT NULL, next_cursor INTEGER NOT NULL DEFAULT 0,
    span_count INTEGER NOT NULL DEFAULT 0, event_count INTEGER NOT NULL DEFAULT 0
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_run_trace_canonical ON nodetool_run_traces(trace_id) WHERE parent_run_id IS NULL",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_run_trace_user_source ON nodetool_run_traces(user_id,kind,source_id)",
  "CREATE INDEX IF NOT EXISTS idx_run_trace_owner_trace ON nodetool_run_traces(user_id,trace_id)",
  "CREATE INDEX IF NOT EXISTS idx_run_trace_trace ON nodetool_run_traces(trace_id)",
  "CREATE INDEX IF NOT EXISTS idx_run_trace_root ON nodetool_run_traces(canonical_root_id)",
  "CREATE INDEX IF NOT EXISTS idx_run_trace_owner_started ON nodetool_run_traces(user_id,started_at)",
  `CREATE TABLE IF NOT EXISTS nodetool_run_spans (
    id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, run_id TEXT NOT NULL, trace_id TEXT NOT NULL,
    span_id TEXT NOT NULL, cursor INTEGER NOT NULL, update_kind TEXT NOT NULL, metadata TEXT NOT NULL,
    content TEXT, error_summary TEXT, content_expired INTEGER NOT NULL DEFAULT 0,
    truncated INTEGER NOT NULL DEFAULT 0, incomplete INTEGER NOT NULL DEFAULT 0
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_run_span_identity ON nodetool_run_spans(trace_id,span_id)",
  "CREATE INDEX IF NOT EXISTS idx_run_span_owner_trace_cursor ON nodetool_run_spans(user_id,trace_id,cursor)",
  "CREATE INDEX IF NOT EXISTS idx_run_span_run ON nodetool_run_spans(run_id)"
];

/** Restrict Data API readers to owners and keep all writes on the execution host. */
export async function applyRunTraceRls(db: MigrationDBAdapter): Promise<void> {
  if (db.dbType !== "postgres") { return; }
  for (const table of ["nodetool_run_traces", "nodetool_run_spans"]) {
    await db.execute(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await db.execute(`REVOKE ALL ON ${table} FROM PUBLIC`);
    await db.execute(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON ${table} FROM anon';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON ${table} FROM authenticated';
        IF to_regprocedure('auth.uid()') IS NOT NULL THEN
          EXECUTE 'GRANT SELECT ON ${table} TO authenticated';
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = '${table}' AND policyname = '${table}_owner_read') THEN
            EXECUTE 'CREATE POLICY ${table}_owner_read ON ${table} FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid())::text)';
          END IF;
        END IF;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'GRANT ALL ON ${table} TO service_role';
      END IF;
    END $$`);
  }
}
