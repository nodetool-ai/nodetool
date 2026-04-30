/**
 * Database adapter interface for migrations.
 *
 * Port of Python's `nodetool.migrations.db_adapter`.
 * Async interface to support both synchronous (better-sqlite3)
 * and asynchronous (pg for PostgreSQL/Supabase) backends.
 */

import type Database from "better-sqlite3";

export type SqlParams = any[];

export type Row = Record<string, any>;

/**
 * Abstract interface for migration database operations.
 * All methods are async to support both sync and async backends.
 */
export interface MigrationDBAdapter {
  execute(sql: string, params?: SqlParams): Promise<void>;
  fetchone(sql: string, params?: SqlParams): Promise<Row | null>;
  fetchall(sql: string, params?: SqlParams): Promise<Row[]>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  tableExists(tableName: string): Promise<boolean>;
  columnExists(tableName: string, columnName: string): Promise<boolean>;
  getColumns(tableName: string): Promise<string[]>;
  indexExists(indexName: string): Promise<boolean>;
  getRowcount(): number;
  readonly dbType: string;
}

// ── SQLite Implementation ────────────────────────────────────────────

export class SQLiteMigrationAdapter implements MigrationDBAdapter {
  private db: Database.Database;
  private lastChanges = 0;

  constructor(db: Database.Database) {
    this.db = db;
  }

  get dbType(): string {
    return "sqlite";
  }

  async execute(sql: string, params?: SqlParams): Promise<void> {
    if (params && params.length > 0) {
      const result = this.db.prepare(sql).run(...params);
      this.lastChanges = result.changes;
    } else {
      try {
        const result = this.db.prepare(sql).run();
        this.lastChanges = result.changes;
      } catch {
        this.db.exec(sql);
        this.lastChanges = 0;
      }
    }
  }

  async fetchone(sql: string, params?: SqlParams): Promise<Row | null> {
    const stmt = this.db.prepare(sql);
    const row =
      params && params.length > 0
        ? (stmt.get(...params) as Row | undefined)
        : (stmt.get() as Row | undefined);
    return row ?? null;
  }

  async fetchall(sql: string, params?: SqlParams): Promise<Row[]> {
    const stmt = this.db.prepare(sql);
    return (
      params && params.length > 0 ? stmt.all(...params) : stmt.all()
    ) as Row[];
  }

  async commit(): Promise<void> {
    // better-sqlite3 auto-commits — no-op
  }

  async rollback(): Promise<void> {
    // no-op
  }

  async tableExists(tableName: string): Promise<boolean> {
    const row = await this.fetchone(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      [tableName]
    );
    return row !== null;
  }

  async columnExists(tableName: string, columnName: string): Promise<boolean> {
    const columns = await this.getColumns(tableName);
    return columns.includes(columnName);
  }

  async getColumns(tableName: string): Promise<string[]> {
    const rows = this.db.pragma(`table_info(${tableName})`) as Array<{
      name: string;
    }>;
    return rows.map((r) => r.name);
  }

  async indexExists(indexName: string): Promise<boolean> {
    const row = await this.fetchone(
      "SELECT name FROM sqlite_master WHERE type='index' AND name=?",
      [indexName]
    );
    return row !== null;
  }

  getRowcount(): number {
    return this.lastChanges;
  }
}

// ── PostgreSQL Implementation ────────────────────────────────────────

/**
 * PostgreSQL adapter for migrations.
 * Works with Supabase, Neon, or any standard PostgreSQL database.
 *
 * Accepts a `pg.Pool` instance. The `pg` package is an optional
 * peer dependency — only required when using PostgreSQL.
 *
 * SQL uses `?` placeholders which are converted to `$1, $2, ...`
 * for PostgreSQL compatibility with the SQLite-style migrations.
 */
export class PostgresMigrationAdapter implements MigrationDBAdapter {
  private pool: any;

  private client: any = null;
  private lastRowCount = 0;

  /**
   * @param pool - A `pg.Pool` instance.
   */

  constructor(pool: any) {
    this.pool = pool;
  }

  get dbType(): string {
    return "postgres";
  }

  /**
   * Acquire a dedicated client for the migration session.
   * All operations run on a single client for transaction safety.
   */
  private async ensureClient(): Promise<void> {
    if (!this.client) {
      this.client = await this.pool.connect();
    }
  }

  /** Convert `?` placeholders to PostgreSQL `$1, $2, ...` style. */
  private pgSql(sql: string): string {
    let idx = 0;
    return sql.replace(/\?/g, () => `$${++idx}`);
  }

  async execute(sql: string, params?: SqlParams): Promise<void> {
    await this.ensureClient();
    const result = await this.client.query(this.pgSql(sql), params ?? []);
    this.lastRowCount = result.rowCount ?? 0;
  }

  async fetchone(sql: string, params?: SqlParams): Promise<Row | null> {
    await this.ensureClient();
    const result = await this.client.query(this.pgSql(sql), params ?? []);
    return result.rows[0] ?? null;
  }

  async fetchall(sql: string, params?: SqlParams): Promise<Row[]> {
    await this.ensureClient();
    const result = await this.client.query(this.pgSql(sql), params ?? []);
    return result.rows;
  }

  async commit(): Promise<void> {
    if (this.client) {
      await this.client.query("COMMIT");
      await this.client.query("BEGIN");
    }
  }

  async rollback(): Promise<void> {
    if (this.client) {
      await this.client.query("ROLLBACK");
      await this.client.query("BEGIN");
    }
  }

  async tableExists(tableName: string): Promise<boolean> {
    const row = await this.fetchone(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = ?) AS exists",
      [tableName]
    );
    return row?.exists ?? false;
  }

  async columnExists(tableName: string, columnName: string): Promise<boolean> {
    const row = await this.fetchone(
      `SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = ? AND column_name = ?
      ) AS exists`,
      [tableName, columnName]
    );
    return row?.exists ?? false;
  }

  async getColumns(tableName: string): Promise<string[]> {
    const rows = await this.fetchall(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = ?
       ORDER BY ordinal_position`,
      [tableName]
    );
    return rows.map((r) => r.column_name);
  }

  async indexExists(indexName: string): Promise<boolean> {
    const row = await this.fetchone(
      "SELECT EXISTS (SELECT FROM pg_indexes WHERE indexname = ?) AS exists",
      [indexName]
    );
    return row?.exists ?? false;
  }

  getRowcount(): number {
    return this.lastRowCount;
  }

  /**
   * Begin a transaction on the dedicated client.
   * Called by the runner before migration execution.
   */
  async begin(): Promise<void> {
    await this.ensureClient();
    await this.client.query("BEGIN");
  }

  /**
   * Release the dedicated client back to the pool.
   * Must be called when done with migrations.
   */
  async release(): Promise<void> {
    if (this.client) {
      try {
        await this.client.query("ROLLBACK");
      } catch {
        // Ignore rollback errors during cleanup.
      }
      this.client.release();
      this.client = null;
    }
  }
}

// ── postgres.js Implementation ───────────────────────────────────────

/**
 * Migration adapter for the `postgres` (postgres.js) package.
 * Works with Supabase, Neon, or any standard PostgreSQL database.
 *
 * This is the recommended adapter when using `initPostgresDb()` since
 * both the Drizzle ORM connection and the migration system use postgres.js.
 *
 * SQL uses `?` placeholders which are converted to `$1, $2, ...`
 * for PostgreSQL compatibility with the SQLite-style migration SQL.
 *
 * Usage:
 * ```typescript
 * import postgres from 'postgres';
 * import { PostgresJsMigrationAdapter, MigrationRunner } from '@nodetool-ai/models';
 *
 * const sql = postgres(process.env.DATABASE_URL);
 * const adapter = new PostgresJsMigrationAdapter(sql);
 * await adapter.begin();
 * try {
 *   const runner = new MigrationRunner(adapter);
 *   await runner.migrate();
 * } finally {
 *   await adapter.release();
 * }
 * ```
 */
export class PostgresJsMigrationAdapter implements MigrationDBAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sql: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private reserved: any = null;
  private lastRowCount = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(sql: any) {
    this.sql = sql;
  }

  get dbType(): string {
    return "postgres";
  }

  /** Convert `?` placeholders to PostgreSQL `$1, $2, ...` style. */
  private pgSql(sql: string): string {
    let idx = 0;
    return sql.replace(/\?/g, () => `$${++idx}`);
  }

  /** Acquire a reserved connection for the migration session. */
  async begin(): Promise<void> {
    if (!this.reserved) {
      this.reserved = await this.sql.reserve();
      await this.reserved.unsafe("BEGIN");
    }
  }

  private async getConn(): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!this.reserved) {
      await this.begin();
    }
    return this.reserved;
  }

  async execute(sql: string, params?: SqlParams): Promise<void> {
    const conn = await this.getConn();
    const result = await conn.unsafe(this.pgSql(sql), params ?? []);
    this.lastRowCount = result.count ?? 0;
  }

  async fetchone(sql: string, params?: SqlParams): Promise<Row | null> {
    const conn = await this.getConn();
    const rows = await conn.unsafe(this.pgSql(sql), params ?? []);
    return rows[0] ?? null;
  }

  async fetchall(sql: string, params?: SqlParams): Promise<Row[]> {
    const conn = await this.getConn();
    return conn.unsafe(this.pgSql(sql), params ?? []);
  }

  async commit(): Promise<void> {
    if (this.reserved) {
      await this.reserved.unsafe("COMMIT");
      await this.reserved.unsafe("BEGIN");
    }
  }

  async rollback(): Promise<void> {
    if (this.reserved) {
      await this.reserved.unsafe("ROLLBACK");
      await this.reserved.unsafe("BEGIN");
    }
  }

  async tableExists(tableName: string): Promise<boolean> {
    const row = await this.fetchone(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ?) AS exists",
      [tableName]
    );
    return row?.exists === true;
  }

  async columnExists(tableName: string, columnName: string): Promise<boolean> {
    const row = await this.fetchone(
      `SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ? AND column_name = ?
      ) AS exists`,
      [tableName, columnName]
    );
    return row?.exists === true;
  }

  async getColumns(tableName: string): Promise<string[]> {
    const rows = await this.fetchall(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ?
       ORDER BY ordinal_position`,
      [tableName]
    );
    return rows.map((r) => r.column_name);
  }

  async indexExists(indexName: string): Promise<boolean> {
    const row = await this.fetchone(
      "SELECT EXISTS (SELECT FROM pg_indexes WHERE schemaname = 'public' AND indexname = ?) AS exists",
      [indexName]
    );
    return row?.exists === true;
  }

  getRowcount(): number {
    return this.lastRowCount;
  }

  /** Release the reserved connection back to the pool. */
  async release(): Promise<void> {
    if (this.reserved) {
      try {
        await this.reserved.unsafe("ROLLBACK");
      } catch {
        // Ignore rollback errors during cleanup.
      }
      this.reserved.release();
      this.reserved = null;
    }
  }
}
