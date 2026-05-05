/**
 * Tests for the database migration system.
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import {
  SQLiteMigrationAdapter,
  MigrationRunner,
  DatabaseState,
  MIGRATION_TRACKING_TABLE,
  MIGRATION_LOCK_TABLE,
  detectDatabaseState,
  MigrationError,
  BaselineError,
  RollbackError,
  migrations
} from "../src/migrations/index.js";
import type {
  MigrationDef,
  MigrationDBAdapter
} from "../src/migrations/index.js";

function createInMemoryAdapter(): SQLiteMigrationAdapter {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  return new SQLiteMigrationAdapter(db);
}

// Simple test migrations for isolated testing
const testMigrations: MigrationDef[] = [
  {
    version: "001",
    name: "create_users",
    createsTables: ["users"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT,
          email TEXT
        )
      `);
    },
    async down(db) {
      await db.execute("DROP TABLE IF EXISTS users");
    }
  },
  {
    version: "002",
    name: "add_age_to_users",
    createsTables: [],
    modifiesTables: ["users"],
    async up(db) {
      const columns = await db.getColumns("users");
      if (!columns.includes("age")) {
        await db.execute("ALTER TABLE users ADD COLUMN age INTEGER");
      }
    },
    async down() {
      // no-op for SQLite
    }
  },
  {
    version: "003",
    name: "create_posts",
    createsTables: ["posts"],
    modifiesTables: [],
    async up(db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS posts (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          title TEXT,
          body TEXT
        )
      `);
    },
    async down(db) {
      await db.execute("DROP TABLE IF EXISTS posts");
    }
  }
];

// ── SQLiteMigrationAdapter tests ─────────────────────────────────────

describe("SQLiteMigrationAdapter", () => {
  let adapter: SQLiteMigrationAdapter;

  beforeEach(() => {
    adapter = createInMemoryAdapter();
  });

  it("should report dbType as sqlite", () => {
    expect(adapter.dbType).toBe("sqlite");
  });

  it("should execute DDL statements", async () => {
    await adapter.execute("CREATE TABLE test (id TEXT PRIMARY KEY, val TEXT)");
    expect(await adapter.tableExists("test")).toBe(true);
  });

  it("should execute with params", async () => {
    await adapter.execute("CREATE TABLE test (id TEXT PRIMARY KEY, val TEXT)");
    await adapter.execute("INSERT INTO test (id, val) VALUES (?, ?)", [
      "1",
      "hello"
    ]);
    const row = await adapter.fetchone("SELECT * FROM test WHERE id = ?", [
      "1"
    ]);
    expect(row).toEqual({ id: "1", val: "hello" });
  });

  it("should fetchall rows", async () => {
    await adapter.execute("CREATE TABLE test (id TEXT PRIMARY KEY, val TEXT)");
    await adapter.execute("INSERT INTO test (id, val) VALUES (?, ?)", [
      "1",
      "a"
    ]);
    await adapter.execute("INSERT INTO test (id, val) VALUES (?, ?)", [
      "2",
      "b"
    ]);
    const rows = await adapter.fetchall("SELECT * FROM test ORDER BY id");
    expect(rows).toHaveLength(2);
    expect(rows[0].val).toBe("a");
    expect(rows[1].val).toBe("b");
  });

  it("should return null for fetchone with no results", async () => {
    await adapter.execute("CREATE TABLE test (id TEXT PRIMARY KEY)");
    const row = await adapter.fetchone("SELECT * FROM test WHERE id = ?", [
      "nope"
    ]);
    expect(row).toBeNull();
  });

  it("should detect table existence", async () => {
    expect(await adapter.tableExists("nonexistent")).toBe(false);
    await adapter.execute("CREATE TABLE mytest (id TEXT PRIMARY KEY)");
    expect(await adapter.tableExists("mytest")).toBe(true);
  });

  it("should detect column existence", async () => {
    await adapter.execute("CREATE TABLE test (id TEXT PRIMARY KEY, name TEXT)");
    expect(await adapter.columnExists("test", "name")).toBe(true);
    expect(await adapter.columnExists("test", "age")).toBe(false);
  });

  it("should get column list", async () => {
    await adapter.execute(
      "CREATE TABLE test (id TEXT PRIMARY KEY, name TEXT, age INTEGER)"
    );
    const columns = await adapter.getColumns("test");
    expect(columns).toContain("id");
    expect(columns).toContain("name");
    expect(columns).toContain("age");
  });

  it("should detect index existence", async () => {
    await adapter.execute("CREATE TABLE test (id TEXT PRIMARY KEY, name TEXT)");
    expect(await adapter.indexExists("idx_test_name")).toBe(false);
    await adapter.execute("CREATE INDEX idx_test_name ON test(name)");
    expect(await adapter.indexExists("idx_test_name")).toBe(true);
  });

  it("should track row changes", async () => {
    await adapter.execute("CREATE TABLE test (id TEXT PRIMARY KEY, val TEXT)");
    await adapter.execute("INSERT INTO test (id, val) VALUES (?, ?)", [
      "1",
      "a"
    ]);
    expect(adapter.getRowcount()).toBe(1);

    await adapter.execute("UPDATE test SET val = ? WHERE id = ?", [
      "b",
      "nope"
    ]);
    expect(adapter.getRowcount()).toBe(0);
  });
});

// ── Database state detection tests ───────────────────────────────────

describe("detectDatabaseState", () => {
  it("should detect FRESH_INSTALL on empty database", async () => {
    const adapter = createInMemoryAdapter();
    expect(await detectDatabaseState(adapter)).toBe(
      DatabaseState.FRESH_INSTALL
    );
  });

  it("should detect LEGACY_DATABASE when app tables exist", async () => {
    const adapter = createInMemoryAdapter();
    await adapter.execute(
      "CREATE TABLE nodetool_workflows (id TEXT PRIMARY KEY)"
    );
    expect(await detectDatabaseState(adapter)).toBe(
      DatabaseState.LEGACY_DATABASE
    );
  });

  it("should detect MIGRATION_TRACKED when tracking table exists", async () => {
    const adapter = createInMemoryAdapter();
    await adapter.execute(
      `CREATE TABLE ${MIGRATION_TRACKING_TABLE} (version TEXT PRIMARY KEY)`
    );
    expect(await detectDatabaseState(adapter)).toBe(
      DatabaseState.MIGRATION_TRACKED
    );
  });
});

// ── MigrationRunner tests ────────────────────────────────────────────

describe("MigrationRunner", () => {
  let adapter: SQLiteMigrationAdapter;
  let runner: MigrationRunner;

  beforeEach(() => {
    adapter = createInMemoryAdapter();
    runner = new MigrationRunner(adapter, testMigrations);
  });

  describe("discoverMigrations", () => {
    it("should discover all test migrations", () => {
      const found = runner.discoverMigrations();
      expect(found).toHaveLength(3);
      expect(found[0].version).toBe("001");
      expect(found[1].version).toBe("002");
      expect(found[2].version).toBe("003");
    });

    it("should cache discovered migrations", () => {
      const first = runner.discoverMigrations();
      const second = runner.discoverMigrations();
      expect(first).toBe(second);
    });
  });

  describe("migrate", () => {
    it("should apply all migrations on fresh database", async () => {
      const applied = await runner.migrate();
      expect(applied).toHaveLength(3);
      expect(applied).toEqual(["001", "002", "003"]);

      expect(await adapter.tableExists("users")).toBe(true);
      expect(await adapter.tableExists("posts")).toBe(true);
      expect(await adapter.columnExists("users", "age")).toBe(true);
    });

    it("should create tracking tables", async () => {
      await runner.migrate();
      expect(await adapter.tableExists(MIGRATION_TRACKING_TABLE)).toBe(true);
      expect(await adapter.tableExists(MIGRATION_LOCK_TABLE)).toBe(true);
    });

    it("should not re-apply migrations", async () => {
      await runner.migrate();
      const secondRun = await runner.migrate();
      expect(secondRun).toHaveLength(0);
    });

    it("should apply only pending migrations", async () => {
      const twoMigrations = testMigrations.slice(0, 2);
      const runner1 = new MigrationRunner(adapter, twoMigrations);
      await runner1.migrate();

      const runner2 = new MigrationRunner(adapter, testMigrations);
      const applied = await runner2.migrate();
      expect(applied).toHaveLength(1);
      expect(applied[0]).toBe("003");
    });

    it("should respect target version", async () => {
      const applied = await runner.migrate({ target: "002" });
      expect(applied).toHaveLength(2);
      expect(applied).toEqual(["001", "002"]);
      expect(await adapter.tableExists("posts")).toBe(false);
    });

    it("should handle dry run", async () => {
      const applied = await runner.migrate({ dryRun: true });
      expect(applied).toHaveLength(3);
      expect(await adapter.tableExists("users")).toBe(false);
      expect(await adapter.tableExists(MIGRATION_TRACKING_TABLE)).toBe(false);
    });

    it("should throw MigrationError on failure", async () => {
      const badMigrations: MigrationDef[] = [
        {
          version: "001",
          name: "bad_migration",
          createsTables: [],
          modifiesTables: [],
          async up() {
            throw new Error("intentional failure");
          },
          async down() {}
        }
      ];

      const badRunner = new MigrationRunner(adapter, badMigrations);
      await expect(badRunner.migrate()).rejects.toThrow(MigrationError);
    });
  });

  describe("status", () => {
    it("should report fresh install status", async () => {
      const status = await runner.status();
      expect(status.state).toBe(DatabaseState.FRESH_INSTALL);
      expect(status.currentVersion).toBeNull();
      expect(status.applied).toHaveLength(0);
      expect(status.pending).toHaveLength(3);
    });

    it("should report applied and pending after partial migration", async () => {
      const partialRunner = new MigrationRunner(
        adapter,
        testMigrations.slice(0, 2)
      );
      await partialRunner.migrate();

      const fullRunner = new MigrationRunner(adapter, testMigrations);
      const status = await fullRunner.status();

      expect(status.state).toBe(DatabaseState.MIGRATION_TRACKED);
      expect(status.currentVersion).toBe("002");
      expect(status.applied).toHaveLength(2);
      expect(status.pending).toHaveLength(1);
      expect(status.pending[0].version).toBe("003");
    });

    it("should report all applied after full migration", async () => {
      await runner.migrate();
      const status = await runner.status();

      expect(status.currentVersion).toBe("003");
      expect(status.applied).toHaveLength(3);
      expect(status.pending).toHaveLength(0);
    });
  });

  describe("rollback", () => {
    it("should rollback the last migration", async () => {
      await runner.migrate();
      expect(await adapter.tableExists("posts")).toBe(true);

      const rolledBack = await runner.rollback(1);
      expect(rolledBack).toHaveLength(1);
      expect(rolledBack[0]).toBe("003");
      expect(await adapter.tableExists("posts")).toBe(false);
    });

    it("should rollback multiple migrations", async () => {
      await runner.migrate();
      const rolledBack = await runner.rollback(2);
      expect(rolledBack).toHaveLength(2);
      expect(rolledBack[0]).toBe("003");
      expect(rolledBack[1]).toBe("002");
    });

    it("should return empty for no migrations to rollback", async () => {
      await runner.migrate({ target: "000" });
      const rolledBack = await runner.rollback(1);
      expect(rolledBack).toHaveLength(0);
    });

    it("should throw RollbackError if migration not found", async () => {
      await runner.migrate();
      const partial = new MigrationRunner(adapter, testMigrations.slice(0, 2));
      await expect(partial.rollback(1)).rejects.toThrow(RollbackError);
    });
  });

  describe("getCurrentVersion", () => {
    it("should return null on fresh database", async () => {
      expect(await runner.getCurrentVersion()).toBeNull();
    });

    it("should return latest version after migration", async () => {
      await runner.migrate();
      expect(await runner.getCurrentVersion()).toBe("003");
    });
  });

  describe("validateChecksums", () => {
    it("should return empty for matching checksums", async () => {
      await runner.migrate();
      const mismatches = await runner.validateChecksums();
      expect(mismatches).toHaveLength(0);
    });
  });

  describe("baseline", () => {
    it("should baseline existing tables", async () => {
      await adapter.execute(
        "CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT)"
      );
      await adapter.execute(
        "CREATE TABLE posts (id TEXT PRIMARY KEY, user_id TEXT, title TEXT, body TEXT)"
      );

      const baselined = await runner.baseline();
      expect(baselined).toBeGreaterThan(0);
    });

    it("should throw BaselineError if tracking exists and not forced", async () => {
      await runner.migrate();
      await expect(runner.baseline()).rejects.toThrow(BaselineError);
    });

    it("should allow forced re-baseline", async () => {
      await runner.migrate();
      const baselined = await runner.baseline(true);
      expect(baselined).toBeGreaterThanOrEqual(0);
    });
  });
});

// ── Built-in migrations smoke test ───────────────────────────────────

describe("Built-in migrations", () => {
  const EXPECTED_BUILT_IN_MIGRATION_COUNT = 33;

  it("should have correct count of migrations", () => {
    expect(migrations.length).toBe(EXPECTED_BUILT_IN_MIGRATION_COUNT);
  });

  it("should have unique versions", () => {
    const versions = migrations.map((m) => m.version);
    const unique = new Set(versions);
    expect(unique.size).toBe(versions.length);
  });

  it("should be sorted by version", () => {
    const versions = migrations.map((m) => m.version);
    const sorted = [...versions].sort();
    expect(versions).toEqual(sorted);
  });

  it("should all apply cleanly to a fresh database", async () => {
    const adapter = createInMemoryAdapter();
    const runner = new MigrationRunner(adapter);

    const applied = await runner.migrate();
    expect(applied).toHaveLength(EXPECTED_BUILT_IN_MIGRATION_COUNT);

    expect(await adapter.tableExists("nodetool_workflows")).toBe(true);
    expect(await adapter.tableExists("nodetool_assets")).toBe(true);
    expect(await adapter.tableExists("nodetool_threads")).toBe(true);
    expect(await adapter.tableExists("nodetool_messages")).toBe(true);
    expect(await adapter.tableExists("nodetool_jobs")).toBe(true);
    expect(await adapter.tableExists("nodetool_predictions")).toBe(true);
    expect(await adapter.tableExists("nodetool_secrets")).toBe(true);
    expect(await adapter.tableExists("nodetool_oauth_credentials")).toBe(true);
    expect(await adapter.tableExists("nodetool_workflow_versions")).toBe(true);
    expect(await adapter.tableExists("nodetool_workspaces")).toBe(true);
    expect(await adapter.tableExists("run_state")).toBe(true);
    expect(await adapter.tableExists("run_node_state")).toBe(true);
    expect(await adapter.tableExists("run_inbox_messages")).toBe(true);
    expect(await adapter.tableExists("trigger_inputs")).toBe(true);
    expect(await adapter.tableExists("run_events")).toBe(true);
    expect(await adapter.tableExists("run_leases")).toBe(true);
    expect(await adapter.tableExists("timeline_sequences")).toBe(true);
  });

  it("should be idempotent (running twice produces same result)", async () => {
    const adapter = createInMemoryAdapter();
    const runner = new MigrationRunner(adapter);

    await runner.migrate();
    const secondRun = await runner.migrate();
    expect(secondRun).toHaveLength(0);
  });

  it("should handle baselining of legacy database", async () => {
    const adapter = createInMemoryAdapter();

    // Simulate legacy: create the initial tables without migration tracking
    await adapter.execute(
      "CREATE TABLE nodetool_workflows (id TEXT PRIMARY KEY, user_id TEXT, access TEXT, created_at TEXT, updated_at TEXT, name TEXT, tags TEXT, description TEXT, thumbnail TEXT, graph TEXT, settings TEXT, receive_clipboard INTEGER)"
    );
    await adapter.execute(
      "CREATE TABLE nodetool_assets (id TEXT PRIMARY KEY, type TEXT, user_id TEXT, workflow_id TEXT, parent_id TEXT, file_id TEXT, name TEXT, content_type TEXT, metadata TEXT, created_at TEXT, duration REAL)"
    );
    await adapter.execute(
      "CREATE TABLE nodetool_threads (id TEXT PRIMARY KEY, user_id TEXT, title TEXT, created_at TEXT, updated_at TEXT)"
    );
    await adapter.execute(
      "CREATE TABLE nodetool_messages (id TEXT PRIMARY KEY, user_id TEXT, workflow_id TEXT, graph TEXT, thread_id TEXT, tools TEXT, tool_call_id TEXT, role TEXT, name TEXT, content TEXT, tool_calls TEXT, collections TEXT, input_files TEXT, output_files TEXT, created_at TEXT, provider TEXT, model TEXT, cost REAL, agent_mode INTEGER, help_mode INTEGER, agent_execution_id TEXT, execution_event_type TEXT, workflow_target TEXT)"
    );
    await adapter.execute(
      "CREATE TABLE nodetool_jobs (id TEXT PRIMARY KEY, user_id TEXT, job_type TEXT, status TEXT, workflow_id TEXT, started_at TEXT, finished_at TEXT, graph TEXT, error TEXT, cost REAL)"
    );
    await adapter.execute(
      "CREATE TABLE nodetool_predictions (id TEXT PRIMARY KEY, user_id TEXT, node_id TEXT, provider TEXT, model TEXT, workflow_id TEXT, error TEXT, logs TEXT, status TEXT, created_at TEXT, started_at TEXT, completed_at TEXT, cost REAL, duration REAL, hardware TEXT, input_tokens INTEGER, output_tokens INTEGER)"
    );

    const runner = new MigrationRunner(adapter);
    await runner.migrate();

    // All tables should exist after migration
    expect(await adapter.tableExists("nodetool_secrets")).toBe(true);
    expect(await adapter.tableExists("nodetool_workspaces")).toBe(true);
    expect(await adapter.tableExists("run_state")).toBe(true);
    expect(await adapter.tableExists("run_events")).toBe(true);
    expect(await adapter.tableExists("run_leases")).toBe(true);

    // Verify status shows everything applied
    const status = await runner.status();
    expect(status.pending).toHaveLength(0);
    expect(status.applied.length).toBe(EXPECTED_BUILT_IN_MIGRATION_COUNT);
  });
});
