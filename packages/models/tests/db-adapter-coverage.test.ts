import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import {
  SQLiteMigrationAdapter,
  PostgresMigrationAdapter,
  PostgresJsMigrationAdapter
} from "../src/migrations/db-adapter.js";

// ── SQLiteMigrationAdapter branch coverage ───────────────────────────

describe("SQLiteMigrationAdapter (branches)", () => {
  let adapter: SQLiteMigrationAdapter;

  beforeEach(() => {
    const db = new Database(":memory:");
    adapter = new SQLiteMigrationAdapter(db);
  });

  it("falls back to exec() for multi-statement DDL that prepare() rejects", async () => {
    // Multiple statements in one string cannot be prepared; execute must catch
    // and fall back to db.exec(), leaving rowcount at 0.
    await adapter.execute(
      "CREATE TABLE a (id TEXT); CREATE TABLE b (id TEXT);"
    );
    expect(await adapter.tableExists("a")).toBe(true);
    expect(await adapter.tableExists("b")).toBe(true);
    expect(adapter.getRowcount()).toBe(0);
  });

  it("tracks changes for parameterized writes", async () => {
    await adapter.execute("CREATE TABLE t (id TEXT PRIMARY KEY, v TEXT)");
    await adapter.execute("INSERT INTO t (id, v) VALUES (?, ?)", ["1", "x"]);
    expect(adapter.getRowcount()).toBe(1);
  });

  it("tracks changes for a no-param single-statement write", async () => {
    await adapter.execute("CREATE TABLE t (id TEXT PRIMARY KEY, v TEXT)");
    await adapter.execute("INSERT INTO t (id, v) VALUES ('1', 'a')");
    // A single INSERT prepares fine and reports one change.
    expect(adapter.getRowcount()).toBe(1);
  });

  it("fetchone with params returns null when nothing matches", async () => {
    await adapter.execute("CREATE TABLE t (id TEXT PRIMARY KEY)");
    const row = await adapter.fetchone("SELECT * FROM t WHERE id = ?", ["z"]);
    expect(row).toBeNull();
  });

  it("fetchone without params reads a row", async () => {
    await adapter.execute("CREATE TABLE t (id TEXT PRIMARY KEY, v TEXT)");
    await adapter.execute("INSERT INTO t (id, v) VALUES ('1', 'y')");
    const row = await adapter.fetchone("SELECT * FROM t");
    expect(row).toEqual({ id: "1", v: "y" });
  });

  it("fetchall handles both param and no-param paths", async () => {
    await adapter.execute("CREATE TABLE t (id TEXT PRIMARY KEY, v TEXT)");
    await adapter.execute("INSERT INTO t (id, v) VALUES (?, ?)", ["1", "a"]);
    await adapter.execute("INSERT INTO t (id, v) VALUES (?, ?)", ["2", "b"]);
    const all = await adapter.fetchall("SELECT * FROM t ORDER BY id");
    expect(all).toHaveLength(2);
    const filtered = await adapter.fetchall("SELECT * FROM t WHERE v = ?", [
      "b"
    ]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("2");
  });

  it("commit and rollback are no-ops that resolve", async () => {
    await expect(adapter.commit()).resolves.toBeUndefined();
    await expect(adapter.rollback()).resolves.toBeUndefined();
  });

  it("columnExists reflects the actual schema", async () => {
    await adapter.execute("CREATE TABLE t (id TEXT PRIMARY KEY, name TEXT)");
    expect(await adapter.columnExists("t", "name")).toBe(true);
    expect(await adapter.columnExists("t", "missing")).toBe(false);
  });

  it("indexExists detects created indexes", async () => {
    await adapter.execute("CREATE TABLE t (id TEXT PRIMARY KEY, name TEXT)");
    expect(await adapter.indexExists("idx_t_name")).toBe(false);
    await adapter.execute("CREATE INDEX idx_t_name ON t(name)");
    expect(await adapter.indexExists("idx_t_name")).toBe(true);
  });
});

// ── PostgresMigrationAdapter (pg.Pool) with a mocked client ──────────

function makePgPoolMock(queryImpl: (sql: string, params: unknown[]) => any) {
  const client = {
    query: vi.fn((sql: string, params: unknown[] = []) => queryImpl(sql, params)),
    release: vi.fn()
  };
  const pool = {
    connect: vi.fn(async () => client)
  };
  return { pool, client };
}

describe("PostgresMigrationAdapter", () => {
  it("reports the postgres dbType", () => {
    const { pool } = makePgPoolMock(() => ({ rows: [], rowCount: 0 }));
    const adapter = new PostgresMigrationAdapter(pool);
    expect(adapter.dbType).toBe("postgres");
  });

  it("converts ? placeholders to $1,$2 and connects a client lazily", async () => {
    const { pool, client } = makePgPoolMock(() => ({ rows: [], rowCount: 3 }));
    const adapter = new PostgresMigrationAdapter(pool);

    await adapter.execute("INSERT INTO t (a, b) VALUES (?, ?)", ["x", "y"]);

    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenLastCalledWith(
      "INSERT INTO t (a, b) VALUES ($1, $2)",
      ["x", "y"]
    );
    expect(adapter.getRowcount()).toBe(3);

    // A second call reuses the same client (connect not called again).
    await adapter.execute("DELETE FROM t");
    expect(pool.connect).toHaveBeenCalledTimes(1);
  });

  it("execute defaults rowCount to 0 when the driver returns null", async () => {
    const { pool } = makePgPoolMock(() => ({ rows: [], rowCount: null }));
    const adapter = new PostgresMigrationAdapter(pool);
    await adapter.execute("UPDATE t SET a = 1");
    expect(adapter.getRowcount()).toBe(0);
  });

  it("fetchone returns the first row or null", async () => {
    const rowsQueue = [[{ id: "1" }], []];
    let call = 0;
    const { pool } = makePgPoolMock(() => ({ rows: rowsQueue[call++] }));
    const adapter = new PostgresMigrationAdapter(pool);

    expect(await adapter.fetchone("SELECT * FROM t")).toEqual({ id: "1" });
    expect(await adapter.fetchone("SELECT * FROM t")).toBeNull();
  });

  it("fetchall returns all rows", async () => {
    const { pool } = makePgPoolMock(() => ({
      rows: [{ id: "1" }, { id: "2" }]
    }));
    const adapter = new PostgresMigrationAdapter(pool);
    const rows = await adapter.fetchall("SELECT * FROM t");
    expect(rows).toHaveLength(2);
  });

  it("tableExists / columnExists / indexExists map the exists flag", async () => {
    const results: Record<string, unknown> = {};
    const { pool } = makePgPoolMock((sql: string) => {
      if (sql.includes("information_schema.tables"))
        return { rows: [{ exists: true }] };
      if (sql.includes("information_schema.columns") && sql.includes("column_name ="))
        return { rows: [{ exists: false }] };
      if (sql.includes("pg_indexes")) return { rows: [{ exists: true }] };
      return { rows: [results] };
    });
    const adapter = new PostgresMigrationAdapter(pool);

    expect(await adapter.tableExists("t")).toBe(true);
    expect(await adapter.columnExists("t", "c")).toBe(false);
    expect(await adapter.indexExists("idx")).toBe(true);
  });

  it("tableExists returns false when the row is missing", async () => {
    const { pool } = makePgPoolMock(() => ({ rows: [] }));
    const adapter = new PostgresMigrationAdapter(pool);
    expect(await adapter.tableExists("t")).toBe(false);
  });

  it("getColumns maps column_name from information_schema", async () => {
    const { pool } = makePgPoolMock(() => ({
      rows: [{ column_name: "id" }, { column_name: "name" }]
    }));
    const adapter = new PostgresMigrationAdapter(pool);
    expect(await adapter.getColumns("t")).toEqual(["id", "name"]);
  });

  it("commit issues COMMIT then re-opens a BEGIN", async () => {
    const calls: string[] = [];
    const { pool, client } = makePgPoolMock((sql: string) => {
      calls.push(sql);
      return { rows: [], rowCount: 0 };
    });
    const adapter = new PostgresMigrationAdapter(pool);
    await adapter.begin();
    calls.length = 0;
    await adapter.commit();
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.query).toHaveBeenCalledWith("BEGIN");
  });

  it("rollback issues ROLLBACK then re-opens a BEGIN", async () => {
    const { pool, client } = makePgPoolMock(() => ({ rows: [], rowCount: 0 }));
    const adapter = new PostgresMigrationAdapter(pool);
    await adapter.begin();
    await adapter.rollback();
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("commit/rollback are no-ops when no client was acquired", async () => {
    const { pool, client } = makePgPoolMock(() => ({ rows: [], rowCount: 0 }));
    const adapter = new PostgresMigrationAdapter(pool);
    await adapter.commit();
    await adapter.rollback();
    expect(client.query).not.toHaveBeenCalled();
  });

  it("release rolls back and returns the client to the pool", async () => {
    const { pool, client } = makePgPoolMock(() => ({ rows: [], rowCount: 0 }));
    const adapter = new PostgresMigrationAdapter(pool);
    await adapter.begin();
    await adapter.release();
    expect(client.release).toHaveBeenCalledTimes(1);
    // Idempotent: a second release with no client does nothing further.
    await adapter.release();
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("release swallows rollback errors during cleanup", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql === "ROLLBACK") throw new Error("boom");
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn()
    };
    const pool = { connect: vi.fn(async () => client) };
    const adapter = new PostgresMigrationAdapter(pool);
    await adapter.begin();
    await expect(adapter.release()).resolves.toBeUndefined();
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

// ── PostgresJsMigrationAdapter (postgres.js) with a mocked sql ───────

function makePostgresJsMock(
  unsafeImpl: (sql: string, params: unknown[]) => any
) {
  const reserved = {
    unsafe: vi.fn((sql: string, params: unknown[] = []) =>
      unsafeImpl(sql, params)
    ),
    release: vi.fn()
  };
  const sql = {
    reserve: vi.fn(async () => reserved)
  };
  return { sql, reserved };
}

describe("PostgresJsMigrationAdapter", () => {
  it("reports the postgres dbType", () => {
    const { sql } = makePostgresJsMock(() => []);
    const adapter = new PostgresJsMigrationAdapter(sql);
    expect(adapter.dbType).toBe("postgres");
  });

  it("reserves a connection and BEGINs once", async () => {
    const { sql, reserved } = makePostgresJsMock(() => []);
    const adapter = new PostgresJsMigrationAdapter(sql);
    await adapter.begin();
    await adapter.begin(); // second begin is a no-op (already reserved)
    expect(sql.reserve).toHaveBeenCalledTimes(1);
    expect(reserved.unsafe).toHaveBeenCalledWith("BEGIN");
  });

  it("execute converts placeholders and records the row count", async () => {
    const { sql, reserved } = makePostgresJsMock(() => {
      const arr: any[] = [];
      arr.count = 5;
      return arr;
    });
    const adapter = new PostgresJsMigrationAdapter(sql);
    await adapter.execute("INSERT INTO t (a, b) VALUES (?, ?)", ["x", "y"]);
    expect(reserved.unsafe).toHaveBeenLastCalledWith(
      "INSERT INTO t (a, b) VALUES ($1, $2)",
      ["x", "y"]
    );
    expect(adapter.getRowcount()).toBe(5);
  });

  it("execute lazily reserves a connection via getConn", async () => {
    const { sql, reserved } = makePostgresJsMock(() => []);
    const adapter = new PostgresJsMigrationAdapter(sql);
    // No explicit begin(): execute must reserve on demand.
    await adapter.execute("DELETE FROM t");
    expect(sql.reserve).toHaveBeenCalledTimes(1);
    expect(reserved.unsafe).toHaveBeenLastCalledWith("DELETE FROM t", []);
  });

  it("execute defaults row count to 0 when count is absent", async () => {
    const { sql } = makePostgresJsMock(() => []);
    const adapter = new PostgresJsMigrationAdapter(sql);
    await adapter.execute("UPDATE t SET a = 1");
    expect(adapter.getRowcount()).toBe(0);
  });

  it("fetchone returns the first row or null", async () => {
    const queue = [[{ id: "1" }], []];
    let i = 0;
    // Transaction control (BEGIN issued by the lazy reserve) must not consume
    // a queued result, so only SELECTs draw from the queue.
    const { sql } = makePostgresJsMock((query: string) =>
      query.startsWith("SELECT") ? queue[i++] : []
    );
    const adapter = new PostgresJsMigrationAdapter(sql);
    expect(await adapter.fetchone("SELECT 1")).toEqual({ id: "1" });
    expect(await adapter.fetchone("SELECT 1")).toBeNull();
  });

  it("fetchall returns rows directly", async () => {
    const { sql } = makePostgresJsMock(() => [{ id: "1" }, { id: "2" }]);
    const adapter = new PostgresJsMigrationAdapter(sql);
    expect(await adapter.fetchall("SELECT * FROM t")).toHaveLength(2);
  });

  it("tableExists / columnExists / indexExists check exists === true", async () => {
    const { sql } = makePostgresJsMock((query: string) => {
      if (query.includes("information_schema.tables"))
        return [{ exists: true }];
      if (query.includes("information_schema.columns") && query.includes("column_name ="))
        return [{ exists: true }];
      if (query.includes("pg_indexes")) return [{ exists: false }];
      return [];
    });
    const adapter = new PostgresJsMigrationAdapter(sql);
    expect(await adapter.tableExists("t")).toBe(true);
    expect(await adapter.columnExists("t", "c")).toBe(true);
    expect(await adapter.indexExists("idx")).toBe(false);
  });

  it("tableExists returns false when no row comes back", async () => {
    const { sql } = makePostgresJsMock(() => []);
    const adapter = new PostgresJsMigrationAdapter(sql);
    expect(await adapter.tableExists("t")).toBe(false);
  });

  it("getColumns maps column_name", async () => {
    const { sql } = makePostgresJsMock(() => [
      { column_name: "a" },
      { column_name: "b" }
    ]);
    const adapter = new PostgresJsMigrationAdapter(sql);
    expect(await adapter.getColumns("t")).toEqual(["a", "b"]);
  });

  it("commit and rollback re-open a transaction when reserved", async () => {
    const { sql, reserved } = makePostgresJsMock(() => []);
    const adapter = new PostgresJsMigrationAdapter(sql);
    await adapter.begin();
    await adapter.commit();
    expect(reserved.unsafe).toHaveBeenCalledWith("COMMIT");
    await adapter.rollback();
    expect(reserved.unsafe).toHaveBeenCalledWith("ROLLBACK");
  });

  it("commit/rollback are no-ops when nothing is reserved", async () => {
    const { sql, reserved } = makePostgresJsMock(() => []);
    const adapter = new PostgresJsMigrationAdapter(sql);
    await adapter.commit();
    await adapter.rollback();
    expect(reserved.unsafe).not.toHaveBeenCalled();
  });

  it("release rolls back and frees the reserved connection idempotently", async () => {
    const { sql, reserved } = makePostgresJsMock(() => []);
    const adapter = new PostgresJsMigrationAdapter(sql);
    await adapter.begin();
    await adapter.release();
    expect(reserved.release).toHaveBeenCalledTimes(1);
    await adapter.release();
    expect(reserved.release).toHaveBeenCalledTimes(1);
  });

  it("release swallows rollback errors during cleanup", async () => {
    const reserved = {
      unsafe: vi.fn(async (sql: string) => {
        if (sql === "ROLLBACK") throw new Error("nope");
        return [];
      }),
      release: vi.fn()
    };
    const sql = { reserve: vi.fn(async () => reserved) };
    const adapter = new PostgresJsMigrationAdapter(sql);
    await adapter.begin();
    await expect(adapter.release()).resolves.toBeUndefined();
    expect(reserved.release).toHaveBeenCalledTimes(1);
  });
});
