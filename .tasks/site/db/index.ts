import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "migrations");

function resolveDbPath(): string {
  if (process.env.NODETOOL_TASKS_DB) return resolve(process.env.NODETOOL_TASKS_DB);
  return resolve(__dirname, "..", "..", "data.db");
}

function applyMigrations(sqlite: Database.Database) {
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
       version INTEGER PRIMARY KEY,
       name TEXT NOT NULL,
       applied_at INTEGER NOT NULL
     )`
  );
  const applied = new Set(
    (sqlite.prepare("SELECT version FROM _migrations").all() as { version: number }[]).map(
      (r) => r.version
    )
  );
  if (!existsSync(MIGRATIONS_DIR)) return;
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const m = file.match(/^(\d+)_(.+)\.sql$/);
    if (!m) continue;
    const version = parseInt(m[1], 10);
    if (applied.has(version)) continue;
    const sqlText = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    sqlite.transaction(() => {
      // Apply statement-by-statement so we can tolerate idempotent failures
      // like "duplicate column" — happens if the _migrations row was lost
      // but the schema change had already landed. SQLite's `ADD COLUMN`
      // has no IF NOT EXISTS variant; this is the workaround.
      for (const stmt of splitSqlStatements(sqlText)) {
        try {
          sqlite.exec(stmt);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (
            /duplicate column name/i.test(message) ||
            /already exists/i.test(message)
          ) {
            continue;
          }
          throw err;
        }
      }
      sqlite
        .prepare("INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)")
        .run(version, m[2], Date.now());
    })();
  }
}

function splitSqlStatements(sqlText: string): string[] {
  // Strip line comments, then split on terminating semicolons.
  // Our migration SQL doesn't use semicolons inside string literals.
  const stripped = sqlText
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
  return stripped
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s + ";");
}

type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

declare global {
  // eslint-disable-next-line no-var
  var __tasksDb: DB | undefined;
}

function createDb(): DB {
  const sqlite = new Database(resolveDbPath());
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 2000");
  applyMigrations(sqlite);
  return drizzle(sqlite, { schema }) as DB;
}

export const db: DB = globalThis.__tasksDb ?? createDb();
if (!globalThis.__tasksDb) globalThis.__tasksDb = db;

export { schema };
