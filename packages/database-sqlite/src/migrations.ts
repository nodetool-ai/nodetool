import Database from "better-sqlite3";
import { SQLITE_CORE_BASELINE_SQL, JOB_TRACE_MARKER_DDL, ASSET_FAVORITE_DDL } from "@nodetool-ai/models-core";

interface ColumnInfo {
  readonly name: string;
  readonly type: string;
  readonly notnull: number;
  readonly dflt_value: string | null;
}

const coreTables = ["nodetool_workflows", "nodetool_assets", "nodetool_jobs", "nodetool_secrets"];

function columns(sqlite: Database.Database, table: string): ColumnInfo[] {
  return sqlite.prepare<[], ColumnInfo>(`PRAGMA table_info("${table}")`).all();
}

function hasColumn(sqlite: Database.Database, table: string, column: string): boolean {
  return columns(sqlite, table).some(({ name }) => name === column);
}

function hasTable(sqlite: Database.Database, table: string): boolean {
  return sqlite.prepare<[string], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined;
}

function applyCoreBaseline(sqlite: Database.Database): void {
  const statements = SQLITE_CORE_BASELINE_SQL.split(";").map((statement) => statement.trim()).filter(Boolean);
  sqlite.exec(statements.filter((statement) => statement.startsWith("CREATE TABLE")).join(";"));
  const frozen = new Database(":memory:");
  try {
    frozen.exec(SQLITE_CORE_BASELINE_SQL);
    for (const table of coreTables) {
      const existing = new Set(columns(sqlite, table).map(({ name }) => name));
      for (const column of columns(frozen, table)) {
        if (existing.has(column.name)) { continue; }
        // Match the full server's frozen additive compatibility repair: SQLite
        // cannot add a required historical column without a constant default.
        const definition = column.type + (column.notnull && column.dflt_value !== null ? ` NOT NULL DEFAULT ${column.dflt_value}` : "");
        sqlite.exec(`ALTER TABLE "${table}" ADD COLUMN "${column.name}" ${definition}`);
      }
    }
    sqlite.exec(statements.filter((statement) => statement.startsWith("CREATE INDEX") || statement.startsWith("CREATE UNIQUE INDEX")).join(";"));
  } finally { frozen.close(); }
}

/** Apply only execution-table compatibility work without claiming full feature migrations. */
export function migrateSqliteCore(sqlite: Database.Database): void {
  sqlite.transaction(() => {
    sqlite.exec("CREATE TABLE IF NOT EXISTS _nodetool_core_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    const migrations = [
      {
        version: "20261001_000000",
        up() {
          applyCoreBaseline(sqlite);
          sqlite.exec("UPDATE nodetool_assets SET updated_at = created_at WHERE updated_at IS NULL");
          sqlite.exec(`UPDATE nodetool_assets SET sketch_document_id = json_extract(metadata, '$.sketchDocumentId')
            WHERE sketch_document_id IS NULL AND metadata IS NOT NULL AND json_valid(metadata)
            AND json_extract(metadata, '$.sketchDocumentId') IS NOT NULL`);
        }
      },
      {
        version: "20261004_000003",
        up() {
          if (!hasColumn(sqlite, "nodetool_jobs", "has_run_trace")) { sqlite.exec(JOB_TRACE_MARKER_DDL); }
          if (hasTable(sqlite, "nodetool_run_traces")) {
            sqlite.exec("UPDATE nodetool_jobs SET has_run_trace = 1 WHERE EXISTS (SELECT 1 FROM nodetool_run_traces t WHERE t.kind = 'workflow' AND t.source_id = nodetool_jobs.id AND t.user_id = nodetool_jobs.user_id)");
          }
        }
      },
      {
        version: "20261006_000000",
        up() {
          if (!hasColumn(sqlite, "nodetool_assets", "favorite")) { sqlite.exec(ASSET_FAVORITE_DDL); }
        }
      }
    ];
    for (const migration of migrations) {
      if (sqlite.prepare<[string], { version: string }>("SELECT version FROM _nodetool_core_migrations WHERE version = ?").get(migration.version)) { continue; }
      migration.up();
      sqlite.prepare("INSERT INTO _nodetool_core_migrations (version, applied_at) VALUES (?, ?)").run(migration.version, new Date().toISOString());
    }
  })();
}
