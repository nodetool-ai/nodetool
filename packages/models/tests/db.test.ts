import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  closeDb,
  getDb,
  getRawDb,
  initDb,
  initTestDb,
  migrateSqliteDb,
  pingDb,
  resolvePostgresClientOptions
} from "../src/db.js";

import {
  MigrationRunner,
  SQLiteMigrationAdapter
} from "../src/migrations/index.js";

describe("db", () => {
  let tempDir: string | null = null;

  beforeEach(async () => {
    await closeDb();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await closeDb();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("throws when database accessors are used before initialization", () => {
    expect(() => getDb()).toThrow(/not initialized/i);
    expect(() => getRawDb()).toThrow(/not initialized/i);
  });

  it("initializes a file-backed database and exposes the raw connection", () => {
    tempDir = mkdtempSync(join(tmpdir(), "nodetool-models-db-"));
    const dbPath = join(tempDir, "models.sqlite");

    const db = initDb(dbPath);
    expect(db).toBe(getDb());
    expect(getRawDb().pragma("journal_mode", { simple: true })).toBe("wal");
    expect(initDb(dbPath)).toBe(db);
  });

  it("pings SQLite with a constant-time query instead of an integrity scan", async () => {
    initTestDb();
    const sqlite = getRawDb();
    const prepare = vi.spyOn(sqlite, "prepare");
    const pragma = vi.spyOn(sqlite, "pragma");

    await expect(pingDb()).resolves.toBeUndefined();

    expect(prepare).toHaveBeenCalledWith("select 1");
    expect(pragma).not.toHaveBeenCalled();
  });

  it("adds missing columns to existing tables during initDb", () => {
    tempDir = mkdtempSync(join(tmpdir(), "nodetool-models-db-"));
    const dbPath = join(tempDir, "upgrade.sqlite");

    const legacyDb = new Database(dbPath);
    legacyDb.exec(`
      CREATE TABLE "nodetool_workflows" (
        "id" text PRIMARY KEY NOT NULL,
        "user_id" text NOT NULL,
        "name" text NOT NULL DEFAULT '',
        "graph" text NOT NULL,
        "access" text NOT NULL DEFAULT 'private',
        "created_at" text NOT NULL,
        "updated_at" text NOT NULL
      );
      CREATE TABLE "nodetool_jobs" (
        "id" text PRIMARY KEY NOT NULL,
        "user_id" text NOT NULL,
        "workflow_id" text NOT NULL,
        "status" text NOT NULL DEFAULT 'scheduled',
        "created_at" text NOT NULL,
        "updated_at" text NOT NULL
      );
    `);
    legacyDb.close();

    initDb(dbPath);

    const sqlite = getRawDb();
    const workflowCols = (
      sqlite.pragma('table_info("nodetool_workflows")') as Array<{
        name: string;
      }>
    ).map((row) => row.name);
    expect(workflowCols).toContain("html_app");
    expect(workflowCols).toContain("receive_clipboard");
    expect(workflowCols).toContain("workspace_id");
    expect(workflowCols).toContain("tool_name");

    const jobCols = (
      sqlite.pragma('table_info("nodetool_jobs")') as Array<{ name: string }>
    ).map((row) => row.name);
    expect(jobCols).toContain("execution_strategy");
    expect(jobCols).toContain("execution_id");
    expect(jobCols).toContain("metadata_json");
  });

  it("repairs legacy application duplicates before creating unique indexes", () => {
    tempDir = mkdtempSync(join(tmpdir(), "nodetool-models-db-"));
    const dbPath = join(tempDir, "application-duplicates.sqlite");
    const legacyDb = new Database(dbPath);
    legacyDb.exec(`
      CREATE TABLE application_deployments (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        token TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE TABLE application_invocations (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        user_id TEXT,
        version INTEGER,
        invocation_id TEXT NOT NULL,
        operation_id TEXT NOT NULL DEFAULT '',
        estimated_usd REAL NOT NULL DEFAULT 0,
        actual_usd REAL,
        status TEXT NOT NULL DEFAULT 'running',
        created_at TEXT NOT NULL,
        settled_at TEXT
      );
      INSERT INTO application_deployments VALUES
        ('deployment-old', 'app-1', 'owner-1', 'token-old', '2026-01-01', NULL),
        ('deployment-new', 'app-1', 'owner-1', 'token-new', '2026-01-02', NULL);
      INSERT INTO application_invocations VALUES
        ('invocation-old', 'app-1', NULL, NULL, 'run-1', '', 0, NULL, 'running', '2026-01-01', NULL),
        ('invocation-new', 'app-1', NULL, NULL, 'run-1', '', 0, NULL, 'running', '2026-01-02', NULL);
    `);
    legacyDb.close();

    expect(() => initDb(dbPath)).not.toThrow();

    const sqlite = getRawDb();
    expect(
      sqlite
        .prepare(
          "SELECT id FROM application_deployments WHERE application_id = ? AND revoked_at IS NULL"
        )
        .all("app-1")
    ).toEqual([{ id: "deployment-new" }]);
    expect(
      sqlite
        .prepare(
          "SELECT invocation_id FROM application_invocations WHERE id = ?"
        )
        .get("invocation-old")
    ).toEqual({ invocation_id: "legacy:invocation-old" });
    expect(() =>
      sqlite.exec(
        "INSERT INTO application_invocations (id, application_id, invocation_id, operation_id, estimated_usd, status, created_at) VALUES ('invocation-again', 'app-1', 'run-1', '', 0, 'running', '2026-01-03')"
      )
    ).toThrow();
  });

  it("migrateSqliteDb applies SQLite migrations without initializing the global DB", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "nodetool-models-db-"));
    const dbPath = join(tempDir, "migrations.sqlite");

    const applied = await migrateSqliteDb(dbPath);

    expect(applied.length).toBeGreaterThan(0);
    expect(() => getDb()).toThrow(/not initialized/i);

    const sqlite = new Database(dbPath);
    try {
      const imageDocuments = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'image_documents'"
        )
        .get();
      expect(imageDocuments).toBeTruthy();
    } finally {
      sqlite.close();
    }
  });

  it("runs both startup orders without skipping historical migrations", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "nodetool-startup-orders-"));
    for (const migrateFirst of [false, true]) {
      const path = join(tempDir, `${migrateFirst}.sqlite`);
      if (migrateFirst) {
        await migrateSqliteDb(path);
      }
      initDb(path);
      const count = getRawDb()
        .prepare("SELECT COUNT(*) AS count FROM _nodetool_migrations")
        .get() as { count: number };
      if (!migrateFirst) {
        // Opening synchronously cannot pretend historical data transformations ran.
        expect(count.count).toBe(1);
      }
      await closeDb();
      const pending = await migrateSqliteDb(path);
      expect(pending.length > 0).toBe(!migrateFirst);
      initDb(path);
      const exec = vi.spyOn(getRawDb(), "exec");
      await closeDb();
      exec.mockRestore();
      expect(await migrateSqliteDb(path)).toEqual([]);
    }
  });

  it("records the compatibility migration once and preserves existing rows", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "nodetool-legacy-once-"));
    const path = join(tempDir, "legacy.sqlite");
    const legacy = new Database(path);
    legacy.exec(`CREATE TABLE nodetool_workflows (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
      graph TEXT NOT NULL, access TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ); INSERT INTO nodetool_workflows VALUES ('existing', 'owner', 'name', '{"nodes":[],"edges":[]}', 'private', 'old', 'old')`);
    legacy.close();
    initDb(path);
    expect(
      getRawDb()
        .prepare(
          "SELECT name, receive_clipboard FROM nodetool_workflows WHERE id = 'existing'"
        )
        .get()
    ).toEqual({ name: "name", receive_clipboard: null });
    const applied = getRawDb()
      .prepare(
        "SELECT applied_at FROM _nodetool_migrations WHERE version = '20261001_000000'"
      )
      .get();
    await closeDb();
    initDb(path);
    expect(
      getRawDb()
        .prepare(
          "SELECT applied_at FROM _nodetool_migrations WHERE version = '20261001_000000'"
        )
        .get()
    ).toEqual(applied);
    await closeDb();
    await migrateSqliteDb(path);
    initDb(path);
    expect(
      getRawDb()
        .prepare("SELECT name FROM nodetool_workflows WHERE id = 'existing'")
        .get()
    ).toEqual({ name: "name" });
  });

  it.each(["20260103_000001", "20260829_000004", "20260927_000001"])(
    "upgrades a tracked database at historical level %s",
    // Replays durable file-backed migrations before testing the upgrade.
    { timeout: 30_000 },
    async (version) => {
      tempDir = mkdtempSync(join(tmpdir(), "nodetool-historical-level-"));
      const path = join(tempDir, "tracked.sqlite");
      const historical = new Database(path);
      try {
        await new MigrationRunner(
          new SQLiteMigrationAdapter(historical)
        ).migrate({ target: version });
        historical
          .prepare(
            `INSERT INTO nodetool_workflows (id, user_id, name, graph, access, created_at, updated_at)
          VALUES ('kept', 'owner', 'historical row', '{"nodes":[],"edges":[]}', 'private', 'old', 'old')`
          )
          .run();
      } finally {
        historical.close();
      }
      await migrateSqliteDb(path);
      initDb(path);
      expect(
        getRawDb()
          .prepare("SELECT name FROM nodetool_workflows WHERE id = 'kept'")
          .get()
      ).toEqual({ name: "historical row" });
      expect(
        getRawDb()
          .prepare(
            "SELECT version FROM _nodetool_migrations ORDER BY version DESC LIMIT 1"
          )
          .get()
      ).toEqual({ version: "20261004_000001" });
      expect(await migrateSqliteDb(path)).toEqual([]);
    }
  );

  it("does not expose a connection after compatibility migration failure", () => {
    tempDir = mkdtempSync(join(tmpdir(), "nodetool-failed-baseline-"));
    const path = join(tempDir, "invalid.sqlite");
    const invalid = new Database(path);
    invalid.exec(
      "CREATE TABLE application_deployments (id TEXT, token TEXT); INSERT INTO application_deployments VALUES ('a', 'same'), ('b', 'same')"
    );
    invalid.close();
    expect(() => initDb(path)).toThrow();
    expect(() => getDb()).toThrow(/not initialized/i);
    expect(() => getRawDb()).toThrow(/not initialized/i);
  });

  it("closeDb resets both the drizzle and raw database handles", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "nodetool-models-db-"));
    const dbPath = join(tempDir, "close.sqlite");

    initDb(dbPath);
    await closeDb();

    expect(() => getDb()).toThrow(/not initialized/i);
    expect(() => getRawDb()).toThrow(/not initialized/i);
  });

  it("swallows close errors when replacing an existing test database", () => {
    initTestDb();
    const rawDb = getRawDb();
    const originalClose = rawDb.close.bind(rawDb);
    (rawDb as Database.Database & { close: () => void }).close = () => {
      throw new Error("close failed");
    };

    try {
      expect(() => initTestDb()).not.toThrow();
    } finally {
      (rawDb as Database.Database & { close: () => void }).close =
        originalClose;
      originalClose();
    }
  });

  it("swallows close errors when shutting down the active connection", async () => {
    initTestDb();
    const rawDb = getRawDb();
    const originalClose = rawDb.close.bind(rawDb);
    (rawDb as Database.Database & { close: () => void }).close = () => {
      throw new Error("close failed");
    };

    try {
      await expect(closeDb()).resolves.toBeUndefined();
      expect(() => getDb()).toThrow(/not initialized/i);
      expect(() => getRawDb()).toThrow(/not initialized/i);
    } finally {
      (rawDb as Database.Database & { close: () => void }).close =
        originalClose;
      originalClose();
    }
  });
});

describe("resolvePostgresClientOptions", () => {
  const sessionUrl =
    "postgresql://u:p@aws-0-eu-central-1.pooler.supabase.com:5432/postgres";
  const transactionUrl =
    "postgresql://u:p@aws-0-eu-central-1.pooler.supabase.com:6543/postgres";

  it("keeps the default pool and prepared statements on a session pooler", () => {
    expect(resolvePostgresClientOptions(sessionUrl, {})).toMatchObject({
      max: 10,
      prepare: true
    });
  });

  it("caps the pool at DATABASE_POOL_MAX", () => {
    expect(
      resolvePostgresClientOptions(sessionUrl, { DATABASE_POOL_MAX: " 4 " }).max
    ).toBe(4);
  });

  it("rejects a DATABASE_POOL_MAX that is not a positive integer", () => {
    for (const value of ["0", "-2", "3.5", "many"]) {
      expect(() =>
        resolvePostgresClientOptions(sessionUrl, { DATABASE_POOL_MAX: value })
      ).toThrow(/DATABASE_POOL_MAX/);
    }
  });

  it("disables prepared statements on the transaction pooler port", () => {
    expect(resolvePostgresClientOptions(transactionUrl, {}).prepare).toBe(
      false
    );
  });
});
