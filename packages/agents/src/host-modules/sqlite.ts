/**
 * `@nodetool-ai/sandbox-sqlite` — better-sqlite3, on the host.
 *
 * better-sqlite3 is a native addon: it can never be a guest module, and it
 * opens files, which is the reason this module never takes a path. A database
 * crosses the boundary as **bytes** — the guest reads them with
 * `workspace.readBytes` and writes the result back with `workspace.writeBytes`
 * — so the workspace containment that already guards every other file the
 * sandbox touches guards databases too, with nothing new to enforce here.
 *
 * The database is deserialized into memory for the call and serialized back
 * out, so `run` is atomic by construction: either every statement applied and
 * the caller gets new bytes, or one threw and the caller still holds the old
 * ones.
 */

import { importOptionalLibrary, requireBytes, unwrapLibrary } from "./limits.js";

/** Statements one `run` call may carry. */
export const MAX_SQLITE_STATEMENTS = 500;
/** Rows one statement may return. */
export const MAX_SQLITE_ROWS = 10_000;

interface StatementLike {
  readonly reader: boolean;
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => { changes: number; lastInsertRowid: number | bigint };
}
interface DatabaseLike {
  prepare: (sql: string) => StatementLike;
  serialize: () => Uint8Array;
  close: () => void;
}
type DatabaseConstructor = new (
  source?: string | Buffer,
  options?: Record<string, unknown>
) => DatabaseLike;

async function loadSqlite(where: string): Promise<DatabaseConstructor> {
  // Not a bare import: better-sqlite3 carries a .node binary, and this file is
  // in the browser runner's module graph.
  const mod = await importOptionalLibrary<unknown>(where, "better-sqlite3");
  return unwrapLibrary<DatabaseConstructor>(
    mod,
    where,
    "better-sqlite3",
    (v) => typeof v === "function"
  );
}

/** Open the caller's bytes, or an empty database when they passed none. */
async function open(where: string, database: unknown): Promise<DatabaseLike> {
  const Database = await loadSqlite(where);
  if (database === undefined || database === null) {
    return new Database(":memory:");
  }
  const bytes = requireBytes(where, database, "database");
  // better-sqlite3 deserializes from a Buffer specifically, and rejects a plain
  // Uint8Array with "Expected first argument to be a string".
  let db: DatabaseLike;
  try {
    db = new Database(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length));
    // The constructor takes the bytes without reading them; the header check
    // happens on first use, where the driver's bare "file is not a database"
    // would reach the guest attached to whichever statement ran first.
    db.prepare("SELECT count(*) FROM sqlite_master").all();
  } catch (error) {
    throw new Error(
      `${where}: those bytes are not a SQLite database (${
        error instanceof Error ? error.message : String(error)
      })`
    );
  }
  return db;
}

/**
 * What better-sqlite3 will bind. Booleans and objects have no SQLite type, and
 * the alternative to converting them here is a "can only bind numbers,
 * strings…" error from inside the driver that names no column.
 */
function bindValue(where: string, value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "bigint") return value;
  if (value instanceof Uint8Array) return value;
  if (typeof value === "object") return JSON.stringify(value);
  throw new Error(`${where}: cannot bind a ${typeof value} parameter`);
}

/** Positional `?` params from an array, named `:x` params from an object. */
function bindParams(where: string, params: unknown): unknown[] {
  if (params === undefined || params === null) return [];
  if (Array.isArray(params)) {
    return params.map((value) => bindValue(where, value));
  }
  if (typeof params === "object") {
    const named: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      named[key] = bindValue(where, value);
    }
    return [named];
  }
  throw new Error(`${where}: params must be an array or an object`);
}

/** SQLite values the guest can hold: no BigInt, no Buffer. */
function rowValue(value: unknown): unknown {
  if (typeof value === "bigint") {
    return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
  }
  if (value instanceof Uint8Array) return new Uint8Array(value);
  return value;
}

function readRows(where: string, statement: StatementLike, params: unknown[]): unknown[] {
  const rows = statement.all(...params) as Record<string, unknown>[];
  if (rows.length > MAX_SQLITE_ROWS) {
    throw new Error(
      `${where}: ${rows.length} rows exceeds the ${MAX_SQLITE_ROWS} row limit — add a LIMIT`
    );
  }
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) out[key] = rowValue(value);
    return out;
  });
}

function requireSql(where: string, sql: unknown): string {
  if (typeof sql !== "string" || !sql.trim()) {
    throw new Error(`${where}: sql must be a non-empty string`);
  }
  return sql;
}

/**
 * One read against a database, returning its rows.
 *
 * ```js
 * const rows = await query(bytes, "SELECT * FROM cards WHERE box = ?", [1]);
 * ```
 *
 * A statement that changes the database is refused here — nothing would carry
 * the change back out. Use `run`.
 */
export async function query(
  database: unknown,
  sql: unknown,
  params?: unknown
): Promise<unknown[]> {
  const where = "sqlite.query";
  const text = requireSql(where, sql);
  const bound = bindParams(where, params);
  const db = await open(where, database);
  try {
    const statement = db.prepare(text);
    if (!statement.reader) {
      throw new Error(
        `${where}: that statement returns no rows — use run() for anything that writes`
      );
    }
    return readRows(where, statement, bound);
  } finally {
    db.close();
  }
}

interface RunResult {
  /** The database after every statement applied. Write it back yourself. */
  readonly database: Uint8Array;
  /** One entry per statement, in order. */
  readonly results: readonly unknown[];
}

/**
 * A batch of statements against a database, returning the new bytes.
 *
 * ```js
 * const { database, results } = await run(bytes, [
 *   { sql: "CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY, front TEXT)" },
 *   { sql: "INSERT INTO cards (front) VALUES (?)", params: ["ostinato"] },
 *   { sql: "SELECT * FROM cards" }
 * ]);
 * await workspace.writeBytes("cards.db", database);
 * ```
 *
 * A reading statement contributes `{rows}`, a writing one
 * `{changes, lastInsertRowid}`. Nothing is written to disk here: persisting
 * `database` is the caller's call, and the workspace is where it goes.
 */
export async function run(
  database: unknown,
  statements: unknown
): Promise<RunResult> {
  const where = "sqlite.run";
  const list = Array.isArray(statements) ? statements : [statements];
  if (list.length === 0) {
    throw new Error(`${where}: pass at least one statement`);
  }
  if (list.length > MAX_SQLITE_STATEMENTS) {
    throw new Error(
      `${where}: ${list.length} statements exceeds the ${MAX_SQLITE_STATEMENTS} statement limit`
    );
  }
  const db = await open(where, database);
  try {
    const results: unknown[] = [];
    for (const entry of list) {
      const spec =
        typeof entry === "string"
          ? { sql: entry, params: undefined }
          : ((entry ?? {}) as { sql?: unknown; params?: unknown });
      const text = requireSql(where, spec.sql);
      const bound = bindParams(where, spec.params);
      const statement = db.prepare(text);
      if (statement.reader) {
        results.push({ rows: readRows(where, statement, bound) });
      } else {
        const outcome = statement.run(...bound);
        results.push({
          changes: outcome.changes,
          lastInsertRowid: rowValue(outcome.lastInsertRowid)
        });
      }
    }
    return { database: new Uint8Array(db.serialize()), results };
  } finally {
    db.close();
  }
}
